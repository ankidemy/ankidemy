package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"myapp/server/dao"
	"myapp/server/models"
)

// SRSService is the main service for spaced repetition functionality
type SRSService struct {
	db                    *gorm.DB
	srsDao                *dao.SRSDao
	settingsDAO           *dao.UserDomainSettingsDAO
	srAlgorithm           *SpacedRepetitionService
	creditService         *CreditPropagationService
	optimizationService   *ReviewOptimizationService
	notificationReadModel *NotificationReadModelService
	queryCache            *QueryCacheService
	dueCacheTTL           time.Duration
	queueCacheTTL         time.Duration
	queueCacheNormalOnly  bool
}

// NewSRSService creates a new SRS service instance
func NewSRSService(db *gorm.DB, notificationReadModel *NotificationReadModelService, queryCache *QueryCacheService) *SRSService {
	return &SRSService{
		db:                    db,
		srsDao:                dao.NewSRSDao(db),
		settingsDAO:           dao.NewUserDomainSettingsDAO(db),
		srAlgorithm:           NewSpacedRepetitionService(),
		creditService:         NewCreditPropagationService(),
		optimizationService:   NewReviewOptimizationService(),
		notificationReadModel: notificationReadModel,
		queryCache:            queryCache,
		dueCacheTTL:           envDuration("SRS_DUE_CACHE_TTL", 20*time.Second),
		queueCacheTTL:         envDuration("SRS_QUEUE_CACHE_TTL", 15*time.Second),
		queueCacheNormalOnly:  envBool("SRS_QUEUE_CACHE_NORMAL_ONLY", true),
	}
}

// normalize types for different subsystems
// Progress table stores meta-exercises under 'exercise' and meta-definitions under 'definition' for legacy compatibility
func toProgressType(t string) string {
	if t == "meta_exercise" {
		return "exercise"
	}
	if t == "meta_definition" {
		return "definition"
	}
	return t
}

// Graph (prerequisites) uses 'meta_exercise' and 'meta_definition' as the node types for pools
func toGraphType(t string) string {
	if t == "exercise" {
		return "meta_exercise"
	}
	if t == "definition" {
		return "meta_definition"
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
	algorithmConfig := DefaultSRSAlgorithmConfig()
	if settings, settingsErr := s.settingsDAO.GetOrCreate(userID, domainID); settingsErr != nil {
		log.Printf("warning: failed to load SRS settings for user %d domain %d: %v", userID, domainID, settingsErr)
	} else {
		algorithmConfig = ParseSRSAlgorithmConfig(settings.Preferences)
	}

	graph := s.creditService.BuildGraph(prerequisites)
	credits := s.creditService.PropagateCredit(request.NodeID, request.NodeType, request.Success, graph)

	// Apply credits to all affected nodes
	updatedNodes, err := s.applyCredits(tx, userID, credits, request.Quality, time.Now(), algorithmConfig)
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

	// For meta definitions: record version outcome stats (best-effort, outside main credit path)
	if request.NodeType == "definition" && request.VersionID != nil {
		metaDefSvc := NewMetaDefinitionService(s.db)
		go metaDefSvc.RecordVersionOutcome(userID, request.NodeID, request.VersionID, request.Success)
	}

	// Record review history
	if err := s.recordReviewHistory(tx, userID, request, progress); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to record review history: %w", err)
	}

	// Keep notification read model in sync with write transaction.
	if s.notificationReadModel != nil {
		if err := s.notificationReadModel.EnqueueDomainDueRefreshTx(tx, userID, domainID); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to enqueue due projection refresh: %w", err)
		}
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

	s.invalidateDueCache(userID, domainID)
	s.invalidateQueueCache(userID, domainID)

	return &models.ReviewResponse{
		Success:      true,
		Message:      "Review submitted successfully",
		UpdatedNodes: updatedNodes,
		CreditFlow:   credits,
	}, nil
}

