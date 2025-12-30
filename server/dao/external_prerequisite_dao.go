package dao

import (
	"errors"
	"myapp/server/models"

	"gorm.io/gorm"
)

type ExternalPrerequisiteDAO struct {
	db *gorm.DB
}

func NewExternalPrerequisiteDAO(db *gorm.DB) *ExternalPrerequisiteDAO {
	return &ExternalPrerequisiteDAO{db: db}
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
