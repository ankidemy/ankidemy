package dao

import (
	"errors"
	"fmt"
	"sort"
	"time"

	"ankidemy/server/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SRSDao handles all SRS-related database operations
type SRSDao struct {
	db *gorm.DB
}

const (
	srsDueRoute         = "/api/srs/domains/:domainId/due"
	srsReviewQueueRoute = "/api/srs/domains/:domainId/review-queue"
)

// NewSRSDao creates a new SRSDao instance
func NewSRSDao(db *gorm.DB) *SRSDao {
	return &SRSDao{db: db}
}

// === Node Prerequisites ===

// CreatePrerequisite creates a new prerequisite relationship
func (d *SRSDao) CreatePrerequisite(prerequisite *models.NodePrerequisite) error {
	return d.db.Create(prerequisite).Error
}

// GetPrerequisitesByDomain gets all prerequisites for nodes in a domain.
func (d *SRSDao) GetPrerequisitesByDomain(domainID uint) ([]models.NodePrerequisite, error) {
	return d.getPrerequisitesByDomainInternal(domainID, "", "", "")
}

// GetPrerequisitesByDomainObserved gets prerequisites with route/stage SQL comments and DAO stage logs.
func (d *SRSDao) GetPrerequisitesByDomainObserved(domainID uint, requestID string, route string, stage string) ([]models.NodePrerequisite, error) {
	return d.getPrerequisitesByDomainInternal(domainID, requestID, route, stage)
}

func (d *SRSDao) getPrerequisitesByDomainInternal(domainID uint, requestID string, route string, stage string) ([]models.NodePrerequisite, error) {
	const daoMethod = "SRSDao.GetPrerequisitesByDomain"
	var prerequisites []models.NodePrerequisite

	comment := ""
	if route != "" && stage != "" {
		comment = fmt.Sprintf("/* route:%s stage:%s */", route, stage)
	}
	startedAt := time.Now()

	// Get prerequisites for legacy definitions (backward compatibility)
	definitionQuery := fmt.Sprintf(`
		%s
		SELECT np.* FROM node_prerequisites np
		JOIN definitions d ON (np.node_id = d.id AND np.node_type = 'definition')
		   OR (np.prerequisite_id = d.id AND np.prerequisite_type = 'definition')
		WHERE d.domain_id = ?
	`, comment)

	// Get prerequisites for meta_definitions (concept pools)
	metaDefQuery := fmt.Sprintf(`
		%s
		SELECT np.* FROM node_prerequisites np
		JOIN meta_definitions md ON (np.node_id = md.id AND np.node_type = 'meta_definition')
		   OR (np.prerequisite_id = md.id AND np.prerequisite_type = 'meta_definition')
		WHERE md.domain_id = ?
	`, comment)

	// Get prerequisites for meta_exercises
	exerciseQuery := fmt.Sprintf(`
		%s
		SELECT np.* FROM node_prerequisites np
		JOIN meta_exercises e ON (np.node_id = e.id AND np.node_type = 'meta_exercise')
		   OR (np.prerequisite_id = e.id AND np.prerequisite_type = 'meta_exercise')
		WHERE e.domain_id = ?
	`, comment)

	var defPrereqs []models.NodePrerequisite
	var metaDefPrereqs []models.NodePrerequisite
	var exPrereqs []models.NodePrerequisite

	if err := d.db.Raw(definitionQuery, domainID).Scan(&defPrereqs).Error; err != nil {
		if stage != "" {
			logDAOStage(
				requestID,
				route,
				daoMethod,
				stage,
				startedAt,
				err,
				map[string]interface{}{"domainId": domainID},
			)
		}
		return nil, err
	}

	if err := d.db.Raw(metaDefQuery, domainID).Scan(&metaDefPrereqs).Error; err != nil {
		if stage != "" {
			logDAOStage(
				requestID,
				route,
				daoMethod,
				stage,
				startedAt,
				err,
				map[string]interface{}{"domainId": domainID},
			)
		}
		return nil, err
	}

	if err := d.db.Raw(exerciseQuery, domainID).Scan(&exPrereqs).Error; err != nil {
		if stage != "" {
			logDAOStage(
				requestID,
				route,
				daoMethod,
				stage,
				startedAt,
				err,
				map[string]interface{}{"domainId": domainID},
			)
		}
		return nil, err
	}

	// Combine and deduplicate
	prereqMap := make(map[string]models.NodePrerequisite)
	for _, prereq := range defPrereqs {
		key := fmt.Sprintf("%d_%s_%d_%s", prereq.NodeID, prereq.NodeType, prereq.PrerequisiteID, prereq.PrerequisiteType)
		prereqMap[key] = prereq
	}
	for _, prereq := range metaDefPrereqs {
		key := fmt.Sprintf("%d_%s_%d_%s", prereq.NodeID, prereq.NodeType, prereq.PrerequisiteID, prereq.PrerequisiteType)
		prereqMap[key] = prereq
	}
	for _, prereq := range exPrereqs {
		key := fmt.Sprintf("%d_%s_%d_%s", prereq.NodeID, prereq.NodeType, prereq.PrerequisiteID, prereq.PrerequisiteType)
		prereqMap[key] = prereq
	}

	for _, prereq := range prereqMap {
		prerequisites = append(prerequisites, prereq)
	}
	sort.Slice(prerequisites, func(i, j int) bool {
		left := prerequisites[i]
		right := prerequisites[j]
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
	})

	if stage != "" {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			stage,
			startedAt,
			nil,
			map[string]interface{}{
				"domainId":            domainID,
				"definitionCount":     len(defPrereqs),
				"metaDefinitionCount": len(metaDefPrereqs),
				"exerciseCount":       len(exPrereqs),
				"resultCount":         len(prerequisites),
			},
		)
	}

	return prerequisites, nil
}

