package dao

import (
	"math"
	"myapp/server/models"
	"time"

	"gorm.io/gorm"
)

// ProgressDAO handles database operations for user progress tracking
type ProgressDAO struct {
	db *gorm.DB
}

// NewProgressDAO creates a new ProgressDAO instance
func NewProgressDAO(db *gorm.DB) *ProgressDAO {
	return &ProgressDAO{db: db}
}

// EnrollUserInDomain enrolls a user in a domain (or updates enrollment if exists)
func (d *ProgressDAO) EnrollUserInDomain(userID, domainID uint) error {
	progress := models.UserDomainProgress{
		UserID:   userID,
		DomainID: domainID,
	}
	
	// Check if enrollment already exists
	var existingCount int64
	d.db.Model(&models.UserDomainProgress{}).
		Where("user_id = ? AND domain_id = ?", userID, domainID).
		Count(&existingCount)
	
	if existingCount > 0 {
		// Update existing enrollment
		return d.db.Model(&models.UserDomainProgress{}).
			Where("user_id = ? AND domain_id = ?", userID, domainID).
			Updates(map[string]interface{}{
				"last_activity": time.Now(),
			}).Error
	}
	
	// Create new enrollment
	return d.db.Create(&progress).Error
}

// UpdateDomainProgress updates a user's progress in a domain
func (d *ProgressDAO) UpdateDomainProgress(userID, domainID uint) error {
	// Calculate progress based on completed definitions and exercises
	var totalDefinitions, learnedDefinitions int64
	var totalExercises, completedExercises int64
	
	// Count total definitions in domain
	d.db.Model(&models.Definition{}).
		Where("domain_id = ?", domainID).
		Count(&totalDefinitions)
	
	// Count learned definitions
	d.db.Model(&models.UserDefinitionProgress{}).
		Joins("JOIN definitions ON user_definition_progress.definition_id = definitions.id").
		Where("user_definition_progress.user_id = ? AND definitions.domain_id = ? AND user_definition_progress.learned = true", userID, domainID).
		Count(&learnedDefinitions)
	
	// Count total exercises in domain
	d.db.Model(&models.Exercise{}).
		Where("domain_id = ?", domainID).
		Count(&totalExercises)
	
	// Count completed exercises
	d.db.Model(&models.UserExerciseProgress{}).
		Joins("JOIN exercises ON user_exercise_progress.exercise_id = exercises.id").
		Where("user_exercise_progress.user_id = ? AND exercises.domain_id = ? AND user_exercise_progress.completed = true", userID, domainID).
		Count(&completedExercises)
	
	// Calculate progress percentage
	var progress float64 = 0
	total := totalDefinitions + totalExercises
	if total > 0 {
		progress = float64(learnedDefinitions+completedExercises) / float64(total) * 100
	}
	
	// Update progress
	return d.db.Model(&models.UserDomainProgress{}).
		Where("user_id = ? AND domain_id = ?", userID, domainID).
		Updates(map[string]interface{}{
			"progress":      progress,
			"last_activity": time.Now(),
		}).Error
}

// GetUserDomainProgress gets a user's progress for all enrolled domains
func (d *ProgressDAO) GetUserDomainProgress(userID uint) ([]models.UserDomainProgress, error) {
	var progress []models.UserDomainProgress
	result := d.db.
		Preload("Domain").
		Where("user_id = ?", userID).
		Find(&progress)
	
	return progress, result.Error
}

// GetUserDefinitionProgress gets a user's progress for all definitions in a domain
func (d *ProgressDAO) GetUserDefinitionProgress(userID, domainID uint) ([]models.UserDefinitionProgress, error) {
	var progress []models.UserDefinitionProgress
	result := d.db.
		Preload("Definition").
		Joins("JOIN definitions ON user_definition_progress.definition_id = definitions.id").
		Where("user_definition_progress.user_id = ? AND definitions.domain_id = ?", userID, domainID).
		Find(&progress)
	
	return progress, result.Error
}

