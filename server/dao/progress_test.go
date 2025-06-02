package dao

import (
	"myapp/server/models"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupProgressTestDB() (*gorm.DB, error) {
	// Use SQLite in-memory database for testing
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	// Auto-migrate required models
	models := []interface{}{
		&models.User{},
		&models.Domain{},
		&models.Definition{},
		&models.Exercise{},
		&models.UserDomainProgress{},
		&models.UserDefinitionProgress{},
		&models.UserExerciseProgress{},
		&models.StudySession{},
		&models.SessionDefinition{},
		&models.SessionExercise{},
	}

	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			return nil, err
		}
	}

	return db, nil
}

func createProgressTestData(db *gorm.DB) (uint, uint, uint, uint, error) {
	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)
	exerciseDAO := NewExerciseDAO(db)

	// Create a user
	user := &models.User{
		Username:  "progressuser",
		Email:     "progress@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Progress",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		return 0, 0, 0, 0, err
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Progress Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for progress tests",
	}
	if err := domainDAO.Create(domain); err != nil {
		return 0, 0, 0, 0, err
	}

	// Create a definition
	definition := &models.Definition{
		Code:        "PROG1",
		Name:        "Progress Definition",
		Description: "Test definition for progress",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(definition, nil, nil); err != nil {
		return 0, 0, 0, 0, err
	}

	// Create an exercise
	exercise := &models.Exercise{
		Code:        "PROGEX1",
		Name:        "Progress Exercise",
		Statement:   "Test exercise for progress",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		Verifiable:  true,
		Result:      "42",
	}
	if err := exerciseDAO.Create(exercise, []uint{definition.ID}); err != nil {
		return 0, 0, 0, 0, err
	}

	return user.ID, domain.ID, definition.ID, exercise.ID, nil
}

func TestEnrollUserInDomain(t *testing.T) {
	// Setup
	db, err := setupProgressTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	userID, domainID, _, _, err := createProgressTestData(db)
	if err != nil {
		t.Fatalf("Failed to create test data: %v", err)
	}

	// Create ProgressDAO
	progressDAO := NewProgressDAO(db)

	// Enroll user in domain
	if err := progressDAO.EnrollUserInDomain(userID, domainID); err != nil {
		t.Fatalf("Failed to enroll user in domain: %v", err)
	}

	// Verify enrollment
	progress, err := progressDAO.GetUserDomainProgress(userID)
	if err != nil {
		t.Fatalf("Failed to get user domain progress: %v", err)
	}

	if len(progress) != 1 {
		t.Fatalf("Expected 1 domain progress entry, got %d", len(progress))
	}

	if progress[0].DomainID != domainID {
		t.Errorf("Expected domain ID %d, got %d", domainID, progress[0].DomainID)
	}

	if progress[0].UserID != userID {
		t.Errorf("Expected user ID %d, got %d", userID, progress[0].UserID)
	}

	// Test enrolling again (should not error)
	if err := progressDAO.EnrollUserInDomain(userID, domainID); err != nil {
		t.Fatalf("Failed to re-enroll user in domain: %v", err)
	}

	// Verify still only one enrollment
	progress, err = progressDAO.GetUserDomainProgress(userID)
	if err != nil {
		t.Fatalf("Failed to get user domain progress after re-enrollment: %v", err)
	}

	if len(progress) != 1 {
		t.Errorf("Expected 1 domain progress entry after re-enrollment, got %d", len(progress))
	}
}

