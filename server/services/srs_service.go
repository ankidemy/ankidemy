package services

import (
    "errors"
    "fmt"
    "time"
    "math"
    "log"
    "strings"
    "myapp/server/dao"
    "myapp/server/models"
    "gorm.io/gorm"
)

// SRSService is the main service for spaced repetition functionality
type SRSService struct {
	db               *gorm.DB
	srsDao           *dao.SRSDao
	srAlgorithm      *SpacedRepetitionService
	creditService    *CreditPropagationService
	optimizationService *ReviewOptimizationService
}

// NewSRSService creates a new SRS service instance
func NewSRSService(db *gorm.DB) *SRSService {
	return &SRSService{
		db:                  db,
		srsDao:              dao.NewSRSDao(db),
		srAlgorithm:         NewSpacedRepetitionService(),
		creditService:       NewCreditPropagationService(),
		optimizationService: NewReviewOptimizationService(),
	}
}

// normalize types for different subsystems
// Progress table stores meta-exercises under 'exercise' for legacy compatibility
func toProgressType(t string) string {
    if t == "meta_exercise" {
        return "exercise"
    }
    return t
}

// Graph (prerequisites) uses 'meta_exercise' as the node type for exercise pools
func toGraphType(t string) string {
    if t == "exercise" {
        return "meta_exercise"
    }
    return t
}

// SubmitReview processes an explicit review and handles credit propagation
func (s *SRSService) SubmitReview(userID uint, request *models.ReviewRequest) (*models.ReviewResponse, error) {
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Get current progress
	progress, err := s.srsDao.GetUserProgress(userID, request.NodeID, request.NodeType)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to get user progress: %w", err)
	}

	// Initialize progress if doesn't exist
	if progress == nil {
		progress = &models.UserNodeProgress{
			UserID:            userID,
			NodeID:            request.NodeID,
			NodeType:          request.NodeType,
			Status:            "fresh",
			EasinessFactor:    2.5,
			IntervalDays:      0,
			Repetitions:       0,
			AccumulatedCredit: 0,
			CreditPostponed:   false,
			TotalReviews:      0,
			SuccessfulReviews: 0,
		}
	}

	// Verify node is in reviewable state
	if progress.Status != "grasped" {
		tx.Rollback()
		return nil, fmt.Errorf("cannot review node in status: %s. Only 'grasped' nodes can be reviewed", progress.Status)
	}

	// Get domain ID for graph building
	domainID, err := s.getDomainIDForNode(request.NodeID, request.NodeType)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to get domain ID: %w", err)
	}

	// Build graph and calculate credit propagation
	prerequisites, err := s.srsDao.GetPrerequisitesByDomain(domainID)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to get prerequisites: %w", err)
	}

	graph := s.creditService.BuildGraph(prerequisites)
    credits := s.creditService.PropagateCredit(request.NodeID, request.NodeType, request.Success, graph)

	// Apply credits to all affected nodes
    updatedNodes, err := s.applyCredits(tx, userID, credits, request.Quality, time.Now())
    if err != nil {
        tx.Rollback()
        return nil, fmt.Errorf("failed to apply credits: %w", err)
    }

    // For meta exercises: record version outcome stats (best-effort, outside main credit path)
    if request.NodeType == "exercise" && request.VersionID != nil {
        // resolve meta id equals NodeID
        metaSvc := NewMetaExerciseService(s.db)
        // We don't have version difficulty here reliably, but we can fetch it
        var version models.Exercise
        if err := s.db.Select("difficulty").First(&version, *request.VersionID).Error; err == nil {
            d := version.Difficulty
            go metaSvc.RecordVersionOutcome(userID, request.NodeID, request.VersionID, request.Success, &d)
        } else {
            go metaSvc.RecordVersionOutcome(userID, request.NodeID, request.VersionID, request.Success, nil)
        }
    }

	// Record review history
	if err := s.recordReviewHistory(tx, userID, request, progress); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to record review history: %w", err)
	}

	// Update session if provided
	if request.SessionID != nil {
		if err := s.updateSessionStats(tx, *request.SessionID, request.Success); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to update session: %w", err)
		}

		if err := s.recordSessionReview(tx, request, time.Now()); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to record session review: %w", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &models.ReviewResponse{
		Success:      true,
		Message:      "Review submitted successfully",
		UpdatedNodes: updatedNodes,
		CreditFlow:   credits,
	}, nil
}