// GetPrerequisitesForNode gets prerequisites for a specific node
func (d *SRSDao) GetPrerequisitesForNode(nodeID uint, nodeType string) ([]models.NodePrerequisite, error) {
	var prerequisites []models.NodePrerequisite
	result := d.db.Where("node_id = ? AND node_type = ?", nodeID, nodeType).Find(&prerequisites)
	return prerequisites, result.Error
}

// DeletePrerequisitesForNode deletes all prerequisites for a node
func (d *SRSDao) DeletePrerequisitesForNode(nodeID uint, nodeType string) error {
	return d.db.Where("node_id = ? AND node_type = ?", nodeID, nodeType).Delete(&models.NodePrerequisite{}).Error
}

// === User Node Progress ===

// GetUserProgress gets progress for a user on a specific node
func (d *SRSDao) GetUserProgress(userID uint, nodeID uint, nodeType string) (*models.UserNodeProgress, error) {
	var progress models.UserNodeProgress
	// Use Find + RowsAffected to avoid ErrRecordNotFound logs at INFO level
	tx := d.db.Where("user_id = ? AND node_id = ? AND node_type = ?", userID, nodeID, nodeType).
		Limit(1).
		Find(&progress)

	if tx.Error != nil {
		return nil, tx.Error
	}
	if tx.RowsAffected == 0 {
		return nil, nil // No progress found, not an error
	}

	return &progress, nil
}

// GetUserProgressByNodeIDs gets progress rows for a user/nodeType across many node IDs.
func (d *SRSDao) GetUserProgressByNodeIDs(userID uint, nodeType string, nodeIDs []uint) (map[uint]models.UserNodeProgress, error) {
	results := make(map[uint]models.UserNodeProgress)
	if len(nodeIDs) == 0 {
		return results, nil
	}

	seen := make(map[uint]struct{}, len(nodeIDs))
	uniqueIDs := make([]uint, 0, len(nodeIDs))
	for _, nodeID := range nodeIDs {
		if _, ok := seen[nodeID]; ok {
			continue
		}
		seen[nodeID] = struct{}{}
		uniqueIDs = append(uniqueIDs, nodeID)
	}

	var rows []models.UserNodeProgress
	if err := d.db.Where("user_id = ? AND node_type = ? AND node_id IN ?", userID, nodeType, uniqueIDs).Find(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		results[row.NodeID] = row
	}
	return results, nil
}

// CreateOrUpdateProgress creates or updates user progress
func (d *SRSDao) CreateOrUpdateProgress(progress *models.UserNodeProgress) error {
	now := time.Now().UTC()
	if progress.CreatedAt.IsZero() {
		progress.CreatedAt = now
	}
	progress.UpdatedAt = now

	return d.db.Clauses(
		clause.OnConflict{
			Columns: []clause.Column{
				{Name: "user_id"},
				{Name: "node_id"},
				{Name: "node_type"},
			},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"status":               progress.Status,
				"easiness_factor":      progress.EasinessFactor,
				"interval_days":        progress.IntervalDays,
				"repetitions":          progress.Repetitions,
				"last_review":          progress.LastReview,
				"next_review":          progress.NextReview,
				"block_negative_until": progress.BlockNegativeUntil,
				"accumulated_credit":   progress.AccumulatedCredit,
				"credit_postponed":     progress.CreditPostponed,
				"total_reviews":        progress.TotalReviews,
				"successful_reviews":   progress.SuccessfulReviews,
				"updated_at":           now,
			}),
		},
		clause.Returning{
			Columns: []clause.Column{
				{Name: "id"},
				{Name: "created_at"},
				{Name: "updated_at"},
			},
		},
	).Create(progress).Error
}

