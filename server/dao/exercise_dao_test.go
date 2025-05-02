package dao

import (
	"myapp/server/models"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupExerciseTestDB() (*gorm.DB, error) {
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
	}

	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			return nil, err
		}
	}

	return db, nil
}

func TestExerciseCreate(t *testing.T) {
	// Setup
	db, err := setupExerciseTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)
	exerciseDAO := NewExerciseDAO(db)

	// Create a user
	user := &models.User{
		Username:  "exuser",
		Email:     "ex@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Ex",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Exercise Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for exercise tests",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create a definition
	definition := &models.Definition{
		Code:        "DEF1",
		Name:        "Test Definition",
		Description: "Definition for exercise tests",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(definition, nil, nil); err != nil {
		t.Fatalf("Failed to create definition: %v", err)
	}

	// Create an exercise
	exercise := &models.Exercise{
		Code:        "EX1",
		Name:        "Test Exercise",
		Statement:   "Solve this problem",
		Description: "Exercise description",
		Hints:       "Here's a hint",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		Verifiable:  true,
		Result:      "42",
		Difficulty:  "medium",
		XPosition:   100.0,
		YPosition:   200.0,
	}
	prerequisiteIDs := []uint{definition.ID}
	if err := exerciseDAO.Create(exercise, prerequisiteIDs); err != nil {
		t.Fatalf("Failed to create exercise: %v", err)
	}

	// Verify exercise was created
	if exercise.ID == 0 {
		t.Error("Exercise ID should not be 0 after creation")
	}

	// Find exercise by ID
	foundEx, err := exerciseDAO.FindByID(exercise.ID)
	if err != nil {
		t.Fatalf("Failed to find exercise by ID: %v", err)
	}

	// Verify exercise properties
	if foundEx.Name != "Test Exercise" {
		t.Errorf("Expected exercise name 'Test Exercise', got '%s'", foundEx.Name)
	}
	if foundEx.Result != "42" {
		t.Errorf("Expected result '42', got '%s'", foundEx.Result)
	}

	// Verify prerequisites
	if len(foundEx.Prerequisites) != 1 {
		t.Errorf("Expected 1 prerequisite, got %d", len(foundEx.Prerequisites))
	}
	if foundEx.Prerequisites[0].ID != definition.ID {
		t.Errorf("Expected prerequisite ID %d, got %d", definition.ID, foundEx.Prerequisites[0].ID)
	}
}

func TestExerciseUpdate(t *testing.T) {
	// Setup
	db, err := setupExerciseTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)
	exerciseDAO := NewExerciseDAO(db)

	// Create a user
	user := &models.User{
		Username:  "exuser2",
		Email:     "ex2@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Ex",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Exercise Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for exercise tests",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create two definitions
	def1 := &models.Definition{
		Code:        "DEF1",
		Name:        "Definition 1",
		Description: "First definition",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(def1, nil, nil); err != nil {
		t.Fatalf("Failed to create definition 1: %v", err)
	}

	def2 := &models.Definition{
		Code:        "DEF2",
		Name:        "Definition 2",
		Description: "Second definition",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(def2, nil, nil); err != nil {
		t.Fatalf("Failed to create definition 2: %v", err)
	}

	// Create an exercise with def1 as prerequisite
	exercise := &models.Exercise{
		Code:        "EX2",
		Name:        "Original Exercise",
		Statement:   "Original statement",
		Description: "Original description",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		Verifiable:  false,
		Difficulty:  "easy",
	}
	if err := exerciseDAO.Create(exercise, []uint{def1.ID}); err != nil {
		t.Fatalf("Failed to create exercise: %v", err)
	}

	// Update exercise with new properties and def2 as prerequisite
	exercise.Name = "Updated Exercise"
	exercise.Statement = "Updated statement"
	exercise.Verifiable = true
	exercise.Result = "updated result"
	exercise.Difficulty = "hard"
	if err := exerciseDAO.Update(exercise, []uint{def2.ID}); err != nil {
		t.Fatalf("Failed to update exercise: %v", err)
	}

	// Find updated exercise
	updatedEx, err := exerciseDAO.FindByID(exercise.ID)
	if err != nil {
		t.Fatalf("Failed to find updated exercise: %v", err)
	}

	// Verify updated properties
	if updatedEx.Name != "Updated Exercise" {
		t.Errorf("Expected updated name 'Updated Exercise', got '%s'", updatedEx.Name)
	}
	if updatedEx.Statement != "Updated statement" {
		t.Errorf("Expected updated statement 'Updated statement', got '%s'", updatedEx.Statement)
	}
	if !updatedEx.Verifiable {
		t.Error("Expected Verifiable to be true after update")
	}
	if updatedEx.Result != "updated result" {
		t.Errorf("Expected updated result 'updated result', got '%s'", updatedEx.Result)
	}
	if updatedEx.Difficulty != "hard" {
		t.Errorf("Expected updated difficulty 'hard', got '%s'", updatedEx.Difficulty)
	}

	// Verify updated prerequisites
	if len(updatedEx.Prerequisites) != 1 {
		t.Errorf("Expected 1 prerequisite after update, got %d", len(updatedEx.Prerequisites))
	}
	if updatedEx.Prerequisites[0].ID != def2.ID {
		t.Errorf("Expected prerequisite ID %d after update, got %d", def2.ID, updatedEx.Prerequisites[0].ID)
	}
}

func TestExerciseDelete(t *testing.T) {
	// Setup
	db, err := setupExerciseTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	exerciseDAO := NewExerciseDAO(db)

	// Create a user
	user := &models.User{
		Username:  "exuser3",
		Email:     "ex3@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Ex",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Exercise Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for exercise tests",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create an exercise
	exercise := &models.Exercise{
		Code:        "EX3",
		Name:        "Exercise to Delete",
		Statement:   "This exercise will be deleted",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	if err := exerciseDAO.Create(exercise, nil); err != nil {
		t.Fatalf("Failed to create exercise: %v", err)
	}

	// Delete the exercise
	if err := exerciseDAO.Delete(exercise.ID); err != nil {
		t.Fatalf("Failed to delete exercise: %v", err)
	}

	// Try to find the deleted exercise
	_, err = exerciseDAO.FindByID(exercise.ID)
	if err == nil {
		t.Error("Expected error when finding deleted exercise, got nil")
	}
}

func TestFindExercisesByDomain(t *testing.T) {
	// Setup
	db, err := setupExerciseTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	exerciseDAO := NewExerciseDAO(db)

	// Create a user
	user := &models.User{
		Username:  "exuser4",
		Email:     "ex4@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Ex",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create two domains
	domain1 := &models.Domain{
		Name:        "Domain 1",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "First domain",
	}
	if err := domainDAO.Create(domain1); err != nil {
		t.Fatalf("Failed to create domain 1: %v", err)
	}

	domain2 := &models.Domain{
		Name:        "Domain 2",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Second domain",
	}
	if err := domainDAO.Create(domain2); err != nil {
		t.Fatalf("Failed to create domain 2: %v", err)
	}

	// Create exercises in both domains
	exercise1 := &models.Exercise{
		Code:        "EX4",
		Name:        "Exercise in Domain 1",
		Statement:   "This exercise is in domain 1",
		DomainID:    domain1.ID,
		OwnerID:     user.ID,
	}
	if err := exerciseDAO.Create(exercise1, nil); err != nil {
		t.Fatalf("Failed to create exercise 1: %v", err)
	}

	exercise2 := &models.Exercise{
		Code:        "EX5",
		Name:        "Another Exercise in Domain 1",
		Statement:   "This exercise is also in domain 1",
		DomainID:    domain1.ID,
		OwnerID:     user.ID,
	}
	if err := exerciseDAO.Create(exercise2, nil); err != nil {
		t.Fatalf("Failed to create exercise 2: %v", err)
	}

	exercise3 := &models.Exercise{
		Code:        "EX6",
		Name:        "Exercise in Domain 2",
		Statement:   "This exercise is in domain 2",
		DomainID:    domain2.ID,
		OwnerID:     user.ID,
	}
	if err := exerciseDAO.Create(exercise3, nil); err != nil {
		t.Fatalf("Failed to create exercise 3: %v", err)
	}

	// Find exercises by domain
	exercises, err := exerciseDAO.FindByDomain(domain1.ID)
	if err != nil {
		t.Fatalf("Failed to find exercises by domain: %v", err)
	}

	// Verify correct number of exercises found
	if len(exercises) != 2 {
		t.Errorf("Expected 2 exercises in domain 1, got %d", len(exercises))
	}

	// Find exercises by domain 2
	exercises2, err := exerciseDAO.FindByDomain(domain2.ID)
	if err != nil {
		t.Fatalf("Failed to find exercises by domain 2: %v", err)
	}

	// Verify correct number of exercises found
	if len(exercises2) != 1 {
		t.Errorf("Expected 1 exercise in domain 2, got %d", len(exercises2))
	}
}

func TestFindExerciseByCode(t *testing.T) {
	// Setup
	db, err := setupExerciseTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	exerciseDAO := NewExerciseDAO(db)

	// Create a user
	user := &models.User{
		Username:  "exuser5",
		Email:     "ex5@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Ex",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Exercise Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for exercise tests",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create an exercise with a specific code
	exercise := &models.Exercise{
		Code:        "UNIQUE_CODE",
		Name:        "Exercise with Unique Code",
		Statement:   "This exercise has a unique code",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	if err := exerciseDAO.Create(exercise, nil); err != nil {
		t.Fatalf("Failed to create exercise: %v", err)
	}

	// Find exercise by code
	foundEx, err := exerciseDAO.FindByCode("UNIQUE_CODE")
	if err != nil {
		t.Fatalf("Failed to find exercise by code: %v", err)
	}

	// Verify exercise properties
	if foundEx.Name != "Exercise with Unique Code" {
		t.Errorf("Expected exercise name 'Exercise with Unique Code', got '%s'", foundEx.Name)
	}

	// Try to find exercise with non-existent code
	_, err = exerciseDAO.FindByCode("NONEXISTENT_CODE")
	if err == nil {
		t.Error("Expected error when finding exercise with non-existent code, got nil")
	}
}