func TestTrackDefinitionReview(t *testing.T) {
	// Setup
	db, err := setupProgressTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	userID, domainID, definitionID, _, err := createProgressTestData(db)
	if err != nil {
		t.Fatalf("Failed to create test data: %v", err)
	}

	// Create ProgressDAO
	progressDAO := NewProgressDAO(db)

	// Enroll user in domain
	if err := progressDAO.EnrollUserInDomain(userID, domainID); err != nil {
		t.Fatalf("Failed to enroll user in domain: %v", err)
	}

	// Track definition review
	if err := progressDAO.TrackDefinitionReview(userID, definitionID, models.ReviewGood, 60); err != nil {
		t.Fatalf("Failed to track definition review: %v", err)
	}

	// Get user definition progress
	var defProgress models.UserDefinitionProgress
	if err := db.Where("user_id = ? AND definition_id = ?", userID, definitionID).First(&defProgress).Error; err != nil {
		t.Fatalf("Failed to get user definition progress: %v", err)
	}

	// Verify progress data
	if defProgress.LastReviewQuality != models.ReviewGood {
		t.Errorf("Expected review quality %d, got %d", models.ReviewGood, defProgress.LastReviewQuality)
	}

	if defProgress.ReviewCount != 1 {
		t.Errorf("Expected review count 1, got %d", defProgress.ReviewCount)
	}

	if defProgress.TotalTimeSpent != 60 {
		t.Errorf("Expected total time spent 60, got %d", defProgress.TotalTimeSpent)
	}

	// Track another review
	if err := progressDAO.TrackDefinitionReview(userID, definitionID, models.ReviewPerfect, 45); err != nil {
		t.Fatalf("Failed to track second definition review: %v", err)
	}

	// Get updated progress
	if err := db.Where("user_id = ? AND definition_id = ?", userID, definitionID).First(&defProgress).Error; err != nil {
		t.Fatalf("Failed to get updated user definition progress: %v", err)
	}

	// Verify updated progress
	if defProgress.LastReviewQuality != models.ReviewPerfect {
		t.Errorf("Expected updated review quality %d, got %d", models.ReviewPerfect, defProgress.LastReviewQuality)
	}

	if defProgress.ReviewCount != 2 {
		t.Errorf("Expected review count 2, got %d", defProgress.ReviewCount)
	}

	if defProgress.TotalTimeSpent != 105 { // 60 + 45
		t.Errorf("Expected total time spent 105, got %d", defProgress.TotalTimeSpent)
	}
}

func TestTrackExerciseAttempt(t *testing.T) {
	// Setup
	db, err := setupProgressTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	userID, domainID, _, exerciseID, err := createProgressTestData(db)
	if err != nil {
		t.Fatalf("Failed to create test data: %v", err)
	}

	// Create ProgressDAO
	progressDAO := NewProgressDAO(db)

	// Enroll user in domain
	if err := progressDAO.EnrollUserInDomain(userID, domainID); err != nil {
		t.Fatalf("Failed to enroll user in domain: %v", err)
	}

	// Track exercise attempt (success)
	if err := progressDAO.TrackExerciseAttempt(userID, exerciseID, true, 120); err != nil {
		t.Fatalf("Failed to track exercise attempt: %v", err)
	}

	// Get user exercise progress
	var exProgress models.UserExerciseProgress
	if err := db.Where("user_id = ? AND exercise_id = ?", userID, exerciseID).First(&exProgress).Error; err != nil {
		t.Fatalf("Failed to get user exercise progress: %v", err)
	}

	// Verify progress data
	if !exProgress.Completed {
		t.Error("Expected exercise to be completed")
	}

	if exProgress.AttemptCount != 1 {
		t.Errorf("Expected attempt count 1, got %d", exProgress.AttemptCount)
	}

	if exProgress.TotalTimeSpent != 120 {
		t.Errorf("Expected total time spent 120, got %d", exProgress.TotalTimeSpent)
	}

	// Track another attempt (failure)
	if err := progressDAO.TrackExerciseAttempt(userID, exerciseID, false, 60); err != nil {
		t.Fatalf("Failed to track second exercise attempt: %v", err)
	}

	// Get updated progress
	if err := db.Where("user_id = ? AND exercise_id = ?", userID, exerciseID).First(&exProgress).Error; err != nil {
		t.Fatalf("Failed to get updated user exercise progress: %v", err)
	}

	// Verify updated progress
	if !exProgress.Completed { // Should still be completed from first attempt
		t.Error("Expected exercise to still be completed after failed attempt")
	}

	if exProgress.AttemptCount != 2 {
		t.Errorf("Expected attempt count 2, got %d", exProgress.AttemptCount)
	}

	if exProgress.TotalTimeSpent != 180 { // 120 + 60
		t.Errorf("Expected total time spent 180, got %d", exProgress.TotalTimeSpent)
	}
}

