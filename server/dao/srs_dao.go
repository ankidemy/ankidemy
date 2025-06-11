package dao

import (
	"errors"
	"fmt"
	"time"
	"myapp/server/models"
	"gorm.io/gorm"
)

// SRSDao handles all SRS-related database operations
type SRSDao struct {
	db *gorm.DB
}

// NewSRSDao creates a new SRSDao instance
func NewSRSDao(db *gorm.DB) *SRSDao {
	return &SRSDao{db: db}
}

// === Node Prerequisites ===

// CreatePrerequisite creates a new prerequisite relationship
func (d *SRSDao) CreatePrerequisite(prerequisite *models.NodePrerequisite) error {
	return d.db.Create(prerequisite).Error
}

// GetPrerequisitesByDomain gets all prerequisites for nodes in a domain
func (d *SRSDao) GetPrerequisitesByDomain(domainID uint) ([]models.NodePrerequisite, error) {
	var prerequisites []models.NodePrerequisite
	
	// Get prerequisites for definitions
	definitionQuery := `
		SELECT np.* FROM node_prerequisites np
		JOIN definitions d ON (np.node_id = d.id AND np.node_type = 'definition') 
		   OR (np.prerequisite_id = d.id AND np.prerequisite_type = 'definition')
		WHERE d.domain_id = ?
	`
	
	// Get prerequisites for exercises
	exerciseQuery := `
		SELECT np.* FROM node_prerequisites np
		JOIN exercises e ON (np.node_id = e.id AND np.node_type = 'exercise')
		   OR (np.prerequisite_id = e.id AND np.prerequisite_type = 'exercise')
		WHERE e.domain_id = ?
	`
	
	var defPrereqs []models.NodePrerequisite
	var exPrereqs []models.NodePrerequisite
	
	if err := d.db.Raw(definitionQuery, domainID).Scan(&defPrereqs).Error; err != nil {
		return nil, err
	}
	
	if err := d.db.Raw(exerciseQuery, domainID).Scan(&exPrereqs).Error; err != nil {
		return nil, err
	}
	
	// Combine and deduplicate
	prereqMap := make(map[string]models.NodePrerequisite)
	for _, prereq := range defPrereqs {
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
	result := d.db.Where("user_id = ? AND node_id = ? AND node_type = ?", userID, nodeID, nodeType).First(&progress)
	
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return nil, nil // No progress found, not an error
	}
	
	return &progress, result.Error
}

// CreateOrUpdateProgress creates or updates user progress
func (d *SRSDao) CreateOrUpdateProgress(progress *models.UserNodeProgress) error {
	return d.db.Save(progress).Error
}