// Enhanced applyCredits with better error handling
func (s *SRSService) applyCredits(tx *gorm.DB, userID uint, credits []models.CreditUpdate, quality int, currentTime time.Time) ([]models.UserNodeProgress, error) {
    var updatedNodes []models.UserNodeProgress
    srsDao := dao.NewSRSDao(tx)
    var warnings []string

    // Deduplicate credits per node for this single review to ensure only one
    // contribution per node. Prefer explicit over implicit; for implicit duplicates,
    // keep the one with the larger absolute credit.
    dedup := make(map[string]models.CreditUpdate)
    order := make([]string, 0, len(credits))
    for _, cr := range credits {
        key := fmt.Sprintf("%s_%d", cr.NodeType, cr.NodeID)
        if existing, ok := dedup[key]; ok {
            if cr.Type == "explicit" || (existing.Type != "explicit" && math.Abs(cr.Credit) > math.Abs(existing.Credit)) {
                dedup[key] = cr
            }
            continue
        }
        dedup[key] = cr
        order = append(order, key)
    }

    for _, key := range order {
        credit := dedup[key]
        // Normalize node type for progress table lookups/writes
        normType := toProgressType(credit.NodeType)

        // Get or create progress
        progress, err := srsDao.GetUserProgress(userID, credit.NodeID, normType)
        if err != nil {
            return nil, err
        }

        if progress == nil {
            // For implicit reviews, only apply to nodes that already have progress
            if credit.Type == "implicit" {
                continue
            }

            // Create new progress for explicit review
            progress = &models.UserNodeProgress{
                UserID:            userID,
                NodeID:            credit.NodeID,
                NodeType:          normType,
                Status:            "grasped",
                EasinessFactor:    2.5,
                IntervalDays:      0,
                Repetitions:       0,
                AccumulatedCredit: 0,
                CreditPostponed:   false,
                TotalReviews:      0,
                SuccessfulReviews: 0,
            }
        }

        // Only apply credits to 'grasped' nodes
        if progress.Status != "grasped" {
            continue
        }

        // Check if review is due - if so, reset credits
        if progress.NextReview != nil && progress.NextReview.Before(currentTime) {
            progress.AccumulatedCredit = 0
            progress.CreditPostponed = false
        }

        if credit.Type == "explicit" {
            // Full review - update SRS parameters
            srResult := s.srAlgorithm.CalculateNextInterval(progress, quality, currentTime)

            progress.EasinessFactor = srResult.EasinessFactor
            progress.IntervalDays = srResult.IntervalDays
            progress.Repetitions = srResult.Repetitions
            progress.LastReview = &currentTime
            progress.NextReview = &srResult.NextReview
            progress.TotalReviews++
            if quality >= 3 {
                progress.SuccessfulReviews++
                // Set block to prevent negative implicit credit from anticipating until NextReview
                progress.BlockNegativeUntil = progress.NextReview
            } else {
                // Clear block on explicit failure to allow anticipation
                progress.BlockNegativeUntil = nil
            }
            progress.AccumulatedCredit = 0
            progress.CreditPostponed = false

        } else {
            // Implicit review - handle credit accumulation with enhanced bounds checking

            // Check if negative credit is blocked before processing
            if credit.Credit < 0 && progress.BlockNegativeUntil != nil && currentTime.Before(*progress.BlockNegativeUntil) {
                // Block is active - skip this negative credit entirely
                log.Printf("[SRS] Negative implicit credit blocked for node %d (type: %s). Block active until %s (current: %s)",
                    credit.NodeID, credit.NodeType,
                    progress.BlockNegativeUntil.Format(time.RFC3339),
                    currentTime.Format(time.RFC3339))
                // Skip updating this node - continue to next credit
                continue
            }

            // Reset implicit credits if more than 12 hours have passed since last update.
            // This prevents long-term farming while avoiding calendar/day-boundary pitfalls.
            if progress.UpdatedAt.Before(currentTime.Add(-12 * time.Hour)) {
                progress.AccumulatedCredit = 0
                progress.CreditPostponed = false
            }

            originalCredit := progress.AccumulatedCredit
            newCredit := progress.AccumulatedCredit + credit.Credit
            creditPostponed := progress.CreditPostponed

            // Apply strict bounds checking to prevent database constraint violations
            boundedCredit := math.Max(-1.0, math.Min(1.0, newCredit))

            // Check if we hit the bounds and log a warning
            if newCredit != boundedCredit {
                warningMsg := fmt.Sprintf("Credit limit reached for node %d (type: %s). Original: %.3f, Attempted: %.3f, Applied: %.3f",
                    credit.NodeID, credit.NodeType, originalCredit, newCredit, boundedCredit)
                warnings = append(warnings, warningMsg)
                // Log for debugging
                log.Printf("Credit limit warning: %s", warningMsg)
            }

            newCredit = boundedCredit

            // Handle positive credits (successful implicit reviews)
            if credit.Credit > 0 && !creditPostponed {
                if newCredit >= 1.0 {
                    // Reached +100% credit - postpone the review
                    newCredit = 1.0
                    creditPostponed = true

                    // Calculate next review based on current SR parameters
                    srResult := s.srAlgorithm.CalculateNextInterval(progress, 4, currentTime) // Default "good" quality
                    progress.NextReview = &srResult.NextReview
                    progress.Repetitions = srResult.Repetitions
                    progress.IntervalDays = srResult.IntervalDays
                    // Note: Do not extend BlockNegativeUntil when positive credit postpones
                }
            }

            // Handle negative credits (failed implicit reviews)
            if credit.Credit < 0 {
                if newCredit <= -1.0 {
                    // Reached -100% credit - anticipate the review to today
                    newCredit = -1.0
                    progress.NextReview = &currentTime
                }
            }

            // Final assignment with bounds checking
            progress.AccumulatedCredit = math.Max(-1.0, math.Min(1.0, newCredit))
            progress.CreditPostponed = creditPostponed
        }

        // Save progress with error handling
        if err := srsDao.CreateOrUpdateProgress(progress); err != nil {
            // Check if it's a constraint violation
            if strings.Contains(err.Error(), "user_node_progress_accumulated_credit_check") {
                // This should not happen with our bounds checking, but handle gracefully
                log.Printf("Constraint violation despite bounds checking for node %d: %v", credit.NodeID, err)
                // Force the credit to be within bounds and try again
                progress.AccumulatedCredit = math.Max(-1.0, math.Min(1.0, progress.AccumulatedCredit))
                if err := srsDao.CreateOrUpdateProgress(progress); err != nil {
                    return nil, fmt.Errorf("failed to save progress for node %d after bounds correction: %w", credit.NodeID, err)
                }
            } else {
                return nil, fmt.Errorf("failed to save progress for node %d: %w", credit.NodeID, err)
            }
        }

        updatedNodes = append(updatedNodes, *progress)
    }

    // If there were warnings, log them but don't fail the operation
    if len(warnings) > 0 {
        log.Printf("Credit application completed with %d warnings", len(warnings))
    }

    return updatedNodes, nil
}