func TestGetDefinitionsForReview(t *testing.T) {
	// Setup
	db, err := setupProgressTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	userID, domainID, definitionID, _, err := createProgressTestData(db)
	if err != nil {
		t.Fatalf("Failed to create test data: %v", err)
	}

	// Create ProgressDAO
	progressDAO := NewProgressDAO(db)

	// Enroll user in domain
	if err := progressDAO.EnrollUserInDomain(userID, domainID); err != nil {
		t.Fatalf("Failed to enroll user in domain: %v", err)
	}

	// Track definition review with a next review date in the past
	if err := progressDAO.TrackDefinitionReview(userID, definitionID, models.ReviewGood, 60); err != nil {
		t.Fatalf("Failed to track definition review: %v", err)
	}

	// Set next review date to the past
	pastDate := time.Now().Add(-24 * time.Hour)
	if err := db.Model(&models.UserDefinitionProgress{}).
		Where("user_id = ? AND definition_id = ?", userID, definitionID).
		Update("next_review", pastDate).Error; err != nil {
		t.Fatalf("Failed to update next review date: %v", err)
	}

	// Get definitions for review
	defs, err := progressDAO.GetDefinitionsForReview(userID, domainID, 10)
	if err != nil {
		t.Fatalf("Failed to get definitions for review: %v", err)
	}

	// Verify definitions for review
	if len(defs) != 1 {
		t.Errorf("Expected 1 definition for review, got %d", len(defs))
	}

	if len(defs) > 0 && defs[0].ID != definitionID {
		t.Errorf("Expected definition ID %d, got %d", definitionID, defs[0].ID)
	}

	// Track another review with next review date in the future
	if err := progressDAO.TrackDefinitionReview(userID, definitionID, models.ReviewPerfect, 45); err != nil {
		t.Fatalf("Failed to track second definition review: %v", err)
	}

	// Get definitions for review again
	defs, err = progressDAO.GetDefinitionsForReview(userID, domainID, 10)
	if err != nil {
		t.Fatalf("Failed to get definitions for review after second review: %v", err)
	}

	// Verify no definitions for review (next review date is in the future)
	if len(defs) != 0 {
		t.Errorf("Expected 0 definitions for review after second review, got %d", len(defs))
	}
}