// Enhanced applyCredits with better error handling
func (s *SRSService) applyCredits(
	tx *gorm.DB,
	userID uint,
	credits []models.CreditUpdate,
	quality int,
	currentTime time.Time,
	algorithmConfig SRSAlgorithmConfig,
) ([]models.UserNodeProgress, error) {
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
			srResult := s.srAlgorithm.CalculateNextInterval(progress, quality, currentTime, algorithmConfig)

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
					srResult := s.srAlgorithm.CalculateNextInterval(progress, 4, currentTime, algorithmConfig) // Default "good" quality
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

	domainID, err := s.getDomainIDForNode(nodeID, nodeType)
	if err != nil {
		tx.Rollback()
		return err
	}

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

	if s.notificationReadModel != nil {
		if err := s.notificationReadModel.EnqueueDomainDueRefreshTx(tx, userID, domainID); err != nil {
			tx.Rollback()
			return err
		}
	}

	if err := tx.Commit().Error; err != nil {
		return err
	}

	s.invalidateDueCache(userID, domainID)
	s.invalidateQueueCache(userID, domainID)

	return nil
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

const (
	srsDueRoutePath         = "/api/srs/domains/:domainId/due"
	srsReviewQueueRoutePath = "/api/srs/domains/:domainId/review-queue"
)

type reviewQueueGraphCache struct {
	loaded bool
	graph  map[string]*GraphNode
}

func (s *SRSService) dueCacheKey(userID uint, domainID uint, nodeType string, view string) string {
	return fmt.Sprintf("srs:due:user:%d:domain:%d:type:%s:view:%s:v1", userID, domainID, nodeType, view)
}

func (s *SRSService) queueCacheKey(userID uint, domainID uint, sessionType string, mode string, exercisesPerDefinition int) string {
	return fmt.Sprintf("srs:queue:user:%d:domain:%d:session:%s:mode:%s:ex:%d:v1", userID, domainID, sessionType, mode, exercisesPerDefinition)
}

func (s *SRSService) dueUserDomainTag(userID uint, domainID uint) string {
	return fmt.Sprintf("srs:due:user:%d:domain:%d", userID, domainID)
}

func (s *SRSService) dueUserTag(userID uint) string {
	return fmt.Sprintf("srs:due:user:%d", userID)
}

func (s *SRSService) dueDomainTag(domainID uint) string {
	return fmt.Sprintf("srs:due:domain:%d", domainID)
}

func (s *SRSService) queueUserDomainTag(userID uint, domainID uint) string {
	return fmt.Sprintf("srs:queue:user:%d:domain:%d", userID, domainID)
}

func (s *SRSService) queueDomainTag(domainID uint) string {
	return fmt.Sprintf("srs:queue:domain:%d", domainID)
}

func (s *SRSService) invalidateCacheTags(tags ...string) {
	if s == nil || s.queryCache == nil {
		return
	}
	for _, tag := range tags {
		if strings.TrimSpace(tag) == "" {
			continue
		}
		if err := s.queryCache.InvalidateTag(context.Background(), tag); err != nil {
			log.Printf("warning: cache tag invalidation failed for tag=%s: %v", tag, err)
		}
	}
}

func (s *SRSService) invalidateDueCache(userID uint, domainID uint) {
	s.invalidateCacheTags(
		s.dueUserDomainTag(userID, domainID),
		s.dueUserTag(userID),
	)
}

func (s *SRSService) invalidateQueueCache(userID uint, domainID uint) {
	s.invalidateCacheTags(s.queueUserDomainTag(userID, domainID))
}

func (s *SRSService) invalidateDomainDueCache(domainID uint) {
	s.invalidateCacheTags(s.dueDomainTag(domainID))
}

func (s *SRSService) invalidateDomainQueueCache(domainID uint) {
	s.invalidateCacheTags(s.queueDomainTag(domainID))
}

// InvalidateDomainReviewCaches clears due/queue cache entries for all users in a domain.
func (s *SRSService) InvalidateDomainReviewCaches(domainID uint) {
	s.invalidateDomainDueCache(domainID)
	s.invalidateDomainQueueCache(domainID)
}

func envBool(key string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return parsed
}

func (s *SRSService) getDueReviewsOptimized(
	userID uint,
	domainID uint,
	nodeType string,
	requestID string,
	route string,
	serviceMethod string,
	fetchStage string,
	logFetchStage bool,
	logDueOptimizationStages bool,
) ([]models.NodeProgress, error) {
	if fetchStage == "" {
		fetchStage = "fetch_due_rows"
	}

	fetchDueRowsStartedAt := time.Now()
	dueNodes, err := s.srsDao.GetDueReviews(userID, domainID, nodeType, requestID, route, fetchStage)
	if logFetchStage {
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			fetchStage,
			fetchDueRowsStartedAt,
			err,
			map[string]interface{}{
				"userId":    userID,
				"domainId":  domainID,
				"nodeType":  nodeType,
				"dueCount":  len(dueNodes),
				"routeUsed": route,
			},
		)
	}
	if err != nil {
		return nil, err
	}

	return s.optimizeDueReviews(
		dueNodes,
		userID,
		domainID,
		nodeType,
		requestID,
		route,
		serviceMethod,
		logDueOptimizationStages,
	)
}