// UpdateNodeStatus updates a node's status and handles propagation
func (s *SRSService) UpdateNodeStatus(userID uint, nodeID uint, nodeType string, status string) error {
    tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	srsDao := dao.NewSRSDao(tx)

    // Normalize type for progress table
    normProgressType := toProgressType(nodeType)

    // Get or create progress
    progress, err := srsDao.GetUserProgress(userID, nodeID, normProgressType)
    if err != nil {
        tx.Rollback()
        return err
    }

	if progress == nil {
        progress = &models.UserNodeProgress{
            UserID:            userID,
            NodeID:            nodeID,
            NodeType:          normProgressType,
            Status:            status,
            EasinessFactor:    2.5,
            IntervalDays:      0,
            Repetitions:       0,
            AccumulatedCredit: 0,
            CreditPostponed:   false,
            TotalReviews:      0,
            SuccessfulReviews: 0,
        }
    } else {
        progress.Status = status
    }

	// Save the target node progress
	if err := srsDao.CreateOrUpdateProgress(progress); err != nil {
		tx.Rollback()
		return err
	}

    // Handle status propagation (normalize to graph type for traversal)
    graphType := toGraphType(nodeType)
    if err := s.propagateStatus(tx, userID, nodeID, graphType, status); err != nil {
        tx.Rollback()
        return err
    }

	return tx.Commit().Error
}