// GetUserExerciseProgress gets a user's progress for all exercises in a domain
func (d *ProgressDAO) GetUserExerciseProgress(userID, domainID uint) ([]models.UserExerciseProgress, error) {
	var progress []models.UserExerciseProgress
	result := d.db.
		Preload("Exercise").
		Joins("JOIN exercises ON user_exercise_progress.exercise_id = exercises.id").
		Where("user_exercise_progress.user_id = ? AND exercises.domain_id = ?", userID, domainID).
		Find(&progress)
	
	return progress, result.Error
}

// TrackDefinitionReview records a user's review of a definition (spaced repetition)
func (d *ProgressDAO) TrackDefinitionReview(userID, definitionID uint, result models.ReviewResult, timeTaken int) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Check if progress record exists
		var progress models.UserDefinitionProgress
		var exists bool
		
		err := tx.Where("user_id = ? AND definition_id = ?", userID, definitionID).
			First(&progress).Error
		
		if err != nil {
			// Create new record if not found
			if err == gorm.ErrRecordNotFound {
				exists = false
				progress = models.UserDefinitionProgress{
					UserID:         userID,
					DefinitionID:   definitionID,
					EasinessFactor: 2.5, // Default easiness factor
				}
			} else {
				return err
			}
		} else {
			exists = true
		}
		
		// Update based on SM-2 algorithm (modified version of the Anki algorithm)
		progress.LastReview = time.Now()
		progress.Repetitions++
		
		// Apply SM-2 algorithm
		// Calculate new easiness factor and interval
		var qualityScore int
		switch result {
		case models.ReviewAgain:
			qualityScore = 0
		case models.ReviewHard:
			qualityScore = 3
		case models.ReviewGood:
			qualityScore = 4
		case models.ReviewEasy:
			qualityScore = 5
		}
		
		// Update easiness factor (EF)
		progress.EasinessFactor = math.Max(1.3, progress.EasinessFactor+
			(0.1-(5-float64(qualityScore))*(0.08+(5-float64(qualityScore))*0.02)))
		
		// Calculate next interval
		if qualityScore < 3 {
			progress.Repetitions = 0
			progress.IntervalDays = 1
		} else {
			if progress.Repetitions == 1 {
				progress.IntervalDays = 1
			} else if progress.Repetitions == 2 {
				progress.IntervalDays = 6
			} else {
				progress.IntervalDays = int(float64(progress.IntervalDays) * progress.EasinessFactor)
			}
		}
		
		// Set next review date
		progress.NextReview = time.Now().AddDate(0, 0, progress.IntervalDays)
		
		// Mark as learned if quality is good or better
		if qualityScore >= 3 {
			progress.Learned = true
		}
		
		// Save progress
		if !exists {
			err = tx.Create(&progress).Error
		} else {
			err = tx.Save(&progress).Error
		}
		if err != nil {
			return err
		}
		
		// Record review in current study session
		// First, find or create active session
		var session models.StudySession
		err = tx.Where("user_id = ? AND domain_id = ? AND end_time IS NULL", userID, 
			// Get domain ID for the definition
			tx.Model(&models.Definition{}).Select("domain_id").Where("id = ?", definitionID)).
			First(&session).Error
		
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				// Get domain ID for the definition
				var definition models.Definition
				if err := tx.Select("domain_id").First(&definition, definitionID).Error; err != nil {
					return err
				}
				
				// Create new session
				session = models.StudySession{
					UserID:   userID,
					DomainID: definition.DomainID,
				}
				if err := tx.Create(&session).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		}
		
		// Record definition review in session
		sessionDef := models.SessionDefinition{
			SessionID:    session.ID,
			DefinitionID: definitionID,
			ReviewResult: string(result),
			TimeTaken:    timeTaken,
		}
		
		return tx.Create(&sessionDef).Error
	})
}

