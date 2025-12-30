package dao

import (
	"errors"
	"gorm.io/gorm"
	"myapp/server/models"
)

// MetaDefinitionDAO handles DB operations for meta definitions and versions
type MetaDefinitionDAO struct{ DB *gorm.DB }

func NewMetaDefinitionDAO(db *gorm.DB) *MetaDefinitionDAO { return &MetaDefinitionDAO{DB: db} }

// ListByDomain returns all meta definitions for a domain.
func (d *MetaDefinitionDAO) ListByDomain(domainID uint) ([]models.MetaDefinition, error) {
	var defs []models.MetaDefinition
	if err := d.DB.Where("domain_id = ?", domainID).Find(&defs).Error; err != nil {
		return nil, err
	}
	return defs, nil
}

// Create a meta definition and its prerequisites
func (d *MetaDefinitionDAO) Create(meta *models.MetaDefinition, prerequisiteIDs []uint, weights map[uint]float64) error {
	return d.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(meta).Error; err != nil {
			return err
		}

		// Attach prerequisites (only meta_definition allowed for concept graph purity)
		for _, pid := range prerequisiteIDs {
			// Determine prerequisite type by checking which table has the ID
			prereqType, err := d.determinePrerequisiteType(tx, pid)
			if err != nil {
				return err // Abort transaction on invalid prerequisite
			}

			w := 1.0
			if weights != nil {
				if val, ok := weights[pid]; ok {
					if val < 0.01 {
						w = 0.01
					} else if val > 1.0 {
						w = 1.0
					} else {
						w = val
					}
				}
			}

			p := &models.NodePrerequisite{
				NodeID:           meta.ID,
				NodeType:         "meta_definition",
				PrerequisiteID:   pid,
				PrerequisiteType: prereqType,
				Weight:           w,
			}
			_ = tx.Create(p).Error
		}
		return nil
	})
}

// Update meta and reset prerequisites
func (d *MetaDefinitionDAO) Update(meta *models.MetaDefinition, prerequisiteIDs []uint, weights map[uint]float64) error {
	return d.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(meta).Error; err != nil {
			return err
		}

		if err := tx.Where("node_id = ? AND node_type = ?", meta.ID, "meta_definition").Delete(&models.NodePrerequisite{}).Error; err != nil {
			return err
		}

		for _, pid := range prerequisiteIDs {
			prereqType, err := d.determinePrerequisiteType(tx, pid)
			if err != nil {
				return err // Abort transaction on invalid prerequisite
			}

			w := 1.0
			if weights != nil {
				if val, ok := weights[pid]; ok {
					if val < 0.01 {
						w = 0.01
					} else if val > 1.0 {
						w = 1.0
					} else {
						w = val
					}
				}
			}

			p := &models.NodePrerequisite{
				NodeID:           meta.ID,
				NodeType:         "meta_definition",
				PrerequisiteID:   pid,
				PrerequisiteType: prereqType,
				Weight:           w,
			}
			_ = tx.Create(p).Error
		}
		return nil
	})
}

// determinePrerequisiteType checks which table contains the given ID and returns the type
// For meta_definition nodes, only 'meta_definition' is allowed (concept→concept purity)
func (d *MetaDefinitionDAO) determinePrerequisiteType(tx *gorm.DB, id uint) (string, error) {
	// Check meta_definition first
	var metaDefCnt int64
	if err := tx.Model(&models.MetaDefinition{}).Where("id = ?", id).Count(&metaDefCnt).Error; err == nil && metaDefCnt > 0 {
		return "meta_definition", nil
	}

	// Disallow legacy definitions explicitly to keep concept graph pure
	var defCnt int64
	if err := tx.Model(&models.Definition{}).Where("id = ?", id).Count(&defCnt).Error; err == nil && defCnt > 0 {
		return "", errors.New("meta_definition nodes cannot have definition prerequisites (concept graph purity)")
	}

	// Explicitly check if it's a meta_exercise to give a better error
	var metaExCnt int64
	if err := tx.Model(&models.MetaExercise{}).Where("id = ?", id).Count(&metaExCnt).Error; err == nil && metaExCnt > 0 {
		return "", errors.New("meta_definition nodes cannot have meta_exercise prerequisites (concept graph purity)")
	}

	return "", errors.New("prerequisite not found")
}

// UpdateFields updates meta-definition fields without touching prerequisites
func (d *MetaDefinitionDAO) UpdateFields(meta *models.MetaDefinition) error {
	return d.DB.Save(meta).Error
}