// GetDomainProgress gets all progress for a user in a domain
func (d *SRSDao) GetDomainProgress(userID uint, domainID uint) ([]models.NodeProgress, error) {
	var results []models.NodeProgress
	
	// Get definition progress
	defQuery := `
		SELECT 
			d.id as node_id,
			'definition' as node_type,
			d.code as node_code,
			d.name as node_name,
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
		FROM definitions d
		LEFT JOIN user_node_progress unp ON d.id = unp.node_id 
			AND unp.node_type = 'definition' AND unp.user_id = ?
		WHERE d.domain_id = ?
	`
	
	// Get exercise progress
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
		FROM exercises e
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

// GetDueReviews gets nodes due for review
func (d *SRSDao) GetDueReviews(userID uint, domainID uint, nodeType string) ([]models.NodeProgress, error) {
	var results []models.NodeProgress
	
	var query string
	if nodeType == "definition" {
		query = `
			SELECT 
				d.id as node_id,
				'definition' as node_type,
				d.code as node_code,
				d.name as node_name,
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
			FROM definitions d
			JOIN user_node_progress unp ON d.id = unp.node_id 
				AND unp.node_type = 'definition' AND unp.user_id = ?
			WHERE d.domain_id = ? AND unp.status = 'grasped' 
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
			ORDER BY unp.next_review ASC NULLS FIRST
		`
	} else if nodeType == "exercise" {
		query = `
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
			FROM exercises e
			JOIN user_node_progress unp ON e.id = unp.node_id 
				AND unp.node_type = 'exercise' AND unp.user_id = ?
			WHERE e.domain_id = ? AND unp.status = 'grasped' 
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
			ORDER BY unp.next_review ASC NULLS FIRST
		`
	} else {
		// Mixed - get both
		defQuery := `
			SELECT 
				d.id as node_id,
				'definition' as node_type,
				d.code as node_code,
				d.name as node_name,
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
			FROM definitions d
			JOIN user_node_progress unp ON d.id = unp.node_id 
				AND unp.node_type = 'definition' AND unp.user_id = ?
			WHERE d.domain_id = ? AND unp.status = 'grasped' 
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
		`
		
		exQuery := `
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
			FROM exercises e
			JOIN user_node_progress unp ON e.id = unp.node_id 
				AND unp.node_type = 'exercise' AND unp.user_id = ?
			WHERE e.domain_id = ? AND unp.status = 'grasped' 
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
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
	
	return results, d.db.Raw(query, userID, domainID).Scan(&results).Error
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
func (d *SRSDao) GetDomainStats(userID uint, domainID uint) (*models.DomainProgressSummary, error) {
	var stats models.DomainProgressSummary
	stats.DomainID = domainID
	
	// Count total nodes
	var totalDefs int64
	var totalExs int64
	
	d.db.Model(&models.Definition{}).Where("domain_id = ?", domainID).Count(&totalDefs)
	d.db.Model(&models.Exercise{}).Where("domain_id = ?", domainID).Count(&totalExs)
	stats.TotalNodes = int(totalDefs + totalExs)
	
	// Count by status
	statusQuery := `
		SELECT 
			COALESCE(unp.status, 'fresh') as status,
			COUNT(*) as count
		FROM (
			SELECT id, 'definition' as type FROM definitions WHERE domain_id = ?
			UNION ALL
			SELECT id, 'exercise' as type FROM exercises WHERE domain_id = ?
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
	
	// Count due reviews
	dueQuery := `
		SELECT COUNT(*) FROM (
			SELECT d.id FROM definitions d
			JOIN user_node_progress unp ON d.id = unp.node_id 
				AND unp.node_type = 'definition' AND unp.user_id = ?
			WHERE d.domain_id = ? AND unp.status = 'grasped' 
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
			UNION ALL
			SELECT e.id FROM exercises e
			JOIN user_node_progress unp ON e.id = unp.node_id 
				AND unp.node_type = 'exercise' AND unp.user_id = ?
			WHERE e.domain_id = ? AND unp.status = 'grasped' 
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
		) due_nodes
	`
	
	var dueCount int64
	if err := d.db.Raw(dueQuery, userID, domainID, userID, domainID).Count(&dueCount).Error; err != nil {
		return nil, err
	}
	stats.DueReviews = int(dueCount)
	
	// Count completed today
	todayQuery := `
		SELECT COUNT(*) FROM review_history
		WHERE user_id = ? AND DATE(review_time) = CURRENT_DATE
			AND review_type = 'explicit'
			AND (node_id, node_type) IN (
				SELECT id, 'definition' FROM definitions WHERE domain_id = ?
				UNION ALL
				SELECT id, 'exercise' FROM exercises WHERE domain_id = ?
			)
	`
	
	var todayCount int64
	if err := d.db.Raw(todayQuery, userID, domainID, domainID).Count(&todayCount).Error; err != nil {
		return nil, err
	}
	stats.CompletedToday = int(todayCount)
	
	// Calculate success rate
	successQuery := `
		SELECT 
			COUNT(*) as total,
			COUNT(CASE WHEN success THEN 1 END) as successful
		FROM review_history
		WHERE user_id = ? AND review_type = 'explicit'
			AND (node_id, node_type) IN (
				SELECT id, 'definition' FROM definitions WHERE domain_id = ?
				UNION ALL
				SELECT id, 'exercise' FROM exercises WHERE domain_id = ?
			)
	`
	
	var successStats struct {
		Total      int64
		Successful int64
	}
	
	if err := d.db.Raw(successQuery, userID, domainID, domainID).Scan(&successStats).Error; err != nil {
		return nil, err
	}
	
	if successStats.Total > 0 {
		stats.SuccessRate = float64(successStats.Successful) / float64(successStats.Total)
	}
	
	return &stats, nil
}
