package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"gorm.io/gorm"
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

// Typed errors so handlers can map service failures to proper HTTP statuses.
var (
	// ErrNodeNotReviewable is returned when an explicit review targets a node
	// that is not in 'grasped' status.
	ErrNodeNotReviewable = errors.New("node is not in a reviewable status")
	// ErrExerciseStatusDerived is returned when a caller tries to set an
	// exercise status manually; exercise status is derived from definitions.
	ErrExerciseStatusDerived = errors.New("exercise status is derived from its parent definitions and cannot be set directly")
)

func isRetryableStatusUpdateError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "sqlstate 40p01") ||
		strings.Contains(msg, "deadlock detected") ||
		strings.Contains(msg, "sqlstate 40001") ||
		strings.Contains(msg, "could not serialize access")
}

func sortPrerequisitesForDeterministicTraversal(rows []models.NodePrerequisite, dependents bool) {
	sort.Slice(rows, func(i, j int) bool {
		left := rows[i]
		right := rows[j]
		if dependents {
			if left.NodeType != right.NodeType {
				return left.NodeType < right.NodeType
			}
			if left.NodeID != right.NodeID {
				return left.NodeID < right.NodeID
			}
			if left.PrerequisiteType != right.PrerequisiteType {
				return left.PrerequisiteType < right.PrerequisiteType
			}
			if left.PrerequisiteID != right.PrerequisiteID {
				return left.PrerequisiteID < right.PrerequisiteID
			}
			return left.ID < right.ID
		}
		if left.PrerequisiteType != right.PrerequisiteType {
			return left.PrerequisiteType < right.PrerequisiteType
		}
		if left.PrerequisiteID != right.PrerequisiteID {
			return left.PrerequisiteID < right.PrerequisiteID
		}
		if left.NodeType != right.NodeType {
			return left.NodeType < right.NodeType
		}
		if left.NodeID != right.NodeID {
			return left.NodeID < right.NodeID
		}
		return left.ID < right.ID
	})
}

// ReviewSuccessThreshold is the quality boundary between failure and success.
const ReviewSuccessThreshold = 3

// SubmitReview processes an explicit review.
//
// Spacing is enforced server-side: the review only mutates SRS state (SM-2
// parameters + credit propagation) when the node is due. A review of a
// non-due node is treated as practice — version outcome stats are recorded,
// but no SRS state changes and the response carries Counted=false.
// recordOutcome=false additionally suppresses persistent outcome stats (used
// by frenzy sessions, whose repeat stats are session-scoped).
func (s *SRSService) SubmitReview(userID uint, request *models.ReviewRequest) (*models.ReviewResponse, error) {
	return s.submitReview(userID, request, true)
}