// GetDomainProgress gets all progress for a user in a domain
func (d *SRSDao) GetDomainProgress(userID uint, domainID uint) ([]models.NodeProgress, error) {
	var results []models.NodeProgress

	// Get definition progress (from meta_definitions, progress stored with node_type='definition')
	defQuery := `
		SELECT
			md.id as node_id,
			'definition' as node_type,
			md.code as node_code,
			md.name as node_name,
			COALESCE(unp.status, 'fresh') as status,
			COALESCE(unp.easiness_factor, 2.5) as easiness_factor,
			COALESCE(unp.interval_days, 0) as interval_days,
			COALESCE(unp.repetitions, 0) as repetitions,
			unp.last_review,
			unp.next_review,
			COALESCE(unp.accumulated_credit, 0) as accumulated_credit,
			COALESCE(unp.credit_postponed, false) as credit_postponed,
			COALESCE(unp.total_reviews, 0) as total_reviews,
			COALESCE(unp.successful_reviews, 0) as successful_reviews,
			CASE
				WHEN unp.next_review IS NULL THEN NULL
				WHEN unp.next_review <= NOW() THEN 0
				ELSE EXTRACT(days FROM (unp.next_review - NOW()))::INTEGER
			END as days_until_review,
			CASE
				WHEN unp.status = 'grasped' AND (unp.next_review IS NULL OR unp.next_review <= NOW()) THEN true
				ELSE false
			END as is_due
		FROM meta_definitions md
		LEFT JOIN user_node_progress unp ON md.id = unp.node_id
			AND unp.node_type = 'definition' AND unp.user_id = ?
		WHERE md.domain_id = ?
	`

	// Get exercise (meta) progress
	exQuery := `
        SELECT 
            e.id as node_id,
            'exercise' as node_type,
            e.code as node_code,
            e.name as node_name,
            COALESCE(unp.status, 'fresh') as status,
            COALESCE(unp.easiness_factor, 2.5) as easiness_factor,
            COALESCE(unp.interval_days, 0) as interval_days,
            COALESCE(unp.repetitions, 0) as repetitions,
            unp.last_review,
            unp.next_review,
            COALESCE(unp.accumulated_credit, 0) as accumulated_credit,
            COALESCE(unp.credit_postponed, false) as credit_postponed,
            COALESCE(unp.total_reviews, 0) as total_reviews,
            COALESCE(unp.successful_reviews, 0) as successful_reviews,
            CASE 
                WHEN unp.next_review IS NULL THEN NULL
                WHEN unp.next_review <= NOW() THEN 0
                ELSE EXTRACT(days FROM (unp.next_review - NOW()))::INTEGER
            END as days_until_review,
            CASE
                WHEN unp.status = 'grasped' AND (unp.next_review IS NULL OR unp.next_review <= NOW()) THEN true
                ELSE false
            END as is_due
        FROM meta_exercises e
        LEFT JOIN user_node_progress unp ON e.id = unp.node_id 
            AND unp.node_type = 'exercise' AND unp.user_id = ?
        WHERE e.domain_id = ?
    `

	var defResults []models.NodeProgress
	var exResults []models.NodeProgress

	if err := d.db.Raw(defQuery, userID, domainID).Scan(&defResults).Error; err != nil {
		return nil, err
	}

	if err := d.db.Raw(exQuery, userID, domainID).Scan(&exResults).Error; err != nil {
		return nil, err
	}

	results = append(results, defResults...)
	results = append(results, exResults...)

	return results, nil
}

func dueDefinitionSelectFull() string {
	return `
		SELECT
			md.id as node_id,
			'definition' as node_type,
			md.code as node_code,
			md.name as node_name,
			unp.status,
			unp.easiness_factor,
			unp.interval_days,
			unp.repetitions,
			unp.last_review,
			unp.next_review,
			unp.accumulated_credit,
			unp.credit_postponed,
			unp.total_reviews,
			unp.successful_reviews,
			0 as days_until_review,
			true as is_due
		FROM meta_definitions md
		JOIN user_node_progress unp ON md.id = unp.node_id
			AND unp.node_type = 'definition' AND unp.user_id = ?
		WHERE md.domain_id = ? AND unp.status = 'grasped'
			AND (unp.next_review IS NULL OR unp.next_review <= NOW())
	`
}

