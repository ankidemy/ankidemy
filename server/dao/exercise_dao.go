// dao/exercise_dao.go - Updated to use node_prerequisites directly

package dao

import (
	"errors"
	"myapp/server/models"
	"gorm.io/gorm"
)

// ExerciseDAO handles database operations for exercises
type ExerciseDAO struct {
	db *gorm.DB
}

// NewExerciseDAO creates a new ExerciseDAO instance
func NewExerciseDAO(db *gorm.DB) *ExerciseDAO {
	return &ExerciseDAO{db: db}
}

// Create creates a new exercise with prerequisites managed via node_prerequisites
func (d *ExerciseDAO) Create(exercise *models.Exercise, prerequisiteIDs []uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Create the exercise
		if err := tx.Create(exercise).Error; err != nil {
			return err
		}
		
		// Add prerequisites to node_prerequisites table
		if len(prerequisiteIDs) > 0 {
			for _, prereqID := range prerequisiteIDs {
				// Verify prerequisite exists (should be a definition)
				var count int64
				if err := tx.Model(&models.Definition{}).Where("id = ?", prereqID).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					continue // Skip invalid prerequisite
				}
				
				prerequisite := models.NodePrerequisite{
					NodeID:           exercise.ID,
					NodeType:         "exercise",
					PrerequisiteID:   prereqID,
					PrerequisiteType: "definition", // Exercises typically depend on definitions
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

// Update updates an existing exercise and its prerequisites
func (d *ExerciseDAO) Update(exercise *models.Exercise, prerequisiteIDs []uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Update the exercise
		if err := tx.Save(exercise).Error; err != nil {
			return err
		}
		
		// Update prerequisites (clear existing, add new ones)
		if err := tx.Where("node_id = ? AND node_type = ?", exercise.ID, "exercise").
			Delete(&models.NodePrerequisite{}).Error; err != nil {
			return err
		}
		
		if len(prerequisiteIDs) > 0 {
			for _, prereqID := range prerequisiteIDs {
				// Verify prerequisite exists (should be a definition)
				var count int64
				if err := tx.Model(&models.Definition{}).Where("id = ?", prereqID).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					continue // Skip invalid prerequisite
				}
				
				prerequisite := models.NodePrerequisite{
					NodeID:           exercise.ID,
					NodeType:         "exercise",
					PrerequisiteID:   prereqID,
					PrerequisiteType: "definition", // Exercises typically depend on definitions
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

// Delete deletes an exercise and its prerequisites
func (d *ExerciseDAO) Delete(id uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Delete prerequisites where this exercise is involved
		if err := tx.Where("(node_id = ? AND node_type = ?) OR (prerequisite_id = ? AND prerequisite_type = ?)", 
			id, "exercise", id, "exercise").Delete(&models.NodePrerequisite{}).Error; err != nil {
			return err
		}
		
		// Delete the exercise
		return tx.Delete(&models.Exercise{}, id).Error
	})
}

// FindByID finds an exercise by ID
func (d *ExerciseDAO) FindByID(id uint) (*models.Exercise, error) {
	var exercise models.Exercise
	result := d.db.First(&exercise, id)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("exercise not found")
		}
		return nil, result.Error
	}
	
	return &exercise, nil
}

// FindByIDWithPrerequisites finds an exercise by ID and loads its prerequisites
func (d *ExerciseDAO) FindByIDWithPrerequisites(id uint) (*models.ExerciseWithPrerequisites, error) {
	exercise, err := d.FindByID(id)
	if err != nil {
		return nil, err
	}
	
	prerequisiteCodes, err := d.getPrerequisiteCodes(id, "exercise")
	if err != nil {
		return nil, err
	}
	
	return &models.ExerciseWithPrerequisites{
		Exercise:          *exercise,
		PrerequisiteCodes: prerequisiteCodes,
	}, nil
}

// FindByCode finds exercises by code and loads their prerequisites
func (d *ExerciseDAO) FindByCode(code string) ([]*models.ExerciseWithPrerequisites, error) {
	var exercises []models.Exercise
	result := d.db.Where("code = ?", code).Find(&exercises)
	
	if result.Error != nil {
		return nil, result.Error
	}
	
	if len(exercises) == 0 {
		return nil, errors.New("exercises not found")
	}
	
	// Load prerequisites for each exercise
	var results []*models.ExerciseWithPrerequisites
	for _, ex := range exercises {
		prerequisiteCodes, err := d.getPrerequisiteCodes(ex.ID, "exercise")
		if err != nil {
			return nil, err
		}
		
		results = append(results, &models.ExerciseWithPrerequisites{
			Exercise:          ex,
			PrerequisiteCodes: prerequisiteCodes,
		})
	}
	
	return results, nil
}

// FindByCodeAndDomain finds an exercise by code within a specific domain
func (d *ExerciseDAO) FindByCodeAndDomain(code string, domainID uint) (*models.ExerciseWithPrerequisites, error) {
	var exercise models.Exercise
	result := d.db.Where("code = ? AND domain_id = ?", code, domainID).First(&exercise)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("exercise not found")
		}
		return nil, result.Error
	}
	
	prerequisiteCodes, err := d.getPrerequisiteCodes(exercise.ID, "exercise")
	if err != nil {
		return nil, err
	}
	
	return &models.ExerciseWithPrerequisites{
		Exercise:          exercise,
		PrerequisiteCodes: prerequisiteCodes,
	}, nil
}