func (s *SRSService) getDueReviewsCompactOptimized(
	userID uint,
	domainID uint,
	nodeType string,
	requestID string,
	route string,
	serviceMethod string,
	fetchStage string,
	logFetchStage bool,
	logDueOptimizationStages bool,
) ([]models.DueReviewCompact, error) {
	if fetchStage == "" {
		fetchStage = "fetch_due_rows"
	}

	fetchDueRowsStartedAt := time.Now()
	dueNodes, err := s.srsDao.GetDueReviewsCompact(userID, domainID, nodeType, requestID, route, fetchStage)
	if logFetchStage {
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			fetchStage,
			fetchDueRowsStartedAt,
			err,
			map[string]interface{}{
				"userId":    userID,
				"domainId":  domainID,
				"nodeType":  nodeType,
				"dueCount":  len(dueNodes),
				"routeUsed": route,
			},
		)
	}
	if err != nil {
		return nil, err
	}

	optimized, err := s.optimizeDueReviews(
		compactDueReviewsToNodeProgress(dueNodes),
		userID,
		domainID,
		nodeType,
		requestID,
		route,
		serviceMethod,
		logDueOptimizationStages,
	)
	if err != nil {
		return nil, err
	}

	return nodeProgressToCompactDueReviews(optimized), nil
}

func (s *SRSService) optimizeDueReviews(
	dueNodes []models.NodeProgress,
	userID uint,
	domainID uint,
	nodeType string,
	requestID string,
	route string,
	serviceMethod string,
	logDueOptimizationStages bool,
) ([]models.NodeProgress, error) {
	if len(dueNodes) == 0 {
		return dueNodes, nil
	}

	var err error
	loadPrerequisitesStartedAt := time.Now()
	var prerequisites []models.NodePrerequisite
	if logDueOptimizationStages {
		prerequisites, err = s.srsDao.GetPrerequisitesByDomainObserved(domainID, requestID, route, "load_prerequisites")
	} else {
		prerequisites, err = s.srsDao.GetPrerequisitesByDomain(domainID)
	}
	if logDueOptimizationStages {
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"load_prerequisites",
			loadPrerequisitesStartedAt,
			err,
			map[string]interface{}{
				"userId":            userID,
				"domainId":          domainID,
				"nodeType":          nodeType,
				"prerequisiteCount": len(prerequisites),
			},
		)
	}
	if err != nil {
		return nil, err
	}

	buildGraphStartedAt := time.Now()
	graph := s.creditService.BuildGraph(prerequisites)
	if logDueOptimizationStages {
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"build_graph",
			buildGraphStartedAt,
			nil,
			map[string]interface{}{
				"userId":    userID,
				"domainId":  domainID,
				"nodeType":  nodeType,
				"graphSize": len(graph),
			},
		)
	}

	optimizeOrderStartedAt := time.Now()
	ordered := s.optimizationService.OptimizeReviewOrder(dueNodes, graph)
	if logDueOptimizationStages {
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"optimize_order",
			optimizeOrderStartedAt,
			nil,
			map[string]interface{}{
				"userId":      userID,
				"domainId":    domainID,
				"nodeType":    nodeType,
				"inputCount":  len(dueNodes),
				"outputCount": len(ordered),
			},
		)
	}
	return ordered, nil
}