func dueExerciseSelectFull() string {
	return `
		SELECT
			e.id as node_id,
			'exercise' as node_type,
			e.code as node_code,
			e.name as node_name,
			unp.status,
			unp.easiness_factor,
			unp.interval_days,
			unp.repetitions,
			unp.last_review,
			unp.next_review,
			unp.accumulated_credit,
			unp.credit_postponed,
			unp.total_reviews,
			unp.successful_reviews,
			0 as days_until_review,
			true as is_due
		FROM meta_exercises e
		JOIN user_node_progress unp ON e.id = unp.node_id
			AND unp.node_type = 'exercise' AND unp.user_id = ?
		WHERE e.domain_id = ? AND unp.status = 'grasped'
			AND (unp.next_review IS NULL OR unp.next_review <= NOW())
	`
}

func dueDefinitionSelectCompact() string {
	return `
		SELECT
			md.id as node_id,
			'definition' as node_type,
			md.code as node_code,
			md.name as node_name,
			unp.status,
			unp.next_review,
			true as is_due
		FROM meta_definitions md
		JOIN user_node_progress unp ON md.id = unp.node_id
			AND unp.node_type = 'definition' AND unp.user_id = ?
		WHERE md.domain_id = ? AND unp.status = 'grasped'
			AND (unp.next_review IS NULL OR unp.next_review <= NOW())
	`
}

func dueExerciseSelectCompact() string {
	return `
		SELECT
			e.id as node_id,
			'exercise' as node_type,
			e.code as node_code,
			e.name as node_name,
			unp.status,
			unp.next_review,
			true as is_due
		FROM meta_exercises e
		JOIN user_node_progress unp ON e.id = unp.node_id
			AND unp.node_type = 'exercise' AND unp.user_id = ?
		WHERE e.domain_id = ? AND unp.status = 'grasped'
			AND (unp.next_review IS NULL OR unp.next_review <= NOW())
	`
}

// GetDueReviews gets nodes due for review.
func (d *SRSDao) GetDueReviews(userID uint, domainID uint, nodeType string, requestID string, route string, stage string) ([]models.NodeProgress, error) {
	const daoMethod = "SRSDao.GetDueReviews"
	if route == "" {
		route = srsDueRoute
	}
	if stage == "" {
		stage = "fetch_due_rows"
	}

	if nodeType == "meta_definition" {
		nodeType = "definition"
	}
	if nodeType == "meta_exercise" {
		nodeType = "exercise"
	}

	comment := fmt.Sprintf("/* route:%s stage:%s */", route, stage)
	startedAt := time.Now()
	var results []models.NodeProgress

	var query string
	var args []interface{}

	switch nodeType {
	case "definition":
		query = fmt.Sprintf(`
			%s
			%s
			ORDER BY next_review ASC NULLS FIRST, node_id ASC
		`, comment, dueDefinitionSelectFull())
		args = []interface{}{userID, domainID}
	case "exercise":
		query = fmt.Sprintf(`
			%s
			%s
			ORDER BY next_review ASC NULLS FIRST, node_id ASC
		`, comment, dueExerciseSelectFull())
		args = []interface{}{userID, domainID}
	default:
		query = fmt.Sprintf(`
			%s
			SELECT * FROM (
				%s
				UNION ALL
				%s
			) due_rows
			ORDER BY next_review ASC NULLS FIRST, node_type ASC, node_id ASC
		`, comment, dueDefinitionSelectFull(), dueExerciseSelectFull())
		args = []interface{}{userID, domainID, userID, domainID}
	}

	if err := d.db.Raw(query, args...).Scan(&results).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			stage,
			startedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID, "nodeType": nodeType},
		)
		return nil, err
	}

	metadata := map[string]interface{}{
		"userId":      userID,
		"domainId":    domainID,
		"nodeType":    nodeType,
		"resultCount": len(results),
	}
	if nodeType != "definition" && nodeType != "exercise" {
		definitionCount := 0
		exerciseCount := 0
		for _, row := range results {
			if row.NodeType == "definition" {
				definitionCount++
				continue
			}
			if row.NodeType == "exercise" {
				exerciseCount++
			}
		}
		metadata["definitionCount"] = definitionCount
		metadata["exerciseCount"] = exerciseCount
	}

	logDAOStage(
		requestID,
		route,
		daoMethod,
		stage,
		startedAt,
		nil,
		metadata,
	)
	return results, nil
}

