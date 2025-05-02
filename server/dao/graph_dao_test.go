package dao

import (
	"myapp/server/models"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupGraphTestDB() (*gorm.DB, error) {
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
		&models.Reference{},
	}

	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			return nil, err
		}
	}

	return db, nil
}

func createTestGraphData(db *gorm.DB) (uint, error) {
	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	definitionDAO := NewDefinitionDAO(db)
	exerciseDAO := NewExerciseDAO(db)

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
		return 0, err
	}

	// Create a domain
	domain := &models.Domain{
		Name:        "Graph Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for graph tests",
	}
	if err := domainDAO.Create(domain); err != nil {
		return 0, err
	}

	// Create definitions
	def1 := &models.Definition{
		Code:        "G1",
		Name:        "Graph Def 1",
		Description: "First graph definition",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		XPosition:   100.0,
		YPosition:   100.0,
	}
	if err := definitionDAO.Create(def1, []string{"Reference 1"}, nil); err != nil {
		return 0, err
	}

	def2 := &models.Definition{
		Code:        "G2",
		Name:        "Graph Def 2",
		Description: "Second graph definition",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		XPosition:   200.0,
		YPosition:   100.0,
	}
	if err := definitionDAO.Create(def2, []string{"Reference 2"}, []uint{def1.ID}); err != nil {
		return 0, err
	}

	def3 := &models.Definition{
		Code:        "G3",
		Name:        "Graph Def 3",
		Description: "Third graph definition",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		XPosition:   300.0,
		YPosition:   100.0,
	}
	if err := definitionDAO.Create(def3, []string{"Reference 3"}, []uint{def2.ID}); err != nil {
		return 0, err
	}

	// Create exercise
	exercise := &models.Exercise{
		Code:        "GEX1",
		Name:        "Graph Exercise 1",
		Statement:   "Test exercise for graph",
		Description: "Exercise description",
		DomainID:    domain.ID,
		OwnerID:     user.ID,
		Verifiable:  true,
		Result:      "correct answer",
		XPosition:   400.0,
		YPosition:   200.0,
	}
	if err := exerciseDAO.Create(exercise, []uint{def3.ID}); err != nil {
		return 0, err
	}

	return domain.ID, nil
}

func TestExportDomain(t *testing.T) {
	// Setup
	db, err := setupGraphTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	domainID, err := createTestGraphData(db)
	if err != nil {
		t.Fatalf("Failed to create test graph data: %v", err)
	}

	// Create GraphDAO
	graphDAO := NewGraphDAO(db)

	// Export domain to graph
	graph, err := graphDAO.ExportDomain(domainID)
	if err != nil {
		t.Fatalf("Failed to export domain to graph: %v", err)
	}

	// Verify graph structure
	if len(graph.Definitions) != 3 {
		t.Errorf("Expected 3 definitions in graph, got %d", len(graph.Definitions))
	}
	if len(graph.Exercises) != 1 {
		t.Errorf("Expected 1 exercise in graph, got %d", len(graph.Exercises))
	}

	// Verify definition properties
	def1, exists := graph.Definitions["G1"]
	if !exists {
		t.Fatal("Definition G1 not found in graph")
	}
	if def1.Name != "Graph Def 1" {
		t.Errorf("Expected definition name 'Graph Def 1', got '%s'", def1.Name)
	}
	if len(def1.Prerequisites) != 0 {
		t.Errorf("Expected 0 prerequisites for G1, got %d", len(def1.Prerequisites))
	}

	def2, exists := graph.Definitions["G2"]
	if !exists {
		t.Fatal("Definition G2 not found in graph")
	}
	if len(def2.Prerequisites) != 1 || def2.Prerequisites[0] != "G1" {
		t.Errorf("Expected G2 to have G1 as prerequisite")
	}

	def3, exists := graph.Definitions["G3"]
	if !exists {
		t.Fatal("Definition G3 not found in graph")
	}
	if len(def3.Prerequisites) != 1 || def3.Prerequisites[0] != "G2" {
		t.Errorf("Expected G3 to have G2 as prerequisite")
	}

	// Verify exercise properties
	ex1, exists := graph.Exercises["GEX1"]
	if !exists {
		t.Fatal("Exercise GEX1 not found in graph")
	}
	if ex1.Name != "Graph Exercise 1" {
		t.Errorf("Expected exercise name 'Graph Exercise 1', got '%s'", ex1.Name)
	}
	if len(ex1.Prerequisites) != 1 || ex1.Prerequisites[0] != "G3" {
		t.Errorf("Expected GEX1 to have G3 as prerequisite")
	}
}