func compactDueReviewsToNodeProgress(dueNodes []models.DueReviewCompact) []models.NodeProgress {
	if len(dueNodes) == 0 {
		return []models.NodeProgress{}
	}

	result := make([]models.NodeProgress, 0, len(dueNodes))
	for _, dueNode := range dueNodes {
		result = append(result, models.NodeProgress{
			NodeID:     dueNode.NodeID,
			NodeType:   dueNode.NodeType,
			NodeCode:   dueNode.NodeCode,
			NodeName:   dueNode.NodeName,
			Status:     dueNode.Status,
			NextReview: dueNode.NextReview,
			IsDue:      dueNode.IsDue,
		})
	}
	return result
}

func nodeProgressToCompactDueReviews(dueNodes []models.NodeProgress) []models.DueReviewCompact {
	if len(dueNodes) == 0 {
		return []models.DueReviewCompact{}
	}

	result := make([]models.DueReviewCompact, 0, len(dueNodes))
	for _, dueNode := range dueNodes {
		result = append(result, models.DueReviewCompact{
			NodeID:     dueNode.NodeID,
			NodeType:   dueNode.NodeType,
			NodeCode:   dueNode.NodeCode,
			NodeName:   dueNode.NodeName,
			Status:     dueNode.Status,
			NextReview: dueNode.NextReview,
			IsDue:      dueNode.IsDue,
		})
	}
	return result
}

// GetDueReviews gets optimally ordered due reviews.
func (s *SRSService) GetDueReviews(userID uint, domainID uint, nodeType string, requestID string) ([]models.NodeProgress, error) {
	const serviceMethod = "SRSService.GetDueReviews"
	cacheKey := s.dueCacheKey(userID, domainID, nodeType, "full")
	policy := CachePolicy{
		TTL: s.dueCacheTTL,
		Tags: []string{
			s.dueUserDomainTag(userID, domainID),
			s.dueUserTag(userID),
			s.dueDomainTag(domainID),
		},
	}
	return CacheGetOrLoadJSON(context.Background(), s.queryCache, cacheKey, policy, requestID, srsDueRoutePath, func(_ context.Context) ([]models.NodeProgress, error) {
		return s.getDueReviewsOptimized(
			userID,
			domainID,
			nodeType,
			requestID,
			srsDueRoutePath,
			serviceMethod,
			"fetch_due_rows",
			true,
			true,
		)
	})
}

// GetDueReviewsCompact gets optimally ordered due reviews in compact response shape.
func (s *SRSService) GetDueReviewsCompact(userID uint, domainID uint, nodeType string, requestID string) ([]models.DueReviewCompact, error) {
	const serviceMethod = "SRSService.GetDueReviewsCompact"
	cacheKey := s.dueCacheKey(userID, domainID, nodeType, "compact")
	policy := CachePolicy{
		TTL: s.dueCacheTTL,
		Tags: []string{
			s.dueUserDomainTag(userID, domainID),
			s.dueUserTag(userID),
			s.dueDomainTag(domainID),
		},
	}
	return CacheGetOrLoadJSON(context.Background(), s.queryCache, cacheKey, policy, requestID, srsDueRoutePath, func(_ context.Context) ([]models.DueReviewCompact, error) {
		return s.getDueReviewsCompactOptimized(
			userID,
			domainID,
			nodeType,
			requestID,
			srsDueRoutePath,
			serviceMethod,
			"fetch_due_rows",
			true,
			true,
		)
	})
}