// GetDueReviewsCompact gets nodes due for review using the compact projection shape.
func (d *SRSDao) GetDueReviewsCompact(userID uint, domainID uint, nodeType string, requestID string, route string, stage string) ([]models.DueReviewCompact, error) {
	const daoMethod = "SRSDao.GetDueReviewsCompact"
	if route == "" {
		route = srsDueRoute
	}
	if stage == "" {
		stage = "fetch_due_rows"
	}

	if nodeType == "meta_definition" {
		nodeType = "definition"
	}
	if nodeType == "meta_exercise" {
		nodeType = "exercise"
	}

	comment := fmt.Sprintf("/* route:%s stage:%s */", route, stage)
	startedAt := time.Now()
	var results []models.DueReviewCompact

	var query string
	var args []interface{}

	switch nodeType {
	case "definition":
		query = fmt.Sprintf(`
			%s
			%s
			ORDER BY next_review ASC NULLS FIRST, node_id ASC
		`, comment, dueDefinitionSelectCompact())
		args = []interface{}{userID, domainID}
	case "exercise":
		query = fmt.Sprintf(`
			%s
			%s
			ORDER BY next_review ASC NULLS FIRST, node_id ASC
		`, comment, dueExerciseSelectCompact())
		args = []interface{}{userID, domainID}
	default:
		query = fmt.Sprintf(`
			%s
			SELECT * FROM (
				%s
				UNION ALL
				%s
			) due_rows
			ORDER BY next_review ASC NULLS FIRST, node_type ASC, node_id ASC
		`, comment, dueDefinitionSelectCompact(), dueExerciseSelectCompact())
		args = []interface{}{userID, domainID, userID, domainID}
	}

	if err := d.db.Raw(query, args...).Scan(&results).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			stage,
			startedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID, "nodeType": nodeType},
		)
		return nil, err
	}

	metadata := map[string]interface{}{
		"userId":      userID,
		"domainId":    domainID,
		"nodeType":    nodeType,
		"resultCount": len(results),
	}
	if nodeType != "definition" && nodeType != "exercise" {
		definitionCount := 0
		exerciseCount := 0
		for _, row := range results {
			if row.NodeType == "definition" {
				definitionCount++
				continue
			}
			if row.NodeType == "exercise" {
				exerciseCount++
			}
		}
		metadata["definitionCount"] = definitionCount
		metadata["exerciseCount"] = exerciseCount
	}

	logDAOStage(
		requestID,
		route,
		daoMethod,
		stage,
		startedAt,
		nil,
		metadata,
	)
	return results, nil
}

// GetGraspedDefinitions gets all grasped definitions for a domain.
func (d *SRSDao) GetGraspedDefinitions(userID uint, domainID uint, requestID string, route string, stage string) ([]models.NodeProgress, error) {
	const daoMethod = "SRSDao.GetGraspedDefinitions"
	if route == "" {
		route = srsReviewQueueRoute
	}
	if stage == "" {
		stage = "load_grasped_fallback"
	}

	comment := fmt.Sprintf("/* route:%s stage:%s */", route, stage)
	query := fmt.Sprintf(`
		%s
		SELECT
			md.id as node_id,
			'definition' as node_type,
			md.code as node_code,
			md.name as node_name,
			unp.status,
			unp.easiness_factor,
			unp.interval_days,
			unp.repetitions,
			unp.last_review,
			unp.next_review,
			unp.accumulated_credit,
			unp.credit_postponed,
			unp.total_reviews,
			unp.successful_reviews,
			CASE
				WHEN unp.next_review IS NULL THEN NULL
				WHEN unp.next_review <= NOW() THEN 0
				ELSE EXTRACT(days FROM (unp.next_review - NOW()))::INTEGER
			END as days_until_review,
			CASE
				WHEN unp.status = 'grasped' AND (unp.next_review IS NULL OR unp.next_review <= NOW()) THEN true
				ELSE false
			END as is_due
		FROM meta_definitions md
		JOIN user_node_progress unp ON md.id = unp.node_id
			AND unp.node_type = 'definition' AND unp.user_id = ?
		WHERE md.domain_id = ? AND unp.status = 'grasped'
	`, comment)

	startedAt := time.Now()
	var results []models.NodeProgress
	if err := d.db.Raw(query, userID, domainID).Scan(&results).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			stage,
			startedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}

	logDAOStage(
		requestID,
		route,
		daoMethod,
		stage,
		startedAt,
		nil,
		map[string]interface{}{
			"userId":      userID,
			"domainId":    domainID,
			"resultCount": len(results),
		},
	)
	return results, nil
}

