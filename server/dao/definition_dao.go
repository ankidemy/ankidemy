// dao/definition_dao.go - Updated to use node_prerequisites directly

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

// Create creates a new definition with prerequisites managed via node_prerequisites
func (d *DefinitionDAO) Create(definition *models.Definition, references []string, prerequisiteIDs []uint) error {
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
		
		// Add prerequisites to node_prerequisites table
		if len(prerequisiteIDs) > 0 {
			for _, prereqID := range prerequisiteIDs {
				// Verify prerequisite exists
				var count int64
				if err := tx.Model(&models.Definition{}).Where("id = ?", prereqID).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					continue // Skip invalid prerequisite
				}
				
				prerequisite := models.NodePrerequisite{
					NodeID:           definition.ID,
					NodeType:         "definition",
					PrerequisiteID:   prereqID,
					PrerequisiteType: "definition",
					Weight:           1.0,
					IsManual:         false,
				}
				
				if err := tx.Create(&prerequisite).Error; err != nil {
					// Ignore duplicates
					continue
				}
			}
		}
		
		return nil
	})
}

// Update updates an existing definition and its prerequisites
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
		if err := tx.Where("node_id = ? AND node_type = ?", definition.ID, "definition").
			Delete(&models.NodePrerequisite{}).Error; err != nil {
			return err
		}
		
		if len(prerequisiteIDs) > 0 {
			for _, prereqID := range prerequisiteIDs {
				// Verify prerequisite exists
				var count int64
				if err := tx.Model(&models.Definition{}).Where("id = ?", prereqID).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					continue // Skip invalid prerequisite
				}
				
				prerequisite := models.NodePrerequisite{
					NodeID:           definition.ID,
					NodeType:         "definition",
					PrerequisiteID:   prereqID,
					PrerequisiteType: "definition",
					Weight:           1.0,
					IsManual:         false,
				}
				
				if err := tx.Create(&prerequisite).Error; err != nil {
					// Ignore duplicates
					continue
				}
			}
		}
		
		return nil
	})
}

// Delete deletes a definition and its prerequisites
func (d *DefinitionDAO) Delete(id uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Delete prerequisites where this definition is involved
		if err := tx.Where("(node_id = ? AND node_type = ?) OR (prerequisite_id = ? AND prerequisite_type = ?)", 
			id, "definition", id, "definition").Delete(&models.NodePrerequisite{}).Error; err != nil {
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

// FindByID finds a definition by ID and loads its prerequisites
func (d *DefinitionDAO) FindByID(id uint) (*models.Definition, error) {
	var definition models.Definition
	result := d.db.Preload("References").First(&definition, id)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("definition not found")
		}
		return nil, result.Error
	}
	
	return &definition, nil
}

// FindByIDWithPrerequisites finds a definition by ID and loads its prerequisites
func (d *DefinitionDAO) FindByIDWithPrerequisites(id uint) (*models.DefinitionWithPrerequisites, error) {
	definition, err := d.FindByID(id)
	if err != nil {
		return nil, err
	}
	
	prerequisiteCodes, err := d.getPrerequisiteCodes(id, "definition")
	if err != nil {
		return nil, err
	}
	
	return &models.DefinitionWithPrerequisites{
		Definition:        *definition,
		PrerequisiteCodes: prerequisiteCodes,
	}, nil
}

// FindByCode finds definitions by code and loads their prerequisites
func (d *DefinitionDAO) FindByCode(code string) ([]*models.DefinitionWithPrerequisites, error) {
	var definitions []models.Definition
	result := d.db.Preload("References").Where("code = ?", code).Find(&definitions)
	
	if result.Error != nil {
		return nil, result.Error
	}
	
	if len(definitions) == 0 {
		return nil, errors.New("definitions not found")
	}
	
	// Load prerequisites for each definition
	var results []*models.DefinitionWithPrerequisites
	for _, def := range definitions {
		prerequisiteCodes, err := d.getPrerequisiteCodes(def.ID, "definition")
		if err != nil {
			return nil, err
		}
		
		results = append(results, &models.DefinitionWithPrerequisites{
			Definition:        def,
			PrerequisiteCodes: prerequisiteCodes,
		})
	}
	
	return results, nil
}

// FindByCodeAndDomain finds a definition by code within a specific domain
func (d *DefinitionDAO) FindByCodeAndDomain(code string, domainID uint) (*models.DefinitionWithPrerequisites, error) {
	var definition models.Definition
	result := d.db.Preload("References").Where("code = ? AND domain_id = ?", code, domainID).First(&definition)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("definition not found")
		}
		return nil, result.Error
	}
	
	prerequisiteCodes, err := d.getPrerequisiteCodes(definition.ID, "definition")
	if err != nil {
		return nil, err
	}
	
	return &models.DefinitionWithPrerequisites{
		Definition:        definition,
		PrerequisiteCodes: prerequisiteCodes,
	}, nil
}

// GetByDomainID returns all definitions for a domain with their prerequisites
func (d *DefinitionDAO) GetByDomainID(domainID uint) ([]models.DefinitionWithPrerequisites, error) {
	var definitions []models.Definition
	result := d.db.Preload("References").Where("domain_id = ?", domainID).Find(&definitions)
	
	if result.Error != nil {
		return nil, result.Error
	}
	
	// Load prerequisites for each definition
	var results []models.DefinitionWithPrerequisites
	for _, def := range definitions {
		prerequisiteCodes, err := d.getPrerequisiteCodes(def.ID, "definition")
		if err != nil {
			return nil, err
		}
		
		results = append(results, models.DefinitionWithPrerequisites{
			Definition:        def,
			PrerequisiteCodes: prerequisiteCodes,
		})
	}
	
	return results, nil
}

// ConvertToResponse converts a DefinitionWithPrerequisites to a DefinitionResponse
func (d *DefinitionDAO) ConvertToResponse(definition *models.DefinitionWithPrerequisites) models.DefinitionResponse {
	// Extract reference strings
	references := make([]string, 0, len(definition.References))
	for _, ref := range definition.References {
		references = append(references, ref.Reference)
	}
	
	return models.DefinitionResponse{
		ID:            definition.ID,
		Code:          definition.Code,
		Name:          definition.Name,
		Description:   definition.Description,
		Notes:         definition.Notes,
		References:    references,
		Prerequisites: definition.PrerequisiteCodes,
		DomainID:      definition.DomainID,
		OwnerID:       definition.OwnerID,
		XPosition:     definition.XPosition,
		YPosition:     definition.YPosition,
		CreatedAt:     definition.CreatedAt,
		UpdatedAt:     definition.UpdatedAt,
	}
}

// Helper function to get prerequisite codes for a node
func (d *DefinitionDAO) getPrerequisiteCodes(nodeID uint, nodeType string) ([]string, error) {
	query := `
		SELECT d.code 
		FROM node_prerequisites np
		JOIN definitions d ON np.prerequisite_id = d.id 
		WHERE np.node_id = ? AND np.node_type = ? AND np.prerequisite_type = 'definition'
		ORDER BY d.code
	`
	
	var codes []string
	if err := d.db.Raw(query, nodeID, nodeType).Scan(&codes).Error; err != nil {
		return nil, err
	}
	
	return codes, nil
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