// GetReviewQueue builds a review queue for practice/mixed sessions.
func (s *SRSService) GetReviewQueue(userID uint, domainID uint, sessionType string, mode string, exercisesPerDefinition int, requestID string) (queue []models.ReviewQueueItem, err error) {
	const route = srsReviewQueueRoutePath
	const serviceMethod = "SRSService.GetReviewQueue"

	if exercisesPerDefinition <= 0 {
		exercisesPerDefinition = 1
	}

	queue = make([]models.ReviewQueueItem, 0)

	assembleQueueStartedAt := time.Now()
	defer func() {
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"assemble_queue",
			assembleQueueStartedAt,
			err,
			map[string]interface{}{
				"userId":                 userID,
				"domainId":               domainID,
				"sessionType":            sessionType,
				"mode":                   mode,
				"exercisesPerDefinition": exercisesPerDefinition,
				"queueCount":             len(queue),
			},
		)
	}()

	if s.shouldCacheReviewQueue(mode) {
		cacheKey := s.queueCacheKey(userID, domainID, sessionType, mode, exercisesPerDefinition)
		policy := CachePolicy{
			TTL: s.queueCacheTTL,
			Tags: []string{
				s.queueUserDomainTag(userID, domainID),
				s.queueDomainTag(domainID),
			},
		}
		queue, err = CacheGetOrLoadJSON(context.Background(), s.queryCache, cacheKey, policy, requestID, route, func(_ context.Context) ([]models.ReviewQueueItem, error) {
			return s.buildReviewQueue(userID, domainID, sessionType, mode, exercisesPerDefinition, requestID)
		})
		return queue, err
	}

	queue, err = s.buildReviewQueue(userID, domainID, sessionType, mode, exercisesPerDefinition, requestID)
	return queue, err
}

