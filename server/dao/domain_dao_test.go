package dao

import (
	"myapp/server/models"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupDomainTestDB() (*gorm.DB, error) {
	// Use SQLite in-memory database for testing
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	// Auto-migrate required models
	models := []interface{}{
		&models.User{},
		&models.Domain{},
		&models.DomainComment{},
	}

	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			return nil, err
		}
	}

	return db, nil
}

func TestDomainCreate(t *testing.T) {
	// Setup
	db, err := setupDomainTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)

	// Create a user
	user := &models.User{
		Username:  "domainuser",
		Email:     "domain@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Domain",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create domain
	domain := &models.Domain{
		Name:        "Test Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Test domain description",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Verify domain was created
	if domain.ID == 0 {
		t.Error("Domain ID should not be 0 after creation")
	}

	// Find domain by ID
	foundDomain, err := domainDAO.FindByID(domain.ID)
	if err != nil {
		t.Fatalf("Failed to find domain by ID: %v", err)
	}

	// Verify domain properties
	if foundDomain.Name != "Test Domain" {
		t.Errorf("Expected domain name 'Test Domain', got '%s'", foundDomain.Name)
	}
}

func TestDomainUpdate(t *testing.T) {
	// Setup
	db, err := setupDomainTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)

	// Create a user
	user := &models.User{
		Username:  "domainuser2",
		Email:     "domain2@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Domain",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create domain
	domain := &models.Domain{
		Name:        "Original Domain",
		Privacy:     "private",
		OwnerID:     user.ID,
		Description: "Original description",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Update domain
	domain.Name = "Updated Domain"
	domain.Description = "Updated description"
	domain.Privacy = "public"
	if err := domainDAO.Update(domain); err != nil {
		t.Fatalf("Failed to update domain: %v", err)
	}

	// Find updated domain
	updatedDomain, err := domainDAO.FindByID(domain.ID)
	if err != nil {
		t.Fatalf("Failed to find updated domain: %v", err)
	}

	// Verify updated properties
	if updatedDomain.Name != "Updated Domain" {
		t.Errorf("Expected updated name 'Updated Domain', got '%s'", updatedDomain.Name)
	}
	if updatedDomain.Description != "Updated description" {
		t.Errorf("Expected updated description 'Updated description', got '%s'", updatedDomain.Description)
	}
	if updatedDomain.Privacy != "public" {
		t.Errorf("Expected updated privacy 'public', got '%s'", updatedDomain.Privacy)
	}
}

func TestDomainDelete(t *testing.T) {
	// Setup
	db, err := setupDomainTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)

	// Create a user
	user := &models.User{
		Username:  "domainuser3",
		Email:     "domain3@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Domain",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create domain
	domain := &models.Domain{
		Name:        "Domain to Delete",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "This domain will be deleted",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Delete domain
	if err := domainDAO.Delete(domain.ID); err != nil {
		t.Fatalf("Failed to delete domain: %v", err)
	}

	// Try to find deleted domain
	_, err = domainDAO.FindByID(domain.ID)
	if err == nil {
		t.Error("Expected error when finding deleted domain, got nil")
	}
}

func TestGetAllDomains(t *testing.T) {
	// Setup
	db, err := setupDomainTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)

	// Create a user
	user := &models.User{
		Username:  "domainuser4",
		Email:     "domain4@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Domain",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create multiple domains
	for i := 1; i <= 3; i++ {
		domain := &models.Domain{
			Name:        "Domain " + string(rune('0'+i)),
			Privacy:     "public",
			OwnerID:     user.ID,
			Description: "Test domain " + string(rune('0'+i)),
		}
		if err := domainDAO.Create(domain); err != nil {
			t.Fatalf("Failed to create domain %d: %v", i, err)
		}
	}

	// Get all domains
	domains, err := domainDAO.GetAll()
	if err != nil {
		t.Fatalf("Failed to get all domains: %v", err)
	}

	// Verify correct number of domains
	if len(domains) != 3 {
		t.Errorf("Expected 3 domains, got %d", len(domains))
	}
}

func TestFindDomainsByOwner(t *testing.T) {
	// Setup
	db, err := setupDomainTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)

	// Create two users
	user1 := &models.User{
		Username:  "owner1",
		Email:     "owner1@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Owner",
		LastName:  "One",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user1); err != nil {
		t.Fatalf("Failed to create user 1: %v", err)
	}

	user2 := &models.User{
		Username:  "owner2",
		Email:     "owner2@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Owner",
		LastName:  "Two",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user2); err != nil {
		t.Fatalf("Failed to create user 2: %v", err)
	}

	// Create domains for user 1
	for i := 1; i <= 2; i++ {
		domain := &models.Domain{
			Name:        "User1 Domain " + string(rune('0'+i)),
			Privacy:     "public",
			OwnerID:     user1.ID,
			Description: "Domain owned by user 1",
		}
		if err := domainDAO.Create(domain); err != nil {
			t.Fatalf("Failed to create domain for user 1: %v", err)
		}
	}

	// Create domain for user 2
	domain := &models.Domain{
		Name:        "User2 Domain",
		Privacy:     "public",
		OwnerID:     user2.ID,
		Description: "Domain owned by user 2",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain for user 2: %v", err)
	}

	// Find domains by owner (user 1)
	domains, err := domainDAO.FindByOwner(user1.ID)
	if err != nil {
		t.Fatalf("Failed to find domains by owner: %v", err)
	}

	// Verify correct number of domains for user 1
	if len(domains) != 2 {
		t.Errorf("Expected 2 domains for user 1, got %d", len(domains))
	}

	// Find domains by owner (user 2)
	domains2, err := domainDAO.FindByOwner(user2.ID)
	if err != nil {
		t.Fatalf("Failed to find domains by owner: %v", err)
	}

	// Verify correct number of domains for user 2
	if len(domains2) != 1 {
		t.Errorf("Expected 1 domain for user 2, got %d", len(domains2))
	}
}

func TestFindPublicDomains(t *testing.T) {
	// Setup
	db, err := setupDomainTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)

	// Create a user
	user := &models.User{
		Username:  "publicuser",
		Email:     "public@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Public",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create public domains
	for i := 1; i <= 2; i++ {
		domain := &models.Domain{
			Name:        "Public Domain " + string(rune('0'+i)),
			Privacy:     "public",
			OwnerID:     user.ID,
			Description: "Public domain " + string(rune('0'+i)),
		}
		if err := domainDAO.Create(domain); err != nil {
			t.Fatalf("Failed to create public domain: %v", err)
		}
	}

	// Create private domain
	privateDomain := &models.Domain{
		Name:        "Private Domain",
		Privacy:     "private",
		OwnerID:     user.ID,
		Description: "Private domain",
	}
	if err := domainDAO.Create(privateDomain); err != nil {
		t.Fatalf("Failed to create private domain: %v", err)
	}

	// Find public domains
	domains, err := domainDAO.FindPublic()
	if err != nil {
		t.Fatalf("Failed to find public domains: %v", err)
	}

	// Verify correct number of public domains
	if len(domains) != 2 {
		t.Errorf("Expected 2 public domains, got %d", len(domains))
	}

	// Verify all returned domains are public
	for _, d := range domains {
		if d.Privacy != "public" {
			t.Errorf("Expected public domain, got domain with privacy '%s'", d.Privacy)
		}
	}
}