// propagateStatus handles status propagation logic
func (s *SRSService) propagateStatus(tx *gorm.DB, userID uint, nodeID uint, nodeType string, status string) error {
	srsDao := dao.NewSRSDao(tx)

	// Get domain ID to build prerequisite graph
	domainID, err := s.getDomainIDForNode(nodeID, nodeType)
	if err != nil {
		return err
	}

	prerequisites, err := srsDao.GetPrerequisitesByDomain(domainID)
	if err != nil {
		return err
	}

	// Build maps for easier traversal
	prereqMap := make(map[string][]models.NodePrerequisite)
	dependentMap := make(map[string][]models.NodePrerequisite)

	for _, prereq := range prerequisites {
		nodeKey := fmt.Sprintf("%s_%d", prereq.NodeType, prereq.NodeID)
		prereqKey := fmt.Sprintf("%s_%d", prereq.PrerequisiteType, prereq.PrerequisiteID)

		prereqMap[nodeKey] = append(prereqMap[nodeKey], prereq)
		dependentMap[prereqKey] = append(dependentMap[prereqKey], prereq)
	}

    switch status {
    case "grasped":
        // Recursively mark prerequisites as grasped if they're fresh/tackling
        if err := s.propagateGrasped(tx, userID, nodeID, nodeType, prereqMap, make(map[string]bool)); err != nil {
            return err
        }

    case "tackling":
        // Recursively mark dependents as tackling if they're fresh/grasped
        if err := s.propagateTackling(tx, userID, nodeID, nodeType, dependentMap, make(map[string]bool)); err != nil {
            return err
        }
    }

	return nil
}

// propagateGrasped recursively marks prerequisites as grasped
func (s *SRSService) propagateGrasped(tx *gorm.DB, userID uint, nodeID uint, nodeType string, prereqMap map[string][]models.NodePrerequisite, visited map[string]bool) error {
	nodeKey := fmt.Sprintf("%s_%d", nodeType, nodeID)
	if visited[nodeKey] {
		return nil
	}
	visited[nodeKey] = true

	srsDao := dao.NewSRSDao(tx)
	prerequisites, exists := prereqMap[nodeKey]
	if !exists {
		return nil
	}

    for _, prereq := range prerequisites {
        // Normalize type for progress storage
        normType := toProgressType(prereq.PrerequisiteType)

        // Get current progress
        progress, err := srsDao.GetUserProgress(userID, prereq.PrerequisiteID, normType)
        if err != nil {
            return err
        }

		// Update status if it's fresh or tackling
        if progress == nil {
            progress = &models.UserNodeProgress{
                UserID:            userID,
                NodeID:            prereq.PrerequisiteID,
                NodeType:          normType,
                Status:            "grasped",
                EasinessFactor:    2.5,
                IntervalDays:      0,
                Repetitions:       0,
                AccumulatedCredit: 0,
                CreditPostponed:   false,
                TotalReviews:      0,
                SuccessfulReviews: 0,
            }
        } else if progress.Status == "fresh" || progress.Status == "tackling" {
            progress.Status = "grasped"
        }

		if err := srsDao.CreateOrUpdateProgress(progress); err != nil {
			return err
		}

		// Recursively propagate
		if err := s.propagateGrasped(tx, userID, prereq.PrerequisiteID, prereq.PrerequisiteType, prereqMap, visited); err != nil {
			return err
		}
	}

	return nil
}

// propagateTackling recursively marks dependents as tackling
func (s *SRSService) propagateTackling(tx *gorm.DB, userID uint, nodeID uint, nodeType string, dependentMap map[string][]models.NodePrerequisite, visited map[string]bool) error {
	nodeKey := fmt.Sprintf("%s_%d", nodeType, nodeID)
	if visited[nodeKey] {
		return nil
	}
	visited[nodeKey] = true

	srsDao := dao.NewSRSDao(tx)
	dependents, exists := dependentMap[nodeKey]
	if !exists {
		return nil
	}

    for _, dep := range dependents {
        // Normalize type for progress storage
        normType := toProgressType(dep.NodeType)

        // Get current progress
        progress, err := srsDao.GetUserProgress(userID, dep.NodeID, normType)
        if err != nil {
            return err
        }

		// Update status if it's fresh or grasped
        if progress == nil {
            progress = &models.UserNodeProgress{
                UserID:            userID,
                NodeID:            dep.NodeID,
                NodeType:          normType,
                Status:            "tackling",
                EasinessFactor:    2.5,
                IntervalDays:      0,
                Repetitions:       0,
                AccumulatedCredit: 0,
                CreditPostponed:   false,
                TotalReviews:      0,
                SuccessfulReviews: 0,
            }
        } else if progress.Status == "fresh" || progress.Status == "grasped" {
            progress.Status = "tackling"
        }

		if err := srsDao.CreateOrUpdateProgress(progress); err != nil {
			return err
		}

		// Recursively propagate
		if err := s.propagateTackling(tx, userID, dep.NodeID, dep.NodeType, dependentMap, visited); err != nil {
			return err
		}
	}

	return nil
}

