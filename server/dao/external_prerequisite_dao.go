package dao

import (
	"ankidemy/server/models"
	"errors"

	"gorm.io/gorm"
)

type ExternalPrerequisiteDAO struct {
	db *gorm.DB
}

func NewExternalPrerequisiteDAO(db *gorm.DB) *ExternalPrerequisiteDAO {
	return &ExternalPrerequisiteDAO{db: db}
}

type ExternalPrerequisitePosition struct {
	ExternalDomainUID string
	ExternalNodeID    uint
	ExternalNodeType  string
	XPosition         float64
	YPosition         float64
}

func (d *ExternalPrerequisiteDAO) ListByDomainID(domainID uint) ([]models.ExternalPrerequisite, error) {
	var links []models.ExternalPrerequisite
	if err := d.db.Where("domain_id = ?", domainID).Find(&links).Error; err != nil {
		return nil, err
	}
	return links, nil
}

func (d *ExternalPrerequisiteDAO) FindByID(id uint) (*models.ExternalPrerequisite, error) {
	var link models.ExternalPrerequisite
	if err := d.db.First(&link, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &link, nil
}

func (d *ExternalPrerequisiteDAO) Create(link *models.ExternalPrerequisite) error {
	return d.db.Create(link).Error
}

func (d *ExternalPrerequisiteDAO) DeleteByID(id uint) error {
	return d.db.Delete(&models.ExternalPrerequisite{}, id).Error
}

func (d *ExternalPrerequisiteDAO) UpdatePositions(domainID uint, positions []ExternalPrerequisitePosition) error {
	if len(positions) == 0 {
		return nil
	}
	return d.db.Transaction(func(tx *gorm.DB) error {
		for _, pos := range positions {
			if pos.ExternalDomainUID == "" {
				continue
			}
			if err := tx.Model(&models.ExternalPrerequisite{}).
				Where("domain_id = ? AND external_domain_uid = ? AND external_node_id = ? AND external_node_type = ?",
					domainID, pos.ExternalDomainUID, pos.ExternalNodeID, pos.ExternalNodeType).
				Updates(map[string]interface{}{
					"x_position": pos.XPosition,
					"y_position": pos.YPosition,
				}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
