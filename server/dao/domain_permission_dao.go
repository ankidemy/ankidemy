package dao

import (
	"ankidemy/server/models"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// DomainPermissionDAO handles domain permission queries.
type DomainPermissionDAO struct {
	db *gorm.DB
}

func NewDomainPermissionDAO(db *gorm.DB) *DomainPermissionDAO {
	return &DomainPermissionDAO{db: db}
}

func (d *DomainPermissionDAO) GetRole(domainID, userID uint) (string, bool, error) {
	var perm models.DomainPermission
	tx := d.db.Where("domain_id = ? AND user_id = ?", domainID, userID).Limit(1).Find(&perm)
	if tx.Error != nil {
		return "", false, tx.Error
	}
	if tx.RowsAffected == 0 {
		return "", false, nil
	}
	return perm.Role, true, nil
}

func (d *DomainPermissionDAO) UpsertPermission(domainID, userID uint, role string) error {
	if role == "" {
		return errors.New("role is required")
	}
	perm := models.DomainPermission{
		DomainID: domainID,
		UserID:   userID,
		Role:     role,
	}
	return d.db.
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "domain_id"}, {Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"role", "updated_at"}),
		}).
		Create(&perm).Error
}

func (d *DomainPermissionDAO) RemovePermission(domainID, userID uint) error {
	return d.db.Where("domain_id = ? AND user_id = ?", domainID, userID).
		Delete(&models.DomainPermission{}).Error
}

func (d *DomainPermissionDAO) ListPermissions(domainID uint) ([]models.DomainPermission, error) {
	var perms []models.DomainPermission
	if err := d.db.Where("domain_id = ?", domainID).Find(&perms).Error; err != nil {
		return nil, err
	}
	return perms, nil
}

func (d *DomainPermissionDAO) ListPermissionsForUser(userID uint) ([]models.DomainPermission, error) {
	var perms []models.DomainPermission
	if err := d.db.Where("user_id = ?", userID).Find(&perms).Error; err != nil {
		return nil, err
	}
	return perms, nil
}