// propagateFresh recursively marks dependents as fresh if they were grasped
func (s *SRSService) propagateFresh(tx *gorm.DB, userID uint, nodeID uint, nodeType string, dependentMap map[string][]models.NodePrerequisite, visited map[string]bool) error {
	nodeKey := fmt.Sprintf("%s_%d", nodeType, nodeID)
	if visited[nodeKey] {
		return nil
	}
	visited[nodeKey] = true

	srsDao := dao.NewSRSDao(tx)
	dependents, exists := dependentMap[nodeKey]
	if !exists {
		return nil
	}

    for _, dep := range dependents {
        // Normalize type for progress storage
        normType := toProgressType(dep.NodeType)

        // Get current progress
        progress, err := srsDao.GetUserProgress(userID, dep.NodeID, normType)
        if err != nil {
            return err
        }

		// Only update if it was grasped
		if progress != nil && progress.Status == "grasped" {
            progress.Status = "fresh"
            if err := srsDao.CreateOrUpdateProgress(progress); err != nil {
                return err
            }

			// Recursively propagate
			if err := s.propagateFresh(tx, userID, dep.NodeID, dep.NodeType, dependentMap, visited); err != nil {
				return err
			}
		}
	}

	return nil
}

// GetDueReviews gets optimally ordered due reviews
func (s *SRSService) GetDueReviews(userID uint, domainID uint, nodeType string) ([]models.NodeProgress, error) {
	dueNodes, err := s.srsDao.GetDueReviews(userID, domainID, nodeType)
	if err != nil {
		return nil, err
	}

	if len(dueNodes) == 0 {
		return dueNodes, nil
	}

	// Get prerequisites for optimization
	prerequisites, err := s.srsDao.GetPrerequisitesByDomain(domainID)
	if err != nil {
		return nil, err
	}

	graph := s.creditService.BuildGraph(prerequisites)
	return s.optimizationService.OptimizeReviewOrder(dueNodes, graph), nil
}

// Helper methods

func (s *SRSService) getDomainIDForNode(nodeID uint, nodeType string) (uint, error) {
	var domainID uint
	
    if nodeType == "definition" {
        var definition models.Definition
        if err := s.db.Select("domain_id").First(&definition, nodeID).Error; err != nil {
            return 0, err
        }
        domainID = definition.DomainID
    } else if nodeType == "exercise" || nodeType == "meta_exercise" {
        var meta models.MetaExercise
        if err := s.db.Select("domain_id").First(&meta, nodeID).Error; err != nil {
            return 0, err
        }
        domainID = meta.DomainID
    } else {
        return 0, errors.New("invalid node type")
    }
	
	return domainID, nil
}

func (s *SRSService) recordReviewHistory(tx *gorm.DB, userID uint, request *models.ReviewRequest, progressBefore *models.UserNodeProgress) error {
	srsDao := dao.NewSRSDao(tx)
	
	history := &models.ReviewHistory{
		UserID:                userID,
		NodeID:                request.NodeID,
		NodeType:              request.NodeType,
		ReviewType:            "explicit",
		Success:               request.Success,
		Quality:               &request.Quality,
		TimeTaken:             &request.TimeTaken,
		CreditApplied:         1.0,
		EasinessFactorBefore:  &progressBefore.EasinessFactor,
		IntervalBefore:        &progressBefore.IntervalDays,
	}

	return srsDao.CreateReviewHistory(history)
}

func (s *SRSService) updateSessionStats(tx *gorm.DB, sessionID uint, success bool) error {
	srsDao := dao.NewSRSDao(tx)
	
	session, err := srsDao.GetSession(sessionID)
	if err != nil {
		return err
	}

	session.TotalReviews++
	if success {
		session.SuccessfulReviews++
	}

	return srsDao.UpdateSession(session)
}

func (s *SRSService) recordSessionReview(tx *gorm.DB, request *models.ReviewRequest, reviewTime time.Time) error {
    if request.SessionID == nil {
        return nil
    }

    srsDao := dao.NewSRSDao(tx)

    // Normalize node type for session rows: treat meta_exercise as exercise,
    // keep definition/exercise unchanged. This avoids CHECK constraint issues
    // in environments where session_reviews still restricts node_type.
    normalizedType := request.NodeType
    if normalizedType == "meta_exercise" {
        normalizedType = "exercise"
    }

    sessionReview := &models.SessionReview{
        SessionID:     *request.SessionID,
        NodeID:        request.NodeID,
        NodeType:      normalizedType,
        ReviewType:    "explicit",
        ReviewTime:    reviewTime,
        Success:       request.Success,
        Quality:       &request.Quality,
        TimeTaken:     &request.TimeTaken,
        CreditApplied: 1.0,
    }

    return srsDao.CreateSessionReview(sessionReview)
}
