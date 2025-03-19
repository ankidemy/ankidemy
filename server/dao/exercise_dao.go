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

// Create creates a new exercise
func (d *ExerciseDAO) Create(exercise *models.Exercise, prerequisiteIDs []uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Create the exercise
		if err := tx.Create(exercise).Error; err != nil {
			return err
		}
		
		// Add prerequisites
		if len(prerequisiteIDs) > 0 {
			for _, prereqID := range prerequisiteIDs {
				var prereq models.Definition
				if err := tx.First(&prereq, prereqID).Error; err != nil {
					return err
				}
				
				if err := tx.Model(exercise).Association("Prerequisites").Append(&prereq); err != nil {
					return err
				}
			}
		}
		
		return nil
	})
}

// Update updates an existing exercise
func (d *ExerciseDAO) Update(exercise *models.Exercise, prerequisiteIDs []uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Update the exercise
		if err := tx.Save(exercise).Error; err != nil {
			return err
		}
		
		// Update prerequisites (clear existing, add new ones)
		if err := tx.Model(exercise).Association("Prerequisites").Clear(); err != nil {
			return err
		}
		
		if len(prerequisiteIDs) > 0 {
			for _, prereqID := range prerequisiteIDs {
				var prereq models.Definition
				if err := tx.First(&prereq, prereqID).Error; err != nil {
					return err
				}
				
				if err := tx.Model(exercise).Association("Prerequisites").Append(&prereq); err != nil {
					return err
				}
			}
		}
		
		return nil
	})
}

// Delete deletes an exercise by ID
func (d *ExerciseDAO) Delete(id uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Clear associations first
		var exercise models.Exercise
		if err := tx.First(&exercise, id).Error; err != nil {
			return err
		}
		
		if err := tx.Model(&exercise).Association("Prerequisites").Clear(); err != nil {
			return err
		}
		
		// Delete the exercise
		return tx.Delete(&models.Exercise{}, id).Error
	})
}

// FindByID finds an exercise by ID
func (d *ExerciseDAO) FindByID(id uint) (*models.Exercise, error) {
	var exercise models.Exercise
	result := d.db.
		Preload("Prerequisites").
		First(&exercise, id)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("exercise not found")
		}
		return nil, result.Error
	}
	
	return &exercise, nil
}

// FindByCode finds an exercise by its code
func (d *ExerciseDAO) FindByCode(code string) (*models.Exercise, error) {
	var exercise models.Exercise
	result := d.db.
		Preload("Prerequisites").
		Where("code = ?", code).
		First(&exercise)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("exercise not found")
		}
		return nil, result.Error
	}
	
	return &exercise, nil
}

// GetByDomainID returns all exercises for a domain
func (d *ExerciseDAO) GetByDomainID(domainID uint) ([]models.Exercise, error) {
	var exercises []models.Exercise
	result := d.db.
		Preload("Prerequisites").
		Where("domain_id = ?", domainID).
		Find(&exercises)
	
	return exercises, result.Error
}

// GetAll returns all exercises
func (d *ExerciseDAO) GetAll() ([]models.Exercise, error) {
	var exercises []models.Exercise
	result := d.db.
		Preload("Prerequisites").
		Find(&exercises)
	
	return exercises, result.Error
}

// GetByDifficulty returns exercises with a specific difficulty
func (d *ExerciseDAO) GetByDifficulty(difficulty string) ([]models.Exercise, error) {
	var exercises []models.Exercise
	result := d.db.
		Preload("Prerequisites").
		Where("difficulty = ?", difficulty).
		Find(&exercises)
	
	return exercises, result.Error
}

// ConvertToResponse converts an Exercise model to an ExerciseResponse
func (d *ExerciseDAO) ConvertToResponse(exercise *models.Exercise) models.ExerciseResponse {
	// Extract prerequisite codes
	prerequisites := make([]string, 0, len(exercise.Prerequisites))
	for _, prereq := range exercise.Prerequisites {
		prerequisites = append(prerequisites, prereq.Code)
	}
	
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
		Prerequisites: prerequisites,
		XPosition:     exercise.XPosition,
		YPosition:     exercise.YPosition,
		CreatedAt:     exercise.CreatedAt,
		UpdatedAt:     exercise.UpdatedAt,
	}
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
	
	// Here we can implement more complex verification logic
	// For now, we just do a simple string comparison
	return answer == exercise.Result, nil
}