// GetGraspedExercises gets all grasped exercises for a domain.
func (d *SRSDao) GetGraspedExercises(userID uint, domainID uint, requestID string, route string, stage string) ([]models.NodeProgress, error) {
	const daoMethod = "SRSDao.GetGraspedExercises"
	if route == "" {
		route = srsReviewQueueRoute
	}
	if stage == "" {
		stage = "load_grasped_fallback"
	}

	comment := fmt.Sprintf("/* route:%s stage:%s */", route, stage)
	query := fmt.Sprintf(`
		%s
		SELECT
			e.id as node_id,
			'exercise' as node_type,
			e.code as node_code,
			e.name as node_name,
			unp.status,
			unp.easiness_factor,
			unp.interval_days,
			unp.repetitions,
			unp.last_review,
			unp.next_review,
			unp.accumulated_credit,
			unp.credit_postponed,
			unp.total_reviews,
			unp.successful_reviews,
			CASE
				WHEN unp.next_review IS NULL THEN NULL
				WHEN unp.next_review <= NOW() THEN 0
				ELSE EXTRACT(days FROM (unp.next_review - NOW()))::INTEGER
			END as days_until_review,
			CASE
				WHEN unp.status = 'grasped' AND (unp.next_review IS NULL OR unp.next_review <= NOW()) THEN true
				ELSE false
			END as is_due
		FROM meta_exercises e
		JOIN user_node_progress unp ON e.id = unp.node_id
			AND unp.node_type = 'exercise' AND unp.user_id = ?
		WHERE e.domain_id = ? AND unp.status = 'grasped'
	`, comment)

	startedAt := time.Now()
	var results []models.NodeProgress
	if err := d.db.Raw(query, userID, domainID).Scan(&results).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			stage,
			startedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}

	logDAOStage(
		requestID,
		route,
		daoMethod,
		stage,
		startedAt,
		nil,
		map[string]interface{}{
			"userId":      userID,
			"domainId":    domainID,
			"resultCount": len(results),
		},
	)
	return results, nil
}

// GetDefinitionsWithSuccessfulReviews gets grasped definitions with successful_reviews > 0.
func (d *SRSDao) GetDefinitionsWithSuccessfulReviews(userID uint, domainID uint, requestID string, route string, stage string) ([]models.NodeProgress, error) {
	const daoMethod = "SRSDao.GetDefinitionsWithSuccessfulReviews"
	if route == "" {
		route = srsReviewQueueRoute
	}
	if stage == "" {
		stage = "load_grasped_fallback"
	}

	comment := fmt.Sprintf("/* route:%s stage:%s */", route, stage)
	query := fmt.Sprintf(`
		%s
		SELECT
			md.id as node_id,
			'definition' as node_type,
			md.code as node_code,
			md.name as node_name,
			unp.status,
			unp.easiness_factor,
			unp.interval_days,
			unp.repetitions,
			unp.last_review,
			unp.next_review,
			unp.accumulated_credit,
			unp.credit_postponed,
			unp.total_reviews,
			unp.successful_reviews,
			CASE
				WHEN unp.next_review IS NULL THEN NULL
				WHEN unp.next_review <= NOW() THEN 0
				ELSE EXTRACT(days FROM (unp.next_review - NOW()))::INTEGER
			END as days_until_review,
			CASE
				WHEN unp.status = 'grasped' AND (unp.next_review IS NULL OR unp.next_review <= NOW()) THEN true
				ELSE false
			END as is_due
		FROM meta_definitions md
		JOIN user_node_progress unp ON md.id = unp.node_id
			AND unp.node_type = 'definition' AND unp.user_id = ?
		WHERE md.domain_id = ? AND unp.status = 'grasped' AND unp.successful_reviews > 0
	`, comment)

	startedAt := time.Now()
	var results []models.NodeProgress
	if err := d.db.Raw(query, userID, domainID).Scan(&results).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			stage,
			startedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}

	logDAOStage(
		requestID,
		route,
		daoMethod,
		stage,
		startedAt,
		nil,
		map[string]interface{}{
			"userId":      userID,
			"domainId":    domainID,
			"resultCount": len(results),
		},
	)
	return results, nil
}

// === Study Sessions ===

// CreateSession creates a new study session
func (d *SRSDao) CreateSession(session *models.StudySession) error {
	return d.db.Create(session).Error
}

