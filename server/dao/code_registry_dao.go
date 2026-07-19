package dao

import (
	"errors"
	"strings"

	"ankidemy/server/models"
	"gorm.io/gorm"
)

var ErrCodeConflict = errors.New("code already exists in domain")

type CodeRegistryDAO struct {
	db *gorm.DB
}

func NewCodeRegistryDAO(db *gorm.DB) *CodeRegistryDAO {
	return &CodeRegistryDAO{db: db}
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key value") || strings.Contains(msg, "unique constraint")
}

func (d *CodeRegistryDAO) CodeExists(domainID uint, code string) (bool, error) {
	var count int64
	if err := d.db.Model(&models.DomainNodeCode{}).
		Where("domain_id = ? AND code = ?", domainID, code).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (d *CodeRegistryDAO) ReserveCode(tx *gorm.DB, domainID uint, code string, nodeType string, nodeID uint) error {
	entry := &models.DomainNodeCode{
		DomainID: domainID,
		Code:     code,
		NodeType: nodeType,
		NodeID:   nodeID,
	}
	if err := tx.Create(entry).Error; err != nil {
		if isUniqueViolation(err) {
			return ErrCodeConflict
		}
		return err
	}
	return nil
}

func (d *CodeRegistryDAO) UpdateCode(tx *gorm.DB, domainID uint, nodeType string, nodeID uint, newCode string) error {
	if err := tx.Model(&models.DomainNodeCode{}).
		Where("domain_id = ? AND node_type = ? AND node_id = ?", domainID, nodeType, nodeID).
		Update("code", newCode).Error; err != nil {
		if isUniqueViolation(err) {
			return ErrCodeConflict
		}
		return err
	}
	return nil
}

func (d *CodeRegistryDAO) ReleaseCode(tx *gorm.DB, domainID uint, nodeType string, nodeID uint) error {
	return tx.Where("domain_id = ? AND node_type = ? AND node_id = ?", domainID, nodeType, nodeID).
		Delete(&models.DomainNodeCode{}).Error
}

func (d *CodeRegistryDAO) FindByCode(domainID uint, code string) (*models.DomainNodeCode, error) {
	var entry models.DomainNodeCode
	if err := d.db.Where("domain_id = ? AND code = ?", domainID, code).First(&entry).Error; err != nil {
		return nil, err
	}
	return &entry, nil
}