// TrackExerciseAttempt records a user's attempt at an exercise
func (d *ProgressDAO) TrackExerciseAttempt(userID, exerciseID uint, correct bool, timeTaken int) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Check if progress record exists
		var progress models.UserExerciseProgress
		var exists bool
		
		err := tx.Where("user_id = ? AND exercise_id = ?", userID, exerciseID).
			First(&progress).Error
		
		if err != nil {
			// Create new record if not found
			if err == gorm.ErrRecordNotFound {
				exists = false
				progress = models.UserExerciseProgress{
					UserID:     userID,
					ExerciseID: exerciseID,
					Attempts:   0,
				}
			} else {
				return err
			}
		} else {
			exists = true
		}
		
		// Update progress
		progress.LastAttempt = time.Now()
		progress.Attempts++
		
		// Only mark as completed and correct if the answer is correct
		if correct {
			progress.Completed = true
			progress.Correct = true
		}
		
		// Save progress
		if !exists {
			err = tx.Create(&progress).Error
		} else {
			err = tx.Save(&progress).Error
		}
		if err != nil {
			return err
		}
		
		// Record attempt in current study session
		// First, find or create active session
		var session models.StudySession
		err = tx.Where("user_id = ? AND domain_id = ? AND end_time IS NULL", userID, 
			// Get domain ID for the exercise
			tx.Model(&models.Exercise{}).Select("domain_id").Where("id = ?", exerciseID)).
			First(&session).Error
		
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				// Get domain ID for the exercise
				var exercise models.Exercise
				if err := tx.Select("domain_id").First(&exercise, exerciseID).Error; err != nil {
					return err
				}
				
				// Create new session
				session = models.StudySession{
					UserID:   userID,
					DomainID: exercise.DomainID,
				}
				if err := tx.Create(&session).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		}
		
		// Record exercise attempt in session
		sessionEx := models.SessionExercise{
			SessionID:  session.ID,
			ExerciseID: exerciseID,
			Completed:  progress.Completed,
			Correct:    progress.Correct,
			TimeTaken:  timeTaken,
		}
		
		return tx.Create(&sessionEx).Error
	})
}

// GetDefinitionsForReview returns definitions that are due for review
func (d *ProgressDAO) GetDefinitionsForReview(userID, domainID uint, limit int) ([]models.Definition, error) {
	var definitions []models.Definition
	
	result := d.db.
		Joins("JOIN user_definition_progress ON definitions.id = user_definition_progress.definition_id").
		Where("definitions.domain_id = ? AND user_definition_progress.user_id = ? AND user_definition_progress.next_review <= ?", 
			domainID, userID, time.Now()).
		Preload("References").
		Preload("Prerequisites").
		Order("user_definition_progress.next_review").
		Limit(limit).
		Find(&definitions)
	
	return definitions, result.Error
}

// EndStudySession ends an active study session
func (d *ProgressDAO) EndStudySession(sessionID uint) error {
	return d.db.Model(&models.StudySession{}).
		Where("id = ?", sessionID).
		Update("end_time", time.Now()).Error
}

// GetStudySessions gets a user's study sessions
func (d *ProgressDAO) GetStudySessions(userID uint) ([]models.StudySession, error) {
	var sessions []models.StudySession
	result := d.db.
		Where("user_id = ?", userID).
		Order("start_time DESC").
		Find(&sessions)
	
	return sessions, result.Error
}

// GetSessionDetails gets details of a study session including definitions and exercises reviewed
func (d *ProgressDAO) GetSessionDetails(sessionID uint) (*models.StudySession, []models.SessionDefinition, []models.SessionExercise, error) {
	var session models.StudySession
	var definitions []models.SessionDefinition
	var exercises []models.SessionExercise
	
	err := d.db.First(&session, sessionID).Error
	if err != nil {
		return nil, nil, nil, err
	}
	
	err = d.db.
		Preload("Definition").
		Where("session_id = ?", sessionID).
		Find(&definitions).Error
	if err != nil {
		return nil, nil, nil, err
	}
	
	err = d.db.
		Preload("Exercise").
		Where("session_id = ?", sessionID).
		Find(&exercises).Error
	if err != nil {
		return nil, nil, nil, err
	}
	
	return &session, definitions, exercises, nil
}