func (s *SRSService) submitReview(userID uint, request *models.ReviewRequest, recordOutcome bool) (*models.ReviewResponse, error) {
	success := request.Quality >= ReviewSuccessThreshold
	now := time.Now()

	// Get current progress
	progress, err := s.srsDao.GetUserProgress(userID, request.NodeID, request.NodeType)
	if err != nil {
		return nil, fmt.Errorf("failed to get user progress: %w", err)
	}

	// Verify node is in reviewable state
	if progress == nil || progress.Status != "grasped" {
		return nil, ErrNodeNotReviewable
	}

	// Spacing enforcement: a node with a future NextReview is not due, so the
	// grade is practice only. Repeated same-day reviews cannot inflate SRS
	// state; only spaced reviews count.
	isDue := progress.NextReview == nil || !progress.NextReview.After(now)
	if !isDue {
		if recordOutcome {
			s.recordVersionOutcome(userID, request, success)
		}
		return &models.ReviewResponse{
			Success: true,
			Counted: false,
			Message: "Node is not due; practice outcome recorded without SRS changes",
		}, nil
	}

	// Get domain ID for graph building
	domainID, err := s.getDomainIDForNode(request.NodeID, request.NodeType)
	if err != nil {
		return nil, fmt.Errorf("failed to get domain ID: %w", err)
	}

	// Build graph and calculate credit propagation
	prerequisites, err := s.srsDao.GetPrerequisitesByDomain(domainID)
	if err != nil {
		return nil, fmt.Errorf("failed to get prerequisites: %w", err)
	}
	algorithmConfig := DefaultSRSAlgorithmConfig()
	if settings, settingsErr := s.settingsDAO.GetOrCreate(userID, domainID); settingsErr != nil {
		log.Printf("warning: failed to load SRS settings for user %d domain %d: %v", userID, domainID, settingsErr)
	} else {
		algorithmConfig = ParseSRSAlgorithmConfig(settings.Preferences)
	}

	graph := s.creditService.BuildGraph(prerequisites)
	credits := s.creditService.PropagateCredit(request.NodeID, request.NodeType, success, graph)

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Apply credits to all affected nodes
	updatedNodes, err := s.applyCredits(tx, userID, credits, request.Quality, now, algorithmConfig)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to apply credits: %w", err)
	}

	// Record review history
	if err := s.recordReviewHistory(tx, userID, request, progress, success); err != nil {
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
		if err := s.updateSessionStats(tx, *request.SessionID, success); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to update session: %w", err)
		}

		if err := s.recordSessionReview(tx, request, success, now); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to record session review: %w", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Version outcome stats are recorded exactly once per grade, here.
	if recordOutcome {
		s.recordVersionOutcome(userID, request, success)
	}

	s.invalidateDueCache(userID, domainID)
	s.invalidateQueueCache(userID, domainID)

	return &models.ReviewResponse{
		Success:      true,
		Counted:      true,
		Message:      "Review submitted successfully",
		UpdatedNodes: updatedNodes,
		CreditFlow:   credits,
	}, nil
}

// recordVersionOutcome is the single place persistent version stats are
// written for a graded review.
func (s *SRSService) recordVersionOutcome(userID uint, request *models.ReviewRequest, success bool) {
	if request.VersionID == nil {
		return
	}
	switch request.NodeType {
	case models.NodeTypeExercise:
		metaSvc := NewMetaExerciseService(s.db)
		var version models.Exercise
		if err := s.db.Select("difficulty").First(&version, *request.VersionID).Error; err == nil {
			d := version.Difficulty
			metaSvc.RecordVersionOutcome(userID, request.NodeID, request.VersionID, success, &d)
		} else {
			metaSvc.RecordVersionOutcome(userID, request.NodeID, request.VersionID, success, nil)
		}
	case models.NodeTypeDefinition:
		NewMetaDefinitionService(s.db).RecordVersionOutcome(userID, request.NodeID, request.VersionID, success)
	}
}

