package dao_test

import (
	"myapp/server/dao"
	"myapp/server/models"
	"os"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var testDB *gorm.DB

// Setup test database
func setupTestDB() (*gorm.DB, error) {
	// Use SQLite in-memory database for testing
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	// Auto-migrate all models
	models := []interface{}{
		&models.User{},
		&models.Domain{},
		&models.DomainComment{},
		&models.Definition{},
		&models.Reference{},
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

// TestMain sets up the test environment
func TestMain(m *testing.M) {
	var err error
	testDB, err = setupTestDB()
	if err != nil {
		panic("Failed to setup test database: " + err.Error())
	}

	os.Exit(m.Run())
}

// TestUserDAO tests the UserDAO operations
func TestUserDAO(t *testing.T) {
	userDAO := dao.NewUserDAO(testDB)

	// Create user
	user := &models.User{
		Username:  "testuser",
		Email:     "test@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Test",
		LastName:  "User",
		IsActive:  true,
	}

	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Find user by email
	foundUser, err := userDAO.FindUserByEmail("test@example.com")
	if err != nil {
		t.Fatalf("Failed to find user by email: %v", err)
	}

	if foundUser.Username != "testuser" {
		t.Errorf("Expected username 'testuser', got '%s'", foundUser.Username)
	}

	// Test password hashing and verification
	if err := dao.ComparePasswords(foundUser.Password, "password123"); err != nil {
		t.Errorf("Password verification failed: %v", err)
	}

	// Update user
	foundUser.FirstName = "Updated"
	if err := userDAO.UpdateUser(foundUser); err != nil {
		t.Fatalf("Failed to update user: %v", err)
	}

	// Verify update
	updatedUser, _ := userDAO.FindUserByID(foundUser.ID)
	if updatedUser.FirstName != "Updated" {
		t.Errorf("Expected updated FirstName 'Updated', got '%s'", updatedUser.FirstName)
	}
}

// TestDomainDAO tests the DomainDAO operations
func TestDomainDAO(t *testing.T) {
	userDAO := dao.NewUserDAO(testDB)
	domainDAO := dao.NewDomainDAO(testDB)

	// Create a user first
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

	// Find domain by ID
	foundDomain, err := domainDAO.FindByID(domain.ID)
	if err != nil {
		t.Fatalf("Failed to find domain by ID: %v", err)
	}

	if foundDomain.Name != "Test Domain" {
		t.Errorf("Expected domain name 'Test Domain', got '%s'", foundDomain.Name)
	}

	// Get all domains
	domains, err := domainDAO.GetAll()
	if err != nil {
		t.Fatalf("Failed to get all domains: %v", err)
	}

	if len(domains) != 1 {
		t.Errorf("Expected 1 domain, got %d", len(domains))
	}
}

// TestDefinitionAndExercise tests the DefinitionDAO and ExerciseDAO operations
func TestDefinitionAndExercise(t *testing.T) {
	// Setup
	userDAO := dao.NewUserDAO(testDB)
	domainDAO := dao.NewDomainDAO(testDB)
	definitionDAO := dao.NewDefinitionDAO(testDB)
	exerciseDAO := dao.NewExerciseDAO(testDB)

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

	// Create another definition with the first as prerequisite
	definition2 := &models.Definition{
		Code:        "DEF2",
		Name:        "Functions",
		Description: "Mathematical functions",
		Notes:       "Builds on set theory",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		XPosition:   300.0,
		YPosition:   200.0,
	}
	references2 := []string{"Book C"}
	prerequisiteIDs := []uint{definition.ID}
	if err := definitionDAO.Create(definition2, references2, prerequisiteIDs); err != nil {
		t.Fatalf("Failed to create definition with prerequisite: %v", err)
	}

	// Create an exercise based on both definitions
	exercise := &models.Exercise{
		Code:        "EX1",
		Name:        "Function Exercise",
		Statement:   "Prove that f(x) = x² is a function",
		Description: "Solution involves...",
		Hints:       "Consider the definition of a function",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		Verifiable:  false,
		Difficulty:  "medium",
		XPosition:   400.0,
		YPosition:   300.0,
	}
	if err := exerciseDAO.Create(exercise, prerequisiteIDs); err != nil {
		t.Fatalf("Failed to create exercise: %v", err)
	}

	// Find definition by code
	foundDef, err := definitionDAO.FindByCode("DEF2")
	if err != nil {
		t.Fatalf("Failed to find definition by code: %v", err)
	}

	// Verify definition properties
	if foundDef.Name != "Functions" {
		t.Errorf("Expected definition name 'Functions', got '%s'", foundDef.Name)
	}

	// Verify references
	if len(foundDef.References) != 1 || foundDef.References[0].Reference != "Book C" {
		t.Errorf("References not correctly loaded")
	}

	// Verify prerequisites
	if len(foundDef.Prerequisites) != 1 || foundDef.Prerequisites[0].Code != "DEF1" {
		t.Errorf("Prerequisites not correctly loaded")
	}

	// Find exercise by code
	foundEx, err := exerciseDAO.FindByCode("EX1")
	if err != nil {
		t.Fatalf("Failed to find exercise by code: %v", err)
	}

	// Verify exercise properties
	if foundEx.Name != "Function Exercise" {
		t.Errorf("Expected exercise name 'Function Exercise', got '%s'", foundEx.Name)
	}

	// Test update operations
	foundDef.Name = "Updated Functions"
	newReferences := []string{"Book D", "Book E"}
	if err := definitionDAO.Update(foundDef, newReferences, prerequisiteIDs); err != nil {
		t.Fatalf("Failed to update definition: %v", err)
	}

	// Verify update
	updatedDef, _ := definitionDAO.FindByID(foundDef.ID)
	if updatedDef.Name != "Updated Functions" {
		t.Errorf("Expected updated name 'Updated Functions', got '%s'", updatedDef.Name)
	}
	if len(updatedDef.References) != 2 {
		t.Errorf("Expected 2 references, got %d", len(updatedDef.References))
	}
}

// TestProgressTracking tests the ProgressDAO operations
func TestProgressTracking(t *testing.T) {
	// Setup
	userDAO := dao.NewUserDAO(testDB)
	domainDAO := dao.NewDomainDAO(testDB)
	definitionDAO := dao.NewDefinitionDAO(testDB)
	exerciseDAO := dao.NewExerciseDAO(testDB)
	progressDAO := dao.NewProgressDAO(testDB)

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
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Progress Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for testing progress",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
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
		t.Fatalf("Failed to create definition: %v", err)
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
		t.Fatalf("Failed to create exercise: %v", err)
	}

	// Enroll user in domain
	if err := progressDAO.EnrollUserInDomain(user.ID, domain.ID); err != nil {
		t.Fatalf("Failed to enroll user in domain: %v", err)
	}

	// Track definition review
	if err := progressDAO.TrackDefinitionReview(user.ID, definition.ID, models.ReviewGood, 60); err != nil {
		t.Fatalf("Failed to track definition review: %v", err)
	}

	// Track exercise attempt
	if err := progressDAO.TrackExerciseAttempt(user.ID, exercise.ID, true, 120); err != nil {
		t.Fatalf("Failed to track exercise attempt: %v", err)
	}

	// Get user domain progress
	progress, err := progressDAO.GetUserDomainProgress(user.ID)
	if err != nil {
		t.Fatalf("Failed to get user domain progress: %v", err)
	}

	if len(progress) != 1 {
		t.Errorf("Expected 1 domain progress entry, got %d", len(progress))
	}

	// Update domain progress
	if err := progressDAO.UpdateDomainProgress(user.ID, domain.ID); err != nil {
		t.Fatalf("Failed to update domain progress: %v", err)
	}

	// Get definitions for review
	defs, err := progressDAO.GetDefinitionsForReview(user.ID, domain.ID, 10)
	if err != nil {
		t.Fatalf("Failed to get definitions for review: %v", err)
	}

	// Should be 0 since we just reviewed it and next review is in the future
	if len(defs) != 0 {
		t.Errorf("Expected 0 definitions for review, got %d", len(defs))
	}

	// Get study sessions
	sessions, err := progressDAO.GetStudySessions(user.ID)
	if err != nil {
		t.Fatalf("Failed to get study sessions: %v", err)
	}

	if len(sessions) != 1 {
		t.Errorf("Expected 1 study session, got %d", len(sessions))
	}

	// End study session
	if err := progressDAO.EndStudySession(sessions[0].ID); err != nil {
		t.Fatalf("Failed to end study session: %v", err)
	}

	// Get session details
	session, defs, exs, err := progressDAO.GetSessionDetails(sessions[0].ID)
	if err != nil {
		t.Fatalf("Failed to get session details: %v", err)
	}

	if session == nil {
		t.Errorf("Expected session to be non-nil")
	}
	if len(defs) != 1 {
		t.Errorf("Expected 1 definition review in session, got %d", len(defs))
	}
	if len(exs) != 1 {
		t.Errorf("Expected 1 exercise in session, got %d", len(exs))
	}
}

// TestGraphDAO tests the GraphDAO operations
func TestGraphDAO(t *testing.T) {
	// Setup
	userDAO := dao.NewUserDAO(testDB)
	domainDAO := dao.NewDomainDAO(testDB)
	definitionDAO := dao.NewDefinitionDAO(testDB)
	exerciseDAO := dao.NewExerciseDAO(testDB)
	graphDAO := dao.NewGraphDAO(testDB)

	// Create a user
	user := &models.User{
		Username:  "graphuser",
		Email:     "graph@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Graph",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Graph Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for testing graph operations",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create definitions and exercises to populate the graph
	definitions := make([]*models.Definition, 0)
	for i := 1; i <= 3; i++ {
		def := &models.Definition{
			Code:        "G" + string(rune('0'+i)),
			Name:        "Graph Def " + string(rune('0'+i)),
			Description: "Graph test definition " + string(rune('0'+i)),
			DomainID:    domain.ID,
			OwnerID:     user.ID,
			XPosition:   float64(i * 100),
			YPosition:   100.0,
		}
		if err := definitionDAO.Create(def, nil, nil); err != nil {
			t.Fatalf("Failed to create definition: %v", err)
		}
		definitions = append(definitions, def)
	}

	// Create prerequisite relationships
	if len(definitions) > 1 {
		// G2 depends on G1
		def2 := definitions[1]
		if err := definitionDAO.Update(def2, nil, []uint{definitions[0].ID}); err != nil {
			t.Fatalf("Failed to update definition with prerequisites: %v", err)
		}

		// G3 depends on G2
		def3 := definitions[2]
		if err := definitionDAO.Update(def3, nil, []uint{definitions[1].ID}); err != nil {
			t.Fatalf("Failed to update definition with prerequisites: %v", err)
		}
	}

	// Create exercise
	exercise := &models.Exercise{
		Code:        "GEX1",
		Name:        "Graph Exercise 1",
		Statement:   "Test exercise for graph",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		Verifiable:  true,
		Result:      "correct answer",
		XPosition:   400.0,
		YPosition:   200.0,
	}
	if err := exerciseDAO.Create(exercise, []uint{definitions[2].ID}); err != nil {
		t.Fatalf("Failed to create exercise: %v", err)
	}

	// Export the domain to graph format
	graph, err := graphDAO.ExportDomain(domain.ID)
	if err != nil {
		t.Fatalf("Failed to export domain to graph: %v", err)
	}

	// Verify the graph
	if len(graph.Definitions) != 3 {
		t.Errorf("Expected 3 definitions in graph, got %d", len(graph.Definitions))
	}
	if len(graph.Exercises) != 1 {
		t.Errorf("Expected 1 exercise in graph, got %d", len(graph.Exercises))
	}

	// Verify prerequisites in the graph
	g2 := graph.Definitions["G2"]
	if len(g2.Prerequisites) != 1 || g2.Prerequisites[0] != "G1" {
		t.Errorf("G2 should have G1 as prerequisite")
	}

	// Modify the graph and import back
	// Clear existing graph
	graph = &dao.GraphData{
		Definitions: make(map[string]dao.DefinitionNode),
		Exercises:   make(map[string]dao.ExerciseNode),
	}

	// Add modified definitions
	graph.Definitions["D1"] = dao.DefinitionNode{
		Code:        "D1",
		Name:        "New Definition 1",
		Description: "Updated description 1",
		XPosition:   50.0,
		YPosition:   50.0,
	}
	graph.Definitions["D2"] = dao.DefinitionNode{
		Code:        "D2",
		Name:        "New Definition 2",
		Description: "Updated description 2",
		XPosition:   150.0,
		YPosition:   50.0,
		Prerequisites: []string{"D1"},
	}

	// Add modified exercise
	graph.Exercises["E1"] = dao.ExerciseNode{
		Code:        "E1",
		Name:        "New Exercise 1",
		Statement:   "Updated statement",
		Description: "Solution...",
		XPosition:   200.0,
		YPosition:   150.0,
		Prerequisites: []string{"D2"},
	}

	// Import the modified graph
	if err := graphDAO.ImportDomain(domain.ID, graph); err != nil {
		t.Fatalf("Failed to import domain from graph: %v", err)
	}

	// Verify the import
	visualGraph, err := graphDAO.GetVisualGraph(domain.ID)
	if err != nil {
		t.Fatalf("Failed to get visual graph: %v", err)
	}

	if len(visualGraph.Nodes) != 3 {
		t.Errorf("Expected 3 nodes in visual graph, got %d", len(visualGraph.Nodes))
	}
	if len(visualGraph.Links) != 2 {
		t.Errorf("Expected 2 links in visual graph, got %d", len(visualGraph.Links))
	}

	// Test update positions
	positionUpdates := map[string]struct{ X, Y float64 }{
		"D1": {X: 75.0, Y: 75.0},
		"E1": {X: 250.0, Y: 200.0},
	}
	if err := graphDAO.UpdateGraphPositions(positionUpdates); err != nil {
		t.Fatalf("Failed to update graph positions: %v", err)
	}

	// Verify position updates
	visualGraph, _ = graphDAO.GetVisualGraph(domain.ID)
	for _, node := range visualGraph.Nodes {
		if node.ID == "D1" {
			if node.X != 75.0 || node.Y != 75.0 {
				t.Errorf("D1 position not updated correctly, got (%f, %f)", node.X, node.Y)
			}
		}
		if node.ID == "E1" {
			if node.X != 250.0 || node.Y != 200.0 {
				t.Errorf("E1 position not updated correctly, got (%f, %f)", node.X, node.Y)
			}
		}
	}
}
