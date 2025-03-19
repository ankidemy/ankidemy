package dao

import (
	"errors"
	"myapp/server/models"

	"gorm.io/gorm"
)

// DefinitionDAO handles database operations for definitions
type DefinitionDAO struct {
	db *gorm.DB
}

// NewDefinitionDAO creates a new DefinitionDAO instance
func NewDefinitionDAO(db *gorm.DB) *DefinitionDAO {
	return &DefinitionDAO{db: db}
}

// Create creates a new definition
func (d *DefinitionDAO) Create(definition *models.Definition, references []string, prerequisiteIDs []uint) error {
	// Use transaction to ensure all operations succeed or fail together
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Create the definition
		if err := tx.Create(definition).Error; err != nil {
			return err
		}
		
		// Add references
		if len(references) > 0 {
			for _, ref := range references {
				reference := models.Reference{
					DefinitionID: definition.ID,
					Reference:    ref,
				}
				if err := tx.Create(&reference).Error; err != nil {
					return err
				}
			}
		}
		
		// Add prerequisites
		if len(prerequisiteIDs) > 0 {
			for _, prereqID := range prerequisiteIDs {
				var prereq models.Definition
				if err := tx.First(&prereq, prereqID).Error; err != nil {
					return err
				}
				
				if err := tx.Model(definition).Association("Prerequisites").Append(&prereq); err != nil {
					return err
				}
			}
		}
		
		return nil
	})
}

// Update updates an existing definition
func (d *DefinitionDAO) Update(definition *models.Definition, references []string, prerequisiteIDs []uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Update the definition
		if err := tx.Save(definition).Error; err != nil {
			return err
		}
		
		// Update references (delete old ones, add new ones)
		if err := tx.Where("definition_id = ?", definition.ID).Delete(&models.Reference{}).Error; err != nil {
			return err
		}
		
		if len(references) > 0 {
			for _, ref := range references {
				reference := models.Reference{
					DefinitionID: definition.ID,
					Reference:    ref,
				}
				if err := tx.Create(&reference).Error; err != nil {
					return err
				}
			}
		}
		
		// Update prerequisites (clear existing, add new ones)
		if err := tx.Model(definition).Association("Prerequisites").Clear(); err != nil {
			return err
		}
		
		if len(prerequisiteIDs) > 0 {
			for _, prereqID := range prerequisiteIDs {
				var prereq models.Definition
				if err := tx.First(&prereq, prereqID).Error; err != nil {
					return err
				}
				
				if err := tx.Model(definition).Association("Prerequisites").Append(&prereq); err != nil {
					return err
				}
			}
		}
		
		return nil
	})
}

// Delete deletes a definition by ID
func (d *DefinitionDAO) Delete(id uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Clear associations first
		var definition models.Definition
		if err := tx.First(&definition, id).Error; err != nil {
			return err
		}
		
		if err := tx.Model(&definition).Association("Prerequisites").Clear(); err != nil {
			return err
		}
		
		// Delete references
		if err := tx.Where("definition_id = ?", id).Delete(&models.Reference{}).Error; err != nil {
			return err
		}
		
		// Delete the definition
		return tx.Delete(&models.Definition{}, id).Error
	})
}

// FindByID finds a definition by ID
func (d *DefinitionDAO) FindByID(id uint) (*models.Definition, error) {
	var definition models.Definition
	result := d.db.
		Preload("References").
		Preload("Prerequisites").
		First(&definition, id)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("definition not found")
		}
		return nil, result.Error
	}
	
	return &definition, nil
}

// FindByCode finds a definition by its code
func (d *DefinitionDAO) FindByCode(code string) (*models.Definition, error) {
	var definition models.Definition
	result := d.db.
		Preload("References").
		Preload("Prerequisites").
		Where("code = ?", code).
		First(&definition)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("definition not found")
		}
		return nil, result.Error
	}
	
	return &definition, nil
}

// GetByDomainID returns all definitions for a domain
func (d *DefinitionDAO) GetByDomainID(domainID uint) ([]models.Definition, error) {
	var definitions []models.Definition
	result := d.db.
		Preload("References").
		Preload("Prerequisites").
		Where("domain_id = ?", domainID).
		Find(&definitions)
	
	return definitions, result.Error
}

// GetAll returns all definitions
func (d *DefinitionDAO) GetAll() ([]models.Definition, error) {
	var definitions []models.Definition
	result := d.db.
		Preload("References").
		Preload("Prerequisites").
		Find(&definitions)
	
	return definitions, result.Error
}

// ConvertToResponse converts a Definition model to a DefinitionResponse
func (d *DefinitionDAO) ConvertToResponse(definition *models.Definition) models.DefinitionResponse {
	// Extract reference strings
	references := make([]string, 0, len(definition.References))
	for _, ref := range definition.References {
		references = append(references, ref.Reference)
	}
	
	// Extract prerequisite codes
	prerequisites := make([]string, 0, len(definition.Prerequisites))
	for _, prereq := range definition.Prerequisites {
		prerequisites = append(prerequisites, prereq.Code)
	}
	
	return models.DefinitionResponse{
		ID:            definition.ID,
		Code:          definition.Code,
		Name:          definition.Name,
		Description:   definition.Description,
		Notes:         definition.Notes,
		References:    references,
		Prerequisites: prerequisites,
		DomainID:      definition.DomainID,
		OwnerID:       definition.OwnerID,
		XPosition:     definition.XPosition,
		YPosition:     definition.YPosition,
		CreatedAt:     definition.CreatedAt,
		UpdatedAt:     definition.UpdatedAt,
	}
}

// UpdatePositions updates the x,y positions of multiple definitions
func (d *DefinitionDAO) UpdatePositions(positions map[uint]struct{ X, Y float64 }) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		for id, pos := range positions {
			if err := tx.Model(&models.Definition{}).Where("id = ?", id).Updates(map[string]interface{}{
				"x_position": pos.X,
				"y_position": pos.Y,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