func TestImportDomain(t *testing.T) {
	// Setup
	db, err := setupGraphTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create a user and domain
	userDAO := NewUserDAO(db)
	domainDAO := NewDomainDAO(db)
	graphDAO := NewGraphDAO(db)

	user := &models.User{
		Username:  "importuser",
		Email:     "import@example.com",
		Password:  "password123",
		Level:     "user",
		FirstName: "Import",
		LastName:  "User",
		IsActive:  true,
	}
	if err := userDAO.CreateUser(user); err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	domain := &models.Domain{
		Name:        "Import Domain",
		Privacy:     "public",
		OwnerID:     user.ID,
		Description: "Domain for import test",
	}
	if err := domainDAO.Create(domain); err != nil {
		t.Fatalf("Failed to create domain: %v", err)
	}

	// Create graph data to import
	graph := &GraphData{
		Definitions: make(map[string]DefinitionNode),
		Exercises:   make(map[string]ExerciseNode),
	}

	// Add definitions
	graph.Definitions["D1"] = DefinitionNode{
		Code:        "D1",
		Name:        "Definition 1",
		Description: "First imported definition",
		XPosition:   50.0,
		YPosition:   50.0,
	}
	graph.Definitions["D2"] = DefinitionNode{
		Code:        "D2",
		Name:        "Definition 2",
		Description: "Second imported definition",
		XPosition:   150.0,
		YPosition:   50.0,
		Prerequisites: []string{"D1"},
	}

	// Add exercise
	graph.Exercises["E1"] = ExerciseNode{
		Code:        "E1",
		Name:        "Exercise 1",
		Statement:   "Imported exercise statement",
		Description: "Imported exercise description",
		XPosition:   200.0,
		YPosition:   150.0,
		Prerequisites: []string{"D2"},
	}

	// Import the graph
	if err := graphDAO.ImportDomain(domain.ID, graph); err != nil {
		t.Fatalf("Failed to import domain from graph: %v", err)
	}

	// Export the domain to verify import
	exportedGraph, err := graphDAO.ExportDomain(domain.ID)
	if err != nil {
		t.Fatalf("Failed to export domain after import: %v", err)
	}

	// Verify imported data
	if len(exportedGraph.Definitions) != 2 {
		t.Errorf("Expected 2 definitions after import, got %d", len(exportedGraph.Definitions))
	}
	if len(exportedGraph.Exercises) != 1 {
		t.Errorf("Expected 1 exercise after import, got %d", len(exportedGraph.Exercises))
	}

	// Verify definition properties
	def1, exists := exportedGraph.Definitions["D1"]
	if !exists {
		t.Fatal("Definition D1 not found after import")
	}
	if def1.Name != "Definition 1" {
		t.Errorf("Expected definition name 'Definition 1', got '%s'", def1.Name)
	}

	def2, exists := exportedGraph.Definitions["D2"]
	if !exists {
		t.Fatal("Definition D2 not found after import")
	}
	if len(def2.Prerequisites) != 1 || def2.Prerequisites[0] != "D1" {
		t.Errorf("Expected D2 to have D1 as prerequisite after import")
	}

	// Verify exercise properties
	ex1, exists := exportedGraph.Exercises["E1"]
	if !exists {
		t.Fatal("Exercise E1 not found after import")
	}
	if ex1.Name != "Exercise 1" {
		t.Errorf("Expected exercise name 'Exercise 1', got '%s'", ex1.Name)
	}
	if len(ex1.Prerequisites) != 1 || ex1.Prerequisites[0] != "D2" {
		t.Errorf("Expected E1 to have D2 as prerequisite after import")
	}
}