// UpdateFieldsAndCascade updates the meta-definition and cascades selected fields
// (code/name) into all related definition versions within a single transaction.
func (d *MetaDefinitionDAO) UpdateFieldsAndCascade(meta *models.MetaDefinition, cascadeCode bool, cascadeName bool) error {
	return d.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(meta).Error; err != nil {
			return err
		}
		if cascadeCode {
			if err := tx.Model(&models.Definition{}).
				Where("meta_definition_id = ?", meta.ID).
				Update("code", meta.Code).Error; err != nil {
				return err
			}
		}
		if cascadeName {
			if err := tx.Model(&models.Definition{}).
				Where("meta_definition_id = ?", meta.ID).
				Update("name", meta.Name).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// AddVersion creates a new Definition row under a MetaDefinition
func (d *MetaDefinitionDAO) AddVersion(metaID uint, req *models.DefinitionVersionRequest) (*models.Definition, error) {
	// Load meta for mirroring fields
	var meta models.MetaDefinition
	if err := d.DB.First(&meta, metaID).Error; err != nil {
		return nil, err
	}

	// Set default type if not provided
	defType := req.Type
	if defType == "" {
		defType = "open_ended"
	}

	// Set default prompt if not provided
	prompt := req.Prompt
	if prompt == "" {
		prompt = "Define " + meta.Name
	}

	def := &models.Definition{
		Code:                 meta.Code,
		Name:                 meta.Name,
		Prompt:               prompt,
		Type:                 defType,
		Description:          req.Description,
		Notes:                req.Notes,
		PromptImagePath:      req.PromptImagePath,
		DescriptionImagePath: req.DescriptionImagePath,
		DomainID:             meta.DomainID,
		OwnerID:              meta.OwnerID,
		MetaDefinitionID:     meta.ID,
		XPosition:            meta.XPosition,
		YPosition:            meta.YPosition,
	}

	err := d.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(def).Error; err != nil {
			return err
		}

		// Create references
		for _, ref := range req.References {
			if ref != "" {
				r := &models.Reference{
					DefinitionID: def.ID,
					Reference:    ref,
				}
				if err := tx.Create(r).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	return def, nil
}

// UpdateVersion updates an existing Definition version
func (d *MetaDefinitionDAO) UpdateVersion(versionID uint, req *models.DefinitionVersionRequest) (*models.Definition, error) {
	var def models.Definition
	if err := d.DB.First(&def, versionID).Error; err != nil {
		return nil, err
	}

	if req.Prompt != "" {
		def.Prompt = req.Prompt
	}
	if req.Type != "" {
		def.Type = req.Type
	}
	def.Description = req.Description
	def.Notes = req.Notes
	def.PromptImagePath = req.PromptImagePath
	def.DescriptionImagePath = req.DescriptionImagePath

	err := d.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&def).Error; err != nil {
			return err
		}

		// Update references: delete all and recreate
		if err := tx.Where("definition_id = ?", def.ID).Delete(&models.Reference{}).Error; err != nil {
			return err
		}

		for _, ref := range req.References {
			if ref != "" {
				r := &models.Reference{
					DefinitionID: def.ID,
					Reference:    ref,
				}
				if err := tx.Create(r).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	return &def, nil
}

// DeleteVersion removes a Definition version
func (d *MetaDefinitionDAO) DeleteVersion(versionID uint) error {
	return d.DB.Transaction(func(tx *gorm.DB) error {
		// Load the version to find its meta_definition_id
		var def models.Definition
		if err := tx.First(&def, versionID).Error; err != nil {
			return err
		}

		// Count how many versions exist under this meta definition
		var count int64
		if err := tx.Model(&models.Definition{}).Where("meta_definition_id = ?", def.MetaDefinitionID).Count(&count).Error; err != nil {
			return err
		}
		if count <= 1 {
			return errors.New("cannot delete the last version; a meta-definition must have at least one version")
		}

		// Delete references first
		if err := tx.Where("definition_id = ?", versionID).Delete(&models.Reference{}).Error; err != nil {
			return err
		}

		// Safe to delete
		return tx.Delete(&models.Definition{}, versionID).Error
	})
}

// Delete removes a meta-definition, its versions, and related prerequisites.
func (d *MetaDefinitionDAO) Delete(id uint) error {
	return d.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("node_id = ? AND node_type = ?", id, "meta_definition").Delete(&models.NodePrerequisite{}).Error; err != nil {
			return err
		}
		if err := tx.Where("prerequisite_id = ? AND prerequisite_type = ?", id, "meta_definition").Delete(&models.NodePrerequisite{}).Error; err != nil {
			return err
		}

		var versionIDs []uint
		if err := tx.Model(&models.Definition{}).Where("meta_definition_id = ?", id).Pluck("id", &versionIDs).Error; err != nil {
			return err
		}
		if len(versionIDs) > 0 {
			if err := tx.Where("definition_id IN ?", versionIDs).Delete(&models.Reference{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("meta_definition_id = ?", id).Delete(&models.Definition{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.MetaDefinition{}, id).Error
	})
}

// FindByID returns meta and versions
func (d *MetaDefinitionDAO) FindByID(id uint) (*models.MetaDefinition, []models.Definition, error) {
	var meta models.MetaDefinition
	if err := d.DB.First(&meta, id).Error; err != nil {
		return nil, nil, err
	}

	var versions []models.Definition
	if err := d.DB.Where("meta_definition_id = ?", id).Order("id ASC").Find(&versions).Error; err != nil {
		return nil, nil, err
	}

	return &meta, versions, nil
}

func (d *MetaDefinitionDAO) FindByCodeAndDomain(code string, domainID uint) (*models.MetaDefinition, []models.Definition, error) {
	var meta models.MetaDefinition
	res := d.DB.Where("code = ? AND domain_id = ?", code, domainID).First(&meta)
	if res.Error != nil {
		if errors.Is(res.Error, gorm.ErrRecordNotFound) {
			return nil, nil, errors.New("meta definition not found")
		}
		return nil, nil, res.Error
	}

	var versions []models.Definition
	if err := d.DB.Where("meta_definition_id = ?", meta.ID).Order("id ASC").Find(&versions).Error; err != nil {
		return nil, nil, err
	}

	return &meta, versions, nil
}

func (d *MetaDefinitionDAO) GetByDomainID(domainID uint) ([]models.MetaDefinition, error) {
	var metas []models.MetaDefinition
	if err := d.DB.Where("domain_id = ?", domainID).Find(&metas).Error; err != nil {
		return nil, err
	}
	return metas, nil
}

// ConvertToResponse builds a response including prerequisite codes/weights and optionally versions
// Only includes concept prerequisites (definition and meta_definition)
func (d *MetaDefinitionDAO) ConvertToResponse(meta *models.MetaDefinition, versions []models.Definition, includeVersions bool) (models.MetaDefinitionResponse, error) {
	// Collect prerequisite codes from concept type only (meta_definition)
	var metaDefCodes []string
	if err := d.DB.Raw(`
        SELECT md.code FROM node_prerequisites np
        JOIN meta_definitions md ON md.id = np.prerequisite_id
        WHERE np.node_id = ? AND np.node_type = 'meta_definition' AND np.prerequisite_type = 'meta_definition'
        ORDER BY md.code`, meta.ID).Scan(&metaDefCodes).Error; err != nil {
		return models.MetaDefinitionResponse{}, err
	}

	// Weights for concept prerequisites only
	type row struct {
		Code   string
		Weight float64
	}
	var metaDefRows []row
	if err := d.DB.Raw(`
        SELECT md.code, np.weight FROM node_prerequisites np
        JOIN meta_definitions md ON md.id = np.prerequisite_id
        WHERE np.node_id = ? AND np.node_type = 'meta_definition' AND np.prerequisite_type = 'meta_definition'
        ORDER BY md.code`, meta.ID).Scan(&metaDefRows).Error; err != nil {
		return models.MetaDefinitionResponse{}, err
	}

	weights := make(map[string]float64, len(metaDefRows))
	for _, r := range metaDefRows {
		weights[r.Code] = r.Weight
	}

	resp := models.MetaDefinitionResponse{
		ID:                  meta.ID,
		Code:                meta.Code,
		Name:                meta.Name,
		DomainID:            meta.DomainID,
		OwnerID:             meta.OwnerID,
		XPosition:           meta.XPosition,
		YPosition:           meta.YPosition,
		CreatedAt:           meta.CreatedAt,
		UpdatedAt:           meta.UpdatedAt,
		Prerequisites:       metaDefCodes,
		PrerequisiteWeights: weights,
		VersionCount:        len(versions),
	}

	if includeVersions {
		resp.Versions = make([]models.DefinitionResponse, 0, len(versions))
		for _, v := range versions {
			// Load references
			var refs []models.Reference
			d.DB.Where("definition_id = ?", v.ID).Find(&refs)
			refStrings := make([]string, 0, len(refs))
			for _, r := range refs {
				refStrings = append(refStrings, r.Reference)
			}

			resp.Versions = append(resp.Versions, models.DefinitionResponse{
				ID:                   v.ID,
				Code:                 v.Code,
				Name:                 v.Name,
				Prompt:               v.Prompt,
				PromptImagePath:      v.PromptImagePath,
				DescriptionImagePath: v.DescriptionImagePath,
				Type:                 v.Type,
				Description:          v.Description,
				Notes:                v.Notes,
				References:           refStrings,
				DomainID:             v.DomainID,
				OwnerID:              v.OwnerID,
				MetaDefinitionID:     v.MetaDefinitionID,
				XPosition:            v.XPosition,
				YPosition:            v.YPosition,
				CreatedAt:            v.CreatedAt,
				UpdatedAt:            v.UpdatedAt,
			})
		}
	}

	return resp, nil
}

// CheckCodeExistsInDomain checks if a code already exists in a domain (across both meta_definitions and meta_exercises)
func (d *MetaDefinitionDAO) CheckCodeExistsInDomain(code string, domainID uint) (bool, error) {
	var metaDefCount int64
	if err := d.DB.Model(&models.MetaDefinition{}).
		Where("domain_id = ? AND code = ?", domainID, code).
		Count(&metaDefCount).Error; err != nil {
		return false, err
	}

	if metaDefCount > 0 {
		return true, nil
	}

	var metaExCount int64
	if err := d.DB.Model(&models.MetaExercise{}).
		Where("domain_id = ? AND code = ?", domainID, code).
		Count(&metaExCount).Error; err != nil {
		return false, err
	}

	return metaExCount > 0, nil
}