// GetSession gets a session by ID
func (d *SRSDao) GetSession(sessionID uint) (*models.StudySession, error) {
	var session models.StudySession
	result := d.db.First(&session, sessionID)

	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return nil, errors.New("session not found")
	}

	return &session, result.Error
}

// UpdateSession updates a session
func (d *SRSDao) UpdateSession(session *models.StudySession) error {
	return d.db.Save(session).Error
}

// EndSession ends a study session
func (d *SRSDao) EndSession(sessionID uint) error {
	now := time.Now()
	return d.db.Model(&models.StudySession{}).
		Where("id = ?", sessionID).
		Update("end_time", now).Error
}

// GetUserSessions gets sessions for a user
func (d *SRSDao) GetUserSessions(userID uint, limit int) ([]models.StudySession, error) {
	var sessions []models.StudySession
	query := d.db.Where("user_id = ?", userID).Order("start_time DESC")

	if limit > 0 {
		query = query.Limit(limit)
	}

	result := query.Find(&sessions)
	return sessions, result.Error
}

// === Session Reviews ===

// CreateSessionReview creates a session review record
func (d *SRSDao) CreateSessionReview(review *models.SessionReview) error {
	return d.db.Create(review).Error
}

// === Review History ===

// CreateReviewHistory creates a review history record
func (d *SRSDao) CreateReviewHistory(history *models.ReviewHistory) error {
	return d.db.Create(history).Error
}

// GetReviewHistory gets review history for a user
func (d *SRSDao) GetReviewHistory(userID uint, nodeID *uint, nodeType *string, limit int) ([]models.ReviewHistory, error) {
	var history []models.ReviewHistory
	query := d.db.Where("user_id = ?", userID)

	if nodeID != nil && nodeType != nil {
		query = query.Where("node_id = ? AND node_type = ?", *nodeID, *nodeType)
	}

	query = query.Order("review_time DESC")

	if limit > 0 {
		query = query.Limit(limit)
	}

	result := query.Find(&history)
	return history, result.Error
}

// === Statistics ===