func TestStudySessions(t *testing.T) {
	// Setup
	db, err := setupProgressTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	userID, domainID, definitionID, exerciseID, err := createProgressTestData(db)
	if err != nil {
		t.Fatalf("Failed to create test data: %v", err)
	}

	// Create ProgressDAO
	progressDAO := NewProgressDAO(db)

	// Enroll user in domain
	if err := progressDAO.EnrollUserInDomain(userID, domainID); err != nil {
		t.Fatalf("Failed to enroll user in domain: %v", err)
	}

	// Track definition review (creates a study session)
	if err := progressDAO.TrackDefinitionReview(userID, definitionID, models.ReviewGood, 60); err != nil {
		t.Fatalf("Failed to track definition review: %v", err)
	}

	// Track exercise attempt (adds to the study session)
	if err := progressDAO.TrackExerciseAttempt(userID, exerciseID, true, 120); err != nil {
		t.Fatalf("Failed to track exercise attempt: %v", err)
	}

	// Get study sessions
	sessions, err := progressDAO.GetStudySessions(userID)
	if err != nil {
		t.Fatalf("Failed to get study sessions: %v", err)
	}

	// Verify study sessions
	if len(sessions) != 1 {
		t.Fatalf("Expected 1 study session, got %d", len(sessions))
	}

	sessionID := sessions[0].ID

	// End study session
	if err := progressDAO.EndStudySession(sessionID); err != nil {
		t.Fatalf("Failed to end study session: %v", err)
	}

	// Get session details
	session, defs, exs, err := progressDAO.GetSessionDetails(sessionID)
	if err != nil {
		t.Fatalf("Failed to get session details: %v", err)
	}

	// Verify session details
	if session == nil {
		t.Fatal("Expected session to be non-nil")
	}

	if session.UserID != userID {
		t.Errorf("Expected session user ID %d, got %d", userID, session.UserID)
	}

	if len(defs) != 1 {
		t.Errorf("Expected 1 definition review in session, got %d", len(defs))
	}

	if len(defs) > 0 && defs[0].DefinitionID != definitionID {
		t.Errorf("Expected definition ID %d in session, got %d", definitionID, defs[0].DefinitionID)
	}

	if len(exs) != 1 {
		t.Errorf("Expected 1 exercise in session, got %d", len(exs))
	}

	if len(exs) > 0 && exs[0].ExerciseID != exerciseID {
		t.Errorf("Expected exercise ID %d in session, got %d", exerciseID, exs[0].ExerciseID)
	}

	// Start a new session
	if err := progressDAO.TrackDefinitionReview(userID, definitionID, models.ReviewPerfect, 45); err != nil {
		t.Fatalf("Failed to track definition review for new session: %v", err)
	}

	// Get all sessions
	sessions, err = progressDAO.GetStudySessions(userID)
	if err != nil {
		t.Fatalf("Failed to get updated study sessions: %v", err)
	}

	// Verify we now have two sessions
	if len(sessions) != 2 {
		t.Errorf("Expected 2 study sessions after starting new session, got %d", len(sessions))
	}
}

func TestUpdateDomainProgress(t *testing.T) {
	// Setup
	db, err := setupProgressTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	userID, domainID, definitionID, exerciseID, err := createProgressTestData(db)
	if err != nil {
		t.Fatalf("Failed to create test data: %v", err)
	}

	// Create ProgressDAO
	progressDAO := NewProgressDAO(db)

	// Enroll user in domain
	if err := progressDAO.EnrollUserInDomain(userID, domainID); err != nil {
		t.Fatalf("Failed to enroll user in domain: %v", err)
	}

	// Track definition review
	if err := progressDAO.TrackDefinitionReview(userID, definitionID, models.ReviewGood, 60); err != nil {
		t.Fatalf("Failed to track definition review: %v", err)
	}

	// Track exercise attempt
	if err := progressDAO.TrackExerciseAttempt(userID, exerciseID, true, 120); err != nil {
		t.Fatalf("Failed to track exercise attempt: %v", err)
	}

	// Update domain progress
	if err := progressDAO.UpdateDomainProgress(userID, domainID); err != nil {
		t.Fatalf("Failed to update domain progress: %v", err)
	}

	// Get domain progress
	var domainProgress models.UserDomainProgress
	if err := db.Where("user_id = ? AND domain_id = ?", userID, domainID).First(&domainProgress).Error; err != nil {
		t.Fatalf("Failed to get domain progress: %v", err)
	}

	// Verify domain progress
	if domainProgress.DefinitionsCompleted != 1 {
		t.Errorf("Expected 1 definition completed, got %d", domainProgress.DefinitionsCompleted)
	}

	if domainProgress.ExercisesCompleted != 1 {
		t.Errorf("Expected 1 exercise completed, got %d", domainProgress.ExercisesCompleted)
	}

	// The total definitions and exercises should match what's in the domain
	if domainProgress.TotalDefinitions < 1 {
		t.Errorf("Expected at least 1 total definition, got %d", domainProgress.TotalDefinitions)
	}

	if domainProgress.TotalExercises < 1 {
		t.Errorf("Expected at least 1 total exercise, got %d", domainProgress.TotalExercises)
	}
}