// applyCredits applies one review's explicit + implicit credits. All progress
// rows are loaded and written in batches; a dense credit flow costs a handful
// of statements instead of two per node.
func (s *SRSService) applyCredits(
	tx *gorm.DB,
	userID uint,
	credits []models.CreditUpdate,
	quality int,
	currentTime time.Time,
	algorithmConfig SRSAlgorithmConfig,
) ([]models.UserNodeProgress, error) {
	srsDao := dao.NewSRSDao(tx)
	var warnings []string

	// Deduplicate credits per node for this single review to ensure only one
	// contribution per node. Prefer explicit over implicit; for implicit duplicates,
	// keep the one with the larger absolute credit.
	dedup := make(map[NodeKey]models.CreditUpdate)
	order := make([]NodeKey, 0, len(credits))
	for _, cr := range credits {
		key := makeNodeKey(cr.NodeID, cr.NodeType)
		if existing, ok := dedup[key]; ok {
			if cr.Type == "explicit" || (existing.Type != "explicit" && math.Abs(cr.Credit) > math.Abs(existing.Credit)) {
				dedup[key] = cr
			}
			continue
		}
		dedup[key] = cr
		order = append(order, key)
	}

	// Batch-load existing progress for every credited node, grouped by type.
	idsByType := make(map[string][]uint)
	for _, key := range order {
		idsByType[key.Type] = append(idsByType[key.Type], key.ID)
	}
	existingByTypeAndID := make(map[string]map[uint]models.UserNodeProgress, len(idsByType))
	for nodeType, ids := range idsByType {
		loaded, err := srsDao.GetUserProgressByNodeIDs(userID, nodeType, ids)
		if err != nil {
			return nil, err
		}
		existingByTypeAndID[nodeType] = loaded
	}

	// Keep one write per row so the batch upsert stays conflict-free.
	pendingRows := make([]*models.UserNodeProgress, 0, len(order))
	pendingIndex := make(map[NodeKey]int, len(order))

	for _, key := range order {
		credit := dedup[key]

		var progress *models.UserNodeProgress
		normKey := makeNodeKey(credit.NodeID, credit.NodeType)
		if idx, ok := pendingIndex[normKey]; ok {
			progress = pendingRows[idx]
		} else if row, ok := existingByTypeAndID[credit.NodeType][credit.NodeID]; ok {
			rowCopy := row
			progress = &rowCopy
		}

		if progress == nil {
			// Credits only apply to nodes that already have progress state;
			// SubmitReview guarantees the explicit node has a grasped row.
			continue
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
					// Reached +100% credit — postpone the review by the
					// CURRENT interval without growing it. Implicit credit
					// acts like barely passing: it buys time at the same
					// spacing, but only explicit reviews advance the ladder.
					newCredit = 1.0
					creditPostponed = true

					postponeDays := int(math.Max(1, math.Round(progress.IntervalDays)))
					nextReview := currentTime.AddDate(0, 0, postponeDays)
					progress.NextReview = &nextReview
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

		// Defensive clamp so the batch write can never trip the DB constraint.
		progress.AccumulatedCredit = math.Max(-1.0, math.Min(1.0, progress.AccumulatedCredit))

		if _, ok := pendingIndex[normKey]; !ok {
			pendingIndex[normKey] = len(pendingRows)
			pendingRows = append(pendingRows, progress)
		}
	}

	if err := srsDao.CreateOrUpdateProgressBatch(pendingRows); err != nil {
		return nil, fmt.Errorf("failed to save progress batch (%d rows): %w", len(pendingRows), err)
	}

	updatedNodes := make([]models.UserNodeProgress, 0, len(pendingRows))
	for _, row := range pendingRows {
		updatedNodes = append(updatedNodes, *row)
	}

	// If there were warnings, log them but don't fail the operation
	if len(warnings) > 0 {
		log.Printf("Credit application completed with %d warnings", len(warnings))
	}

	return updatedNodes, nil
}

// UpdateNodeStatus updates a definition's status and handles propagation.
// Exercise status is derived from parent definitions and cannot be set.
func (s *SRSService) UpdateNodeStatus(userID uint, nodeID uint, nodeType string, status string) error {
	if nodeType != models.NodeTypeDefinition {
		return ErrExerciseStatusDerived
	}

	const maxAttempts = 4
	const baseBackoff = 20 * time.Millisecond

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err := s.updateNodeStatusOnce(userID, nodeID, nodeType, status)
		if err == nil {
			return nil
		}

		if !isRetryableStatusUpdateError(err) || attempt == maxAttempts {
			return err
		}

		jitter := time.Duration(rand.Intn(25)) * time.Millisecond
		backoff := time.Duration(attempt*attempt)*baseBackoff + jitter
		log.Printf("[SRS] transient status update failure, retrying attempt=%d/%d user=%d node=%d type=%s status=%s backoff=%s err=%v",
			attempt, maxAttempts, userID, nodeID, nodeType, status, backoff, err)
		time.Sleep(backoff)
	}

	return nil
}