func TestGetVisualGraph(t *testing.T) {
	// Setup
	db, err := setupGraphTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	domainID, err := createTestGraphData(db)
	if err != nil {
		t.Fatalf("Failed to create test graph data: %v", err)
	}

	// Create GraphDAO
	graphDAO := NewGraphDAO(db)

	// Get visual graph
	visualGraph, err := graphDAO.GetVisualGraph(domainID)
	if err != nil {
		t.Fatalf("Failed to get visual graph: %v", err)
	}

	// Verify graph structure
	if len(visualGraph.Nodes) != 4 { // 3 definitions + 1 exercise
		t.Errorf("Expected 4 nodes in visual graph, got %d", len(visualGraph.Nodes))
	}
	if len(visualGraph.Links) != 3 { // G1->G2, G2->G3, G3->GEX1
		t.Errorf("Expected 3 links in visual graph, got %d", len(visualGraph.Links))
	}

	// Verify node types
	defCount := 0
	exCount := 0
	for _, node := range visualGraph.Nodes {
		if node.Type == "definition" {
			defCount++
		} else if node.Type == "exercise" {
			exCount++
		}
	}
	if defCount != 3 {
		t.Errorf("Expected 3 definition nodes, got %d", defCount)
	}
	if exCount != 1 {
		t.Errorf("Expected 1 exercise node, got %d", exCount)
	}

	// Verify links
	linkMap := make(map[string]bool)
	for _, link := range visualGraph.Links {
		linkMap[link.Source+"->"+link.Target] = true
	}
	if !linkMap["G1->G2"] {
		t.Error("Expected link from G1 to G2")
	}
	if !linkMap["G2->G3"] {
		t.Error("Expected link from G2 to G3")
	}
	if !linkMap["G3->GEX1"] {
		t.Error("Expected link from G3 to GEX1")
	}
}

func TestUpdateGraphPositions(t *testing.T) {
	// Setup
	db, err := setupGraphTestDB()
	if err != nil {
		t.Fatalf("Failed to setup test database: %v", err)
	}

	// Create test data
	domainID, err := createTestGraphData(db)
	if err != nil {
		t.Fatalf("Failed to create test graph data: %v", err)
	}

	// Create GraphDAO
	graphDAO := NewGraphDAO(db)

	// Update positions
	positionUpdates := map[string]struct{ X, Y float64 }{
		"G1":   {X: 150.0, Y: 150.0},
		"G2":   {X: 250.0, Y: 150.0},
		"GEX1": {X: 450.0, Y: 250.0},
	}
	if err := graphDAO.UpdateGraphPositions(positionUpdates); err != nil {
		t.Fatalf("Failed to update graph positions: %v", err)
	}

	// Get visual graph to verify updates
	visualGraph, err := graphDAO.GetVisualGraph(domainID)
	if err != nil {
		t.Fatalf("Failed to get visual graph after position update: %v", err)
	}

	// Verify position updates
	for _, node := range visualGraph.Nodes {
		if node.ID == "G1" {
			if node.X != 150.0 || node.Y != 150.0 {
				t.Errorf("G1 position not updated correctly, got (%f, %f)", node.X, node.Y)
			}
		} else if node.ID == "G2" {
			if node.X != 250.0 || node.Y != 150.0 {
				t.Errorf("G2 position not updated correctly, got (%f, %f)", node.X, node.Y)
			}
		} else if node.ID == "GEX1" {
			if node.X != 450.0 || node.Y != 250.0 {
				t.Errorf("GEX1 position not updated correctly, got (%f, %f)", node.X, node.Y)
			}
		} else if node.ID == "G3" {
			if node.X != 300.0 || node.Y != 100.0 {
				t.Errorf("G3 position should not change, got (%f, %f)", node.X, node.Y)
			}
		}
	}
}
