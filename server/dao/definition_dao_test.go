package dao

import (
	"myapp/server/models"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupDefinitionTestDB() (*gorm.DB, error) {
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
		&models.Reference{},
	}

	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			return nil, err
		}
	}

	return db, nil
}

func TestDefinitionCreate(t *testing.T) {
	// Setup
	db, err := setupDefinitionTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)

	// Create a user
	user := &models.User{
		Username:  "defuser",
		Email:     "def@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Def",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Math Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Mathematics domain",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create a definition
	definition := &models.Definition{
		Code:        "DEF1",
		Name:        "Set Theory",
		Description: "Basic set theory concepts",
		Notes:       "Important foundational concept",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		XPosition:   100.0,
		YPosition:   200.0,
	}
	references := []string{"Book A", "Website B"}
	if err := definitionDAO.Create(definition, references, nil); err != nil {
		t.Fatalf("Failed to create definition: %v", err)
	}

	// Verify definition was created
	if definition.ID == 0 {
		t.Error("Definition ID should not be 0 after creation")
	}

	// Find definition by ID
	foundDef, err := definitionDAO.FindByID(definition.ID)
	if err != nil {
		t.Fatalf("Failed to find definition by ID: %v", err)
	}

	// Verify definition properties
	if foundDef.Name != "Set Theory" {
		t.Errorf("Expected definition name 'Set Theory', got '%s'", foundDef.Name)
	}

	// Verify references
	if len(foundDef.References) != 2 {
		t.Errorf("Expected 2 references, got %d", len(foundDef.References))
	}
}

func TestDefinitionWithPrerequisites(t *testing.T) {
	// Setup
	db, err := setupDefinitionTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)

	// Create a user
	user := &models.User{
		Username:  "defuser2",
		Email:     "def2@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Def",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Math Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Mathematics domain",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create first definition
	definition1 := &models.Definition{
		Code:        "DEF1",
		Name:        "Set Theory",
		Description: "Basic set theory concepts",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(definition1, nil, nil); err != nil {
		t.Fatalf("Failed to create first definition: %v", err)
	}

	// Create second definition with prerequisite
	definition2 := &models.Definition{
		Code:        "DEF2",
		Name:        "Functions",
		Description: "Mathematical functions",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	prerequisiteIDs := []uint{definition1.ID}
	if err := definitionDAO.Create(definition2, nil, prerequisiteIDs); err != nil {
		t.Fatalf("Failed to create definition with prerequisite: %v", err)
	}

	// Find definition by code
	foundDef, err := definitionDAO.FindByCode("DEF2")
	if err != nil {
		t.Fatalf("Failed to find definition by code: %v", err)
	}

	// Verify prerequisites
	if len(foundDef.Prerequisites) != 1 {
		t.Errorf("Expected 1 prerequisite, got %d", len(foundDef.Prerequisites))
	}
	if foundDef.Prerequisites[0].Code != "DEF1" {
		t.Errorf("Expected prerequisite code 'DEF1', got '%s'", foundDef.Prerequisites[0].Code)
	}
}

func TestDefinitionUpdate(t *testing.T) {
	// Setup
	db, err := setupDefinitionTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)

	// Create a user
	user := &models.User{
		Username:  "defuser3",
		Email:     "def3@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Def",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Math Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Mathematics domain",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create a definition
	definition := &models.Definition{
		Code:        "DEF3",
		Name:        "Original Name",
		Description: "Original description",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	originalReferences := []string{"Original Reference"}
	if err := definitionDAO.Create(definition, originalReferences, nil); err != nil {
		t.Fatalf("Failed to create definition: %v", err)
	}

	// Update the definition
	definition.Name = "Updated Name"
	definition.Description = "Updated description"
	newReferences := []string{"New Reference 1", "New Reference 2"}
	if err := definitionDAO.Update(definition, newReferences, nil); err != nil {
		t.Fatalf("Failed to update definition: %v", err)
	}

	// Find updated definition
	updatedDef, err := definitionDAO.FindByID(definition.ID)
	if err != nil {
		t.Fatalf("Failed to find updated definition: %v", err)
	}

	// Verify updated properties
	if updatedDef.Name != "Updated Name" {
		t.Errorf("Expected updated name 'Updated Name', got '%s'", updatedDef.Name)
	}
	if updatedDef.Description != "Updated description" {
		t.Errorf("Expected updated description 'Updated description', got '%s'", updatedDef.Description)
	}

	// Verify updated references
	if len(updatedDef.References) != 2 {
		t.Errorf("Expected 2 references after update, got %d", len(updatedDef.References))
	}
}

func TestDefinitionDelete(t *testing.T) {
	// Setup
	db, err := setupDefinitionTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)

	// Create a user
	user := &models.User{
		Username:  "defuser4",
		Email:     "def4@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Def",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Math Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Mathematics domain",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create a definition
	definition := &models.Definition{
		Code:        "DEF4",
		Name:        "Definition to Delete",
		Description: "This definition will be deleted",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(definition, nil, nil); err != nil {
		t.Fatalf("Failed to create definition: %v", err)
	}

	// Delete the definition
	if err := definitionDAO.Delete(definition.ID); err != nil {
		t.Fatalf("Failed to delete definition: %v", err)
	}

	// Try to find the deleted definition
	_, err = definitionDAO.FindByID(definition.ID)
	if err == nil {
		t.Error("Expected error when finding deleted definition, got nil")
	}
}

func TestFindDefinitionsByDomain(t *testing.T) {
	// Setup
	db, err := setupDefinitionTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)

	// Create a user
	user := &models.User{
		Username:  "defuser5",
		Email:     "def5@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Def",
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

	// Create definitions in both domains
	definition1 := &models.Definition{
		Code:        "DEF5",
		Name:        "Definition in Domain 1",
		Description: "This definition is in domain 1",
		DomainID:    domain1.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(definition1, nil, nil); err != nil {
		t.Fatalf("Failed to create definition 1: %v", err)
	}

	definition2 := &models.Definition{
		Code:        "DEF6",
		Name:        "Another Definition in Domain 1",
		Description: "This definition is also in domain 1",
		DomainID:    domain1.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(definition2, nil, nil); err != nil {
		t.Fatalf("Failed to create definition 2: %v", err)
	}

	definition3 := &models.Definition{
		Code:        "DEF7",
		Name:        "Definition in Domain 2",
		Description: "This definition is in domain 2",
		DomainID:    domain2.ID,
		OwnerID:     user.ID,
	}
	if err := definitionDAO.Create(definition3, nil, nil); err != nil {
		t.Fatalf("Failed to create definition 3: %v", err)
	}

	// Find definitions by domain
	definitions, err := definitionDAO.FindByDomain(domain1.ID)
	if err != nil {
		t.Fatalf("Failed to find definitions by domain: %v", err)
	}

	// Verify correct number of definitions found
	if len(definitions) != 2 {
		t.Errorf("Expected 2 definitions in domain 1, got %d", len(definitions))
	}

	// Find definitions by domain 2
	definitions2, err := definitionDAO.FindByDomain(domain2.ID)
	if err != nil {
		t.Fatalf("Failed to find definitions by domain 2: %v", err)
	}

	// Verify correct number of definitions found
	if len(definitions2) != 1 {
		t.Errorf("Expected 1 definition in domain 2, got %d", len(definitions2))
	}
}
