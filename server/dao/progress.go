package dao

import (
	"time"

	"ankidemy/server/models"

	"gorm.io/gorm"
)

// ProgressDAO handles domain enrollment and aggregate progress tracking.
// Per-node SRS state lives in user_node_progress (see SRSDao).
type ProgressDAO struct {
	db *gorm.DB
}

// NewProgressDAO creates a new ProgressDAO instance
func NewProgressDAO(db *gorm.DB) *ProgressDAO {
	return &ProgressDAO{db: db}
}

// EnrollUserInDomain enrolls a user in a domain (or updates enrollment if exists)
func (d *ProgressDAO) EnrollUserInDomain(userID, domainID uint) error {
	progress := models.UserDomainProgress{
		UserID:   userID,
		DomainID: domainID,
	}

	// Check if enrollment already exists
	var existingCount int64
	d.db.Model(&models.UserDomainProgress{}).
		Where("user_id = ? AND domain_id = ?", userID, domainID).
		Count(&existingCount)

	if existingCount > 0 {
		// Update existing enrollment
		return d.db.Model(&models.UserDomainProgress{}).
			Where("user_id = ? AND domain_id = ?", userID, domainID).
			Updates(map[string]interface{}{
				"last_activity": time.Now(),
			}).Error
	}

	// Create new enrollment
	return d.db.Create(&progress).Error
}

// UpdateDomainProgress recomputes a user's aggregate domain progress as the
// share of nodes that are grasped or learned.
func (d *ProgressDAO) UpdateDomainProgress(userID, domainID uint) error {
	var totalNodes int64
	countQuery := `
		SELECT (SELECT COUNT(*) FROM meta_definitions WHERE domain_id = ?)
		     + (SELECT COUNT(*) FROM meta_exercises WHERE domain_id = ?)
	`
	if err := d.db.Raw(countQuery, domainID, domainID).Scan(&totalNodes).Error; err != nil {
		return err
	}

	var advancedNodes int64
	advancedQuery := `
		SELECT COUNT(*) FROM user_node_progress unp
		WHERE unp.user_id = ? AND unp.status IN ('grasped', 'learned')
		  AND (
		    (unp.node_type = 'definition' AND unp.node_id IN (SELECT id FROM meta_definitions WHERE domain_id = ?))
		    OR
		    (unp.node_type = 'exercise' AND unp.node_id IN (SELECT id FROM meta_exercises WHERE domain_id = ?))
		  )
	`
	if err := d.db.Raw(advancedQuery, userID, domainID, domainID).Scan(&advancedNodes).Error; err != nil {
		return err
	}

	var progress float64
	if totalNodes > 0 {
		progress = float64(advancedNodes) / float64(totalNodes) * 100
	}

	return d.db.Model(&models.UserDomainProgress{}).
		Where("user_id = ? AND domain_id = ?", userID, domainID).
		Updates(map[string]interface{}{
			"progress":      progress,
			"last_activity": time.Now(),
		}).Error
}

// GetUserDomainProgress gets a user's progress for all enrolled domains
func (d *ProgressDAO) GetUserDomainProgress(userID uint) ([]models.UserDomainProgress, error) {
	var progress []models.UserDomainProgress
	result := d.db.
		Preload("Domain").
		Where("user_id = ?", userID).
		Find(&progress)

	return progress, result.Error
}

// IsUserEnrolled checks if a user is enrolled in a domain.
func (d *ProgressDAO) IsUserEnrolled(userID, domainID uint) (bool, error) {
	var count int64
	if err := d.db.Model(&models.UserDomainProgress{}).
		Where("user_id = ? AND domain_id = ?", userID, domainID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}
