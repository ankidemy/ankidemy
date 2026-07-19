package dao

import (
	"ankidemy/server/models"
	"gorm.io/gorm"
)

// SourceDAO handles CRUD for sources.
type SourceDAO struct {
	db *gorm.DB
}

func NewSourceDAO(db *gorm.DB) *SourceDAO {
	return &SourceDAO{db: db}
}

func (d *SourceDAO) Create(source *models.Source) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(source).Error; err != nil {
			return err
		}
		registry := NewCodeRegistryDAO(tx)
		if err := registry.ReserveCode(tx, source.DomainID, source.Code, "source", source.ID); err != nil {
			return err
		}
		return nil
	})
}

func (d *SourceDAO) Update(source *models.Source, codeChanged bool) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(source).Error; err != nil {
			return err
		}
		if codeChanged {
			registry := NewCodeRegistryDAO(tx)
			if err := registry.UpdateCode(tx, source.DomainID, "source", source.ID, source.Code); err != nil {
				return err
			}
		}
		return nil
	})
}

func (d *SourceDAO) Delete(source *models.Source) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.Source{}, source.ID).Error; err != nil {
			return err
		}
		registry := NewCodeRegistryDAO(tx)
		return registry.ReleaseCode(tx, source.DomainID, "source", source.ID)
	})
}

func (d *SourceDAO) FindByID(id uint) (*models.Source, error) {
	var source models.Source
	if err := d.db.First(&source, id).Error; err != nil {
		return nil, err
	}
	return &source, nil
}

func (d *SourceDAO) ListVisible(domainID uint, userID uint) ([]models.Source, error) {
	var sources []models.Source
	err := d.db.Where("domain_id = ? AND (visibility = 'domain' OR owner_id = ?)", domainID, userID).
		Find(&sources).Error
	if err != nil {
		return nil, err
	}
	return sources, nil
}