// GetDomainStats gets domain statistics for a user
func (d *SRSDao) GetDomainStats(userID uint, domainID uint, requestID string) (*models.DomainProgressSummary, error) {
	const route = "/api/srs/domains/:domainId/stats"
	const daoMethod = "SRSDao.GetDomainStats"

	var stats models.DomainProgressSummary
	stats.DomainID = domainID

	// Count total nodes
	var totalDefs int64
	var totalExs int64
	countNodesStartedAt := time.Now()
	totalDefinitionsQuery := `
		/* route:/api/srs/domains/:domainId/stats stage:count_nodes */
		SELECT COUNT(*) FROM meta_definitions WHERE domain_id = ?
	`
	if err := d.db.Raw(totalDefinitionsQuery, domainID).Scan(&totalDefs).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"count_nodes",
			countNodesStartedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}

	totalExercisesQuery := `
		/* route:/api/srs/domains/:domainId/stats stage:count_nodes */
		SELECT COUNT(*) FROM meta_exercises WHERE domain_id = ?
	`
	if err := d.db.Raw(totalExercisesQuery, domainID).Scan(&totalExs).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"count_nodes",
			countNodesStartedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}
	stats.TotalNodes = int(totalDefs + totalExs)
	logDAOStage(
		requestID,
		route,
		daoMethod,
		"count_nodes",
		countNodesStartedAt,
		nil,
		map[string]interface{}{
			"userId":           userID,
			"domainId":         domainID,
			"totalDefinitions": totalDefs,
			"totalExercises":   totalExs,
			"totalNodes":       stats.TotalNodes,
		},
	)

	// Count by status
	statusCountsStartedAt := time.Now()
	statusQuery := `
		/* route:/api/srs/domains/:domainId/stats stage:status_counts */
		SELECT
			COALESCE(unp.status, 'fresh') as status,
			COUNT(*) as count
		FROM (
			SELECT id, 'definition' as type FROM meta_definitions WHERE domain_id = ?
			UNION ALL
			SELECT id, 'exercise' as type FROM meta_exercises WHERE domain_id = ?
		) nodes
		LEFT JOIN user_node_progress unp ON nodes.id = unp.node_id
			AND nodes.type = unp.node_type AND unp.user_id = ?
		GROUP BY COALESCE(unp.status, 'fresh')
	`

	type statusCount struct {
		Status string
		Count  int
	}

	var statusCounts []statusCount
	if err := d.db.Raw(statusQuery, domainID, domainID, userID).Scan(&statusCounts).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"status_counts",
			statusCountsStartedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}

	for _, sc := range statusCounts {
		switch sc.Status {
		case "fresh":
			stats.FreshNodes = sc.Count
		case "tackling":
			stats.TacklingNodes = sc.Count
		case "grasped":
			stats.GraspedNodes = sc.Count
		case "learned":
			stats.LearnedNodes = sc.Count
		}
	}
	logDAOStage(
		requestID,
		route,
		daoMethod,
		"status_counts",
		statusCountsStartedAt,
		nil,
		map[string]interface{}{
			"userId":        userID,
			"domainId":      domainID,
			"freshNodes":    stats.FreshNodes,
			"tacklingNodes": stats.TacklingNodes,
			"graspedNodes":  stats.GraspedNodes,
			"learnedNodes":  stats.LearnedNodes,
		},
	)

	// Count due reviews
	dueCountStartedAt := time.Now()
	dueQuery := `
		/* route:/api/srs/domains/:domainId/stats stage:due_count */
		SELECT COUNT(*) FROM (
			SELECT md.id FROM meta_definitions md
			JOIN user_node_progress unp ON md.id = unp.node_id
				AND unp.node_type = 'definition' AND unp.user_id = ?
			WHERE md.domain_id = ? AND unp.status = 'grasped'
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
			UNION ALL
			SELECT e.id FROM meta_exercises e
			JOIN user_node_progress unp ON e.id = unp.node_id
				AND unp.node_type = 'exercise' AND unp.user_id = ?
			WHERE e.domain_id = ? AND unp.status = 'grasped'
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
		) due_nodes
	`

	var dueCount int64
	if err := d.db.Raw(dueQuery, userID, domainID, userID, domainID).Scan(&dueCount).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"due_count",
			dueCountStartedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}
	stats.DueReviews = int(dueCount)
	logDAOStage(
		requestID,
		route,
		daoMethod,
		"due_count",
		dueCountStartedAt,
		nil,
		map[string]interface{}{
			"userId":     userID,
			"domainId":   domainID,
			"dueReviews": stats.DueReviews,
		},
	)

	// Count completed today
	completedTodayStartedAt := time.Now()
	todayQuery := `
		/* route:/api/srs/domains/:domainId/stats stage:completed_today */
		SELECT COUNT(*) FROM review_history
		WHERE user_id = ? AND DATE(review_time) = CURRENT_DATE
			AND review_type = 'explicit'
			AND (node_id, node_type) IN (
				SELECT id, 'definition' FROM meta_definitions WHERE domain_id = ?
				UNION ALL
				SELECT id, 'exercise' FROM meta_exercises WHERE domain_id = ?
			)
	`

	var todayCount int64
	if err := d.db.Raw(todayQuery, userID, domainID, domainID).Scan(&todayCount).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"completed_today",
			completedTodayStartedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}
	stats.CompletedToday = int(todayCount)
	logDAOStage(
		requestID,
		route,
		daoMethod,
		"completed_today",
		completedTodayStartedAt,
		nil,
		map[string]interface{}{
			"userId":         userID,
			"domainId":       domainID,
			"completedToday": stats.CompletedToday,
		},
	)

	// Calculate success rate
	successRateStartedAt := time.Now()
	successQuery := `
		/* route:/api/srs/domains/:domainId/stats stage:success_rate */
		SELECT
			COUNT(*) as total,
			COUNT(CASE WHEN success THEN 1 END) as successful
		FROM review_history
		WHERE user_id = ? AND review_type = 'explicit'
			AND (node_id, node_type) IN (
				SELECT id, 'definition' FROM meta_definitions WHERE domain_id = ?
				UNION ALL
				SELECT id, 'exercise' FROM meta_exercises WHERE domain_id = ?
			)
	`

	var successStats struct {
		Total      int64
		Successful int64
	}

	if err := d.db.Raw(successQuery, userID, domainID, domainID).Scan(&successStats).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"success_rate",
			successRateStartedAt,
			err,
			map[string]interface{}{"userId": userID, "domainId": domainID},
		)
		return nil, err
	}

	if successStats.Total > 0 {
		stats.SuccessRate = float64(successStats.Successful) / float64(successStats.Total)
	}
	logDAOStage(
		requestID,
		route,
		daoMethod,
		"success_rate",
		successRateStartedAt,
		nil,
		map[string]interface{}{
			"userId":          userID,
			"domainId":        domainID,
			"reviewTotal":     successStats.Total,
			"successfulTotal": successStats.Successful,
			"successRate":     stats.SuccessRate,
		},
	)

	return &stats, nil
}