func (s *SRSService) buildReviewQueue(userID uint, domainID uint, sessionType string, mode string, exercisesPerDefinition int, requestID string) ([]models.ReviewQueueItem, error) {
	const route = srsReviewQueueRoutePath
	const serviceMethod = "SRSService.GetReviewQueue"

	isFrenzy := mode == "frenzy"
	now := time.Now()
	queue := make([]models.ReviewQueueItem, 0)
	graphCache := &reviewQueueGraphCache{}
	metaSvc := NewMetaExerciseService(s.db)

	// ========================================================================
	// DEFINITION SESSION
	// ========================================================================
	if sessionType == "definition" {
		defs, err := s.loadDueReviewsForQueue(userID, domainID, "definition", requestID, route, serviceMethod, "load_due_definitions", graphCache)
		if err != nil {
			return nil, err
		}

		if len(defs) == 0 {
			loadFallbackStartedAt := time.Now()
			defs, err = s.srsDao.GetGraspedDefinitions(userID, domainID, requestID, route, "load_grasped_fallback")
			logServiceStage(
				requestID,
				route,
				serviceMethod,
				"load_grasped_fallback",
				loadFallbackStartedAt,
				err,
				map[string]interface{}{
					"userId":         userID,
					"domainId":       domainID,
					"fallbackSource": "grasped_definitions",
					"resultCount":    len(defs),
				},
			)
			if err != nil {
				return nil, err
			}
		}

		for _, def := range defs {
			queue = append(queue, models.ReviewQueueItem{
				NodeID:   def.NodeID,
				NodeType: def.NodeType,
				NodeCode: def.NodeCode,
				NodeName: def.NodeName,
				IsDue:    def.IsDue,
			})
		}
		return queue, nil
	}

	// ========================================================================
	// EXERCISE SESSION
	// ========================================================================
	if sessionType == "exercise" {
		exercises, err := s.loadDueReviewsForQueue(userID, domainID, "exercise", requestID, route, serviceMethod, "load_due_exercises", graphCache)
		if err != nil {
			return nil, err
		}

		if len(exercises) == 0 {
			if isFrenzy {
				loadFallbackStartedAt := time.Now()
				exercises, err = s.srsDao.GetGraspedExercises(userID, domainID, requestID, route, "load_grasped_fallback")
				logServiceStage(
					requestID,
					route,
					serviceMethod,
					"load_grasped_fallback",
					loadFallbackStartedAt,
					err,
					map[string]interface{}{
						"userId":         userID,
						"domainId":       domainID,
						"fallbackSource": "grasped_exercises",
						"resultCount":    len(exercises),
					},
				)
				if err != nil {
					return nil, err
				}
			} else {
				loadFallbackStartedAt := time.Now()
				defs, err := s.srsDao.GetDefinitionsWithSuccessfulReviews(userID, domainID, requestID, route, "load_grasped_fallback")
				logServiceStage(
					requestID,
					route,
					serviceMethod,
					"load_grasped_fallback",
					loadFallbackStartedAt,
					err,
					map[string]interface{}{
						"userId":         userID,
						"domainId":       domainID,
						"fallbackSource": "definitions_with_successful_reviews",
						"resultCount":    len(defs),
					},
				)
				if err != nil {
					return nil, err
				}

				definitionIDs := make([]uint, 0, len(defs))
				for _, def := range defs {
					definitionIDs = append(definitionIDs, def.NodeID)
				}

				selectExercisesStartedAt := time.Now()
				selectedByDef, err := metaSvc.SelectExercisesForDefinitions(userID, definitionIDs, exercisesPerDefinition)
				selectedExercises := 0
				if err == nil {
					for _, metas := range selectedByDef {
						selectedExercises += len(metas)
					}
				}
				logServiceStage(
					requestID,
					route,
					serviceMethod,
					"select_exercises_batch",
					selectExercisesStartedAt,
					err,
					map[string]interface{}{
						"userId":             userID,
						"domainId":           domainID,
						"definitionCount":    len(defs),
						"selectedMetaCount":  selectedExercises,
						"perDefinitionCount": exercisesPerDefinition,
					},
				)
				if err != nil {
					return nil, err
				}

				progressByMetaID, err := s.loadSelectedExerciseProgress(userID, selectedByDef)
				if err != nil {
					return nil, err
				}

				for _, def := range defs {
					metas := selectedByDef[def.NodeID]
					for _, meta := range metas {
						progress, exists := progressByMetaID[meta.ID]
						isDue := isExerciseProgressDue(progress, exists, now)
						queue = append(queue, models.ReviewQueueItem{
							NodeID:           def.NodeID,
							NodeType:         def.NodeType,
							NodeCode:         def.NodeCode,
							NodeName:         def.NodeName,
							IsDue:            isDue,
							ExerciseMetaID:   &meta.ID,
							ExerciseMetaCode: &meta.Code,
							ExerciseMetaName: &meta.Name,
						})
					}
				}
				return queue, nil
			}
		}

		for _, ex := range exercises {
			queue = append(queue, models.ReviewQueueItem{
				NodeID:           ex.NodeID,
				NodeType:         "exercise",
				NodeCode:         ex.NodeCode,
				NodeName:         ex.NodeName,
				IsDue:            ex.IsDue,
				ExerciseMetaID:   &ex.NodeID,
				ExerciseMetaCode: &ex.NodeCode,
				ExerciseMetaName: &ex.NodeName,
			})
		}
		return queue, nil
	}

	// ========================================================================
	// MIXED SESSION
	// ========================================================================
	dueDefs, err := s.loadDueReviewsForQueue(userID, domainID, "definition", requestID, route, serviceMethod, "load_due_definitions", graphCache)
	if err != nil {
		return nil, err
	}
	dueExs, err := s.loadDueReviewsForQueue(userID, domainID, "exercise", requestID, route, serviceMethod, "load_due_exercises", graphCache)
	if err != nil {
		return nil, err
	}

	var defs []models.NodeProgress
	usingGrasped := false

	hasDueItems := len(dueDefs) > 0 || len(dueExs) > 0
	if hasDueItems {
		defs = dueDefs
	} else {
		loadFallbackStartedAt := time.Now()
		if isFrenzy {
			defs, err = s.srsDao.GetGraspedDefinitions(userID, domainID, requestID, route, "load_grasped_fallback")
		} else {
			defs, err = s.srsDao.GetDefinitionsWithSuccessfulReviews(userID, domainID, requestID, route, "load_grasped_fallback")
		}
		fallbackSource := "definitions_with_successful_reviews"
		if isFrenzy {
			fallbackSource = "grasped_definitions"
		}
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"load_grasped_fallback",
			loadFallbackStartedAt,
			err,
			map[string]interface{}{
				"userId":         userID,
				"domainId":       domainID,
				"fallbackSource": fallbackSource,
				"resultCount":    len(defs),
			},
		)
		if err != nil {
			return nil, err
		}
		usingGrasped = true
	}

	if usingGrasped && len(defs) > 1 {
		rand.Seed(time.Now().UnixNano())
		rand.Shuffle(len(defs), func(i, j int) { defs[i], defs[j] = defs[j], defs[i] })
	}

	definitionIDs := make([]uint, 0, len(defs))
	for _, def := range defs {
		definitionIDs = append(definitionIDs, def.NodeID)
	}

	selectExercisesStartedAt := time.Now()
	selectedByDef, err := metaSvc.SelectExercisesForDefinitions(userID, definitionIDs, exercisesPerDefinition)
	selectedExercises := 0
	if err == nil {
		for _, metas := range selectedByDef {
			selectedExercises += len(metas)
		}
	}
	logServiceStage(
		requestID,
		route,
		serviceMethod,
		"select_exercises_batch",
		selectExercisesStartedAt,
		err,
		map[string]interface{}{
			"userId":             userID,
			"domainId":           domainID,
			"definitionCount":    len(defs),
			"selectedMetaCount":  selectedExercises,
			"perDefinitionCount": exercisesPerDefinition,
		},
	)
	if err != nil {
		return nil, err
	}

	progressByMetaID, err := s.loadSelectedExerciseProgress(userID, selectedByDef)
	if err != nil {
		return nil, err
	}

	for _, def := range defs {
		metas := selectedByDef[def.NodeID]
		if len(metas) == 0 {
			queue = append(queue, models.ReviewQueueItem{
				NodeID:   def.NodeID,
				NodeType: def.NodeType,
				NodeCode: def.NodeCode,
				NodeName: def.NodeName,
				IsDue:    def.IsDue,
			})
			continue
		}

		if def.IsDue {
			queue = append(queue, models.ReviewQueueItem{
				NodeID:   def.NodeID,
				NodeType: def.NodeType,
				NodeCode: def.NodeCode,
				NodeName: def.NodeName,
				IsDue:    def.IsDue,
			})
		}

		for _, meta := range metas {
			progress, exists := progressByMetaID[meta.ID]
			exerciseIsDue := isExerciseProgressDue(progress, exists, now)
			queue = append(queue, models.ReviewQueueItem{
				NodeID:           def.NodeID,
				NodeType:         def.NodeType,
				NodeCode:         def.NodeCode,
				NodeName:         def.NodeName,
				IsDue:            exerciseIsDue,
				ExerciseMetaID:   &meta.ID,
				ExerciseMetaCode: &meta.Code,
				ExerciseMetaName: &meta.Name,
			})
		}
	}

	if !usingGrasped && len(dueExs) > 0 {
		addedExercises := make(map[uint]bool)
		for _, item := range queue {
			if item.ExerciseMetaID != nil {
				addedExercises[*item.ExerciseMetaID] = true
			}
		}

		for _, ex := range dueExs {
			if !addedExercises[ex.NodeID] {
				queue = append(queue, models.ReviewQueueItem{
					NodeID:           ex.NodeID,
					NodeType:         "exercise",
					NodeCode:         ex.NodeCode,
					NodeName:         ex.NodeName,
					IsDue:            true,
					ExerciseMetaID:   &ex.NodeID,
					ExerciseMetaCode: &ex.NodeCode,
					ExerciseMetaName: &ex.NodeName,
				})
			}
		}
	}

	return queue, nil
}