// GetByDomainID returns all exercises for a domain with their prerequisites
func (d *ExerciseDAO) GetByDomainID(domainID uint) ([]models.ExerciseWithPrerequisites, error) {
	var exercises []models.Exercise
	result := d.db.Where("domain_id = ?", domainID).Find(&exercises)
	
	if result.Error != nil {
		return nil, result.Error
	}
	
	// Load prerequisites for each exercise
	var results []models.ExerciseWithPrerequisites
	for _, ex := range exercises {
		prerequisiteCodes, err := d.getPrerequisiteCodes(ex.ID, "exercise")
		if err != nil {
			return nil, err
		}
		
		results = append(results, models.ExerciseWithPrerequisites{
			Exercise:          ex,
			PrerequisiteCodes: prerequisiteCodes,
		})
	}
	
	return results, nil
}

// ConvertToResponse converts an ExerciseWithPrerequisites to an ExerciseResponse
func (d *ExerciseDAO) ConvertToResponse(exercise *models.ExerciseWithPrerequisites) models.ExerciseResponse {
	return models.ExerciseResponse{
		ID:            exercise.ID,
		Code:          exercise.Code,
		Name:          exercise.Name,
		Statement:     exercise.Statement,
		Description:   exercise.Description,
		Hints:         exercise.Hints,
		DomainID:      exercise.DomainID,
		OwnerID:       exercise.OwnerID,
		Verifiable:    exercise.Verifiable,
		Result:        exercise.Result,
		Difficulty:    exercise.Difficulty,
		Prerequisites: exercise.PrerequisiteCodes,
		XPosition:     exercise.XPosition,
		YPosition:     exercise.YPosition,
		CreatedAt:     exercise.CreatedAt,
		UpdatedAt:     exercise.UpdatedAt,
	}
}

// Helper function to get prerequisite codes for a node
func (d *ExerciseDAO) getPrerequisiteCodes(nodeID uint, nodeType string) ([]string, error) {
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

// UpdatePositions updates the x,y positions of multiple exercises
func (d *ExerciseDAO) UpdatePositions(positions map[uint]struct{ X, Y float64 }) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		for id, pos := range positions {
			if err := tx.Model(&models.Exercise{}).Where("id = ?", id).Updates(map[string]interface{}{
				"x_position": pos.X,
				"y_position": pos.Y,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// VerifyExerciseAnswer checks if an answer matches the expected result
func (d *ExerciseDAO) VerifyExerciseAnswer(exerciseID uint, answer string) (bool, error) {
	var exercise models.Exercise
	if err := d.db.First(&exercise, exerciseID).Error; err != nil {
		return false, err
	}
	
	if !exercise.Verifiable {
		return false, errors.New("exercise is not automatically verifiable")
	}
	
	// Simple string comparison - can be enhanced for more complex verification
	return answer == exercise.Result, nil
}