func (s *SRSService) updateNodeStatusOnce(userID uint, nodeID uint, nodeType string, status string) error {
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

	// Get or create progress
	progress, err := srsDao.GetUserProgress(userID, nodeID, nodeType)
	if err != nil {
		tx.Rollback()
		return err
	}

	if progress == nil {
		progress = &models.UserNodeProgress{
			UserID:            userID,
			NodeID:            nodeID,
			NodeType:          nodeType,
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

	// Propagate among definitions, then derive exercise statuses from the
	// resulting definition statuses.
	if err := s.propagateStatus(tx, userID, nodeID, nodeType, status, domainID); err != nil {
		tx.Rollback()
		return err
	}

	if err := s.DeriveExerciseStatusesTx(tx, userID, domainID); err != nil {
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
func (s *SRSService) propagateStatus(tx *gorm.DB, userID uint, nodeID uint, nodeType string, status string, domainID uint) error {
	srsDao := dao.NewSRSDao(tx)

	prerequisites, err := srsDao.GetPrerequisitesByDomain(domainID)
	if err != nil {
		return err
	}

	// Build maps for easier traversal
	prereqMap := make(map[NodeKey][]models.NodePrerequisite)
	dependentMap := make(map[NodeKey][]models.NodePrerequisite)

	for _, prereq := range prerequisites {
		nodeKey := makeNodeKey(prereq.NodeID, prereq.NodeType)
		prereqKey := makeNodeKey(prereq.PrerequisiteID, prereq.PrerequisiteType)

		prereqMap[nodeKey] = append(prereqMap[nodeKey], prereq)
		dependentMap[prereqKey] = append(dependentMap[prereqKey], prereq)
	}
	for key := range prereqMap {
		sortPrerequisitesForDeterministicTraversal(prereqMap[key], false)
	}
	for key := range dependentMap {
		sortPrerequisitesForDeterministicTraversal(dependentMap[key], true)
	}

	switch status {
	case "grasped":
		// Mark all transitive definition prerequisites as grasped if they're fresh/tackling
		return s.propagateStatusTransition(tx, userID, nodeID, nodeType, prereqMap, false, "grasped")
	case "tackling":
		// Mark all transitive definition dependents as tackling if they're fresh/grasped
		return s.propagateStatusTransition(tx, userID, nodeID, nodeType, dependentMap, true, "tackling")
	}

	return nil
}

// propagateStatusTransition walks the prerequisite (or dependent) closure of
// the start node in deterministic DFS order, applies the status transition in
// memory, and persists every touched row in one batched upsert. This keeps
// the per-node semantics of the previous recursive implementation (including
// creating missing progress rows and touching unchanged ones) while issuing
// a constant number of SQL statements instead of two per node.
func (s *SRSService) propagateStatusTransition(
	tx *gorm.DB,
	userID uint,
	startID uint,
	startType string,
	edgeMap map[NodeKey][]models.NodePrerequisite,
	dependents bool,
	newStatus string,
) error {
	type touchTarget struct {
		id       uint
		nodeType string
	}

	// Pass 1: structural walk, identical order to the old recursion — each
	// edge target is touched, then descended into (once). Only definition
	// nodes participate; exercise statuses are derived afterwards.
	touched := make([]touchTarget, 0, 64)
	visited := make(map[NodeKey]bool)
	var walk func(id uint, nodeType string)
	walk = func(id uint, nodeType string) {
		key := makeNodeKey(id, nodeType)
		if visited[key] {
			return
		}
		visited[key] = true
		for _, edge := range edgeMap[key] {
			targetID, targetType := edge.PrerequisiteID, edge.PrerequisiteType
			if dependents {
				targetID, targetType = edge.NodeID, edge.NodeType
			}
			if targetType != models.NodeTypeDefinition {
				continue
			}
			touched = append(touched, touchTarget{id: targetID, nodeType: targetType})
			walk(targetID, targetType)
		}
	}
	walk(startID, startType)

	if len(touched) == 0 {
		return nil
	}

	// Batch-load current progress for all touched nodes.
	srsDao := dao.NewSRSDao(tx)
	idsByType := make(map[string][]uint)
	for _, t := range touched {
		idsByType[t.nodeType] = append(idsByType[t.nodeType], t.id)
	}
	state := make(map[NodeKey]*models.UserNodeProgress)
	for nodeType, ids := range idsByType {
		rows, err := srsDao.GetUserProgressByNodeIDs(userID, nodeType, ids)
		if err != nil {
			return err
		}
		for id, row := range rows {
			rowCopy := row
			state[makeNodeKey(id, nodeType)] = &rowCopy
		}
	}

	// Pass 2: apply transitions in touch order; write each row once.
	fromA, fromB := "fresh", "tackling"
	if newStatus == "tackling" {
		fromA, fromB = "fresh", "grasped"
	}
	writeOrder := make([]NodeKey, 0, len(touched))
	queued := make(map[NodeKey]bool)
	for _, t := range touched {
		normKey := makeNodeKey(t.id, t.nodeType)

		progress := state[normKey]
		if progress == nil {
			progress = &models.UserNodeProgress{
				UserID:            userID,
				NodeID:            t.id,
				NodeType:          t.nodeType,
				Status:            newStatus,
				EasinessFactor:    2.5,
				IntervalDays:      0,
				Repetitions:       0,
				AccumulatedCredit: 0,
				CreditPostponed:   false,
				TotalReviews:      0,
				SuccessfulReviews: 0,
			}
			state[normKey] = progress
		} else if progress.Status == fromA || progress.Status == fromB {
			progress.Status = newStatus
		}

		if !queued[normKey] {
			queued[normKey] = true
			writeOrder = append(writeOrder, normKey)
		}
	}

	rows := make([]*models.UserNodeProgress, 0, len(writeOrder))
	for _, key := range writeOrder {
		rows = append(rows, state[key])
	}
	return srsDao.CreateOrUpdateProgressBatch(rows)
}

const (
	srsDueRoutePath         = "/api/srs/domains/:domainId/due"
	srsReviewQueueRoutePath = "/api/srs/domains/:domainId/review-queue"
)

type reviewQueueGraphCache struct {
	loaded bool
	graph  map[NodeKey]*GraphNode
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
	switch nodeType {
	case models.NodeTypeDefinition:
		var metaDef models.MetaDefinition
		if err := s.db.Select("domain_id").First(&metaDef, nodeID).Error; err != nil {
			return 0, err
		}
		return metaDef.DomainID, nil
	case models.NodeTypeExercise:
		var meta models.MetaExercise
		if err := s.db.Select("domain_id").First(&meta, nodeID).Error; err != nil {
			return 0, err
		}
		return meta.DomainID, nil
	default:
		return 0, errors.New("invalid node type")
	}
}

func (s *SRSService) recordReviewHistory(tx *gorm.DB, userID uint, request *models.ReviewRequest, progressBefore *models.UserNodeProgress, success bool) error {
	srsDao := dao.NewSRSDao(tx)

	history := &models.ReviewHistory{
		UserID:               userID,
		NodeID:               request.NodeID,
		NodeType:             request.NodeType,
		ReviewType:           "explicit",
		Success:              success,
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

func (s *SRSService) recordSessionReview(tx *gorm.DB, request *models.ReviewRequest, success bool, reviewTime time.Time) error {
	if request.SessionID == nil {
		return nil
	}

	srsDao := dao.NewSRSDao(tx)

	sessionReview := &models.SessionReview{
		SessionID:     *request.SessionID,
		NodeID:        request.NodeID,
		NodeType:      request.NodeType,
		ReviewType:    "explicit",
		ReviewTime:    reviewTime,
		Success:       success,
		Quality:       &request.Quality,
		TimeTaken:     &request.TimeTaken,
		CreditApplied: 1.0,
	}

	return srsDao.CreateSessionReview(sessionReview)
}