func (s *SRSService) shouldCacheReviewQueue(mode string) bool {
	if s.queueCacheTTL <= 0 {
		return false
	}
	if mode == "normal" {
		return true
	}
	if mode == "frenzy" && !s.queueCacheNormalOnly {
		return true
	}
	return false
}

func (s *SRSService) loadDueReviewsForQueue(
	userID uint,
	domainID uint,
	nodeType string,
	requestID string,
	route string,
	serviceMethod string,
	stage string,
	graphCache *reviewQueueGraphCache,
) ([]models.NodeProgress, error) {
	loadStartedAt := time.Now()
	dueNodes, err := s.srsDao.GetDueReviews(userID, domainID, nodeType, requestID, route, stage)
	if err == nil {
		dueNodes, err = s.optimizeDueReviewsWithQueueGraph(domainID, dueNodes, graphCache)
	}
	logServiceStage(
		requestID,
		route,
		serviceMethod,
		stage,
		loadStartedAt,
		err,
		map[string]interface{}{
			"userId":    userID,
			"domainId":  domainID,
			"dueCount":  len(dueNodes),
			"nodeType":  nodeType,
			"routeUsed": route,
		},
	)
	if err != nil {
		return nil, err
	}
	return dueNodes, nil
}

func (s *SRSService) optimizeDueReviewsWithQueueGraph(
	domainID uint,
	dueNodes []models.NodeProgress,
	graphCache *reviewQueueGraphCache,
) ([]models.NodeProgress, error) {
	if len(dueNodes) == 0 {
		return dueNodes, nil
	}
	if graphCache == nil {
		return dueNodes, nil
	}
	if !graphCache.loaded {
		prerequisites, err := s.srsDao.GetPrerequisitesByDomain(domainID)
		if err != nil {
			return nil, err
		}
		graphCache.graph = s.creditService.BuildGraph(prerequisites)
		graphCache.loaded = true
	}
	return s.optimizationService.OptimizeReviewOrder(dueNodes, graphCache.graph), nil
}

func (s *SRSService) loadSelectedExerciseProgress(userID uint, selectedByDef map[uint][]models.MetaExercise) (map[uint]models.UserNodeProgress, error) {
	metaIDSet := make(map[uint]struct{})
	for _, metas := range selectedByDef {
		for _, meta := range metas {
			metaIDSet[meta.ID] = struct{}{}
		}
	}
	metaIDs := make([]uint, 0, len(metaIDSet))
	for metaID := range metaIDSet {
		metaIDs = append(metaIDs, metaID)
	}
	return s.srsDao.GetUserProgressByNodeIDs(userID, "exercise", metaIDs)
}

func isExerciseProgressDue(progress models.UserNodeProgress, exists bool, now time.Time) bool {
	if !exists || progress.Status != "grasped" {
		return false
	}
	return progress.NextReview == nil || progress.NextReview.Before(now)
}

// Helper methods

func (s *SRSService) getDomainIDForNode(nodeID uint, nodeType string) (uint, error) {
	var domainID uint

	if nodeType == "definition" {
		// Try meta_definition first (new system), fallback to legacy definition
		var metaDef models.MetaDefinition
		if err := s.db.Select("domain_id").First(&metaDef, nodeID).Error; err == nil {
			domainID = metaDef.DomainID
		} else {
			var definition models.Definition
			if err := s.db.Select("domain_id").First(&definition, nodeID).Error; err != nil {
				return 0, err
			}
			domainID = definition.DomainID
		}
	} else if nodeType == "meta_definition" {
		var metaDef models.MetaDefinition
		if err := s.db.Select("domain_id").First(&metaDef, nodeID).Error; err != nil {
			return 0, err
		}
		domainID = metaDef.DomainID
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
		UserID:               userID,
		NodeID:               request.NodeID,
		NodeType:             request.NodeType,
		ReviewType:           "explicit",
		Success:              request.Success,
		Quality:              &request.Quality,
		TimeTaken:            &request.TimeTaken,
		CreditApplied:        1.0,
		EasinessFactorBefore: &progressBefore.EasinessFactor,
		IntervalBefore:       &progressBefore.IntervalDays,
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
	// meta_definition as definition. This maintains consistency with progress storage.
	normalizedType := request.NodeType
	if normalizedType == "meta_exercise" {
		normalizedType = "exercise"
	}
	if normalizedType == "meta_definition" {
		normalizedType = "definition"
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
