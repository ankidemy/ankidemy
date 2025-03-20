// +build test_import

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"myapp/server/dao"
	"myapp/server/models"
	"os"
	"strings"
)

// GraphData represents the JSON structure
type GraphData struct {
	Definitions map[string]DefinitionNode `json:"definitions"`
	Exercises   map[string]ExerciseNode   `json:"exercises"`
}

// DefinitionNode represents a definition in the JSON
type DefinitionNode struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Description   []string `json:"description"`
	Notes         string   `json:"notes,omitempty"`
	References    []string `json:"references,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
}

// ExerciseNode represents an exercise in the JSON
type ExerciseNode struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Statement     string   `json:"statement"`
	Description   string   `json:"description,omitempty"`
	Hints         string   `json:"hints,omitempty"`
	Difficulty    string   `json:"difficulty,omitempty"`
	Verifiable    bool     `json:"verifiable,omitempty"`
	Result        string   `json:"result,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
}

// runTestImport imports the test JSON data into the database
func runTestImport() {
	// Parse command line arguments
	testImportFlag := flag.Bool("test-import", false, "Run test import")
	jsonFilePath := flag.String("file", "./sample.json", "Path to the JSON file")
	domainName := flag.String("domain", "Test Domain", "Name of the domain to create")
	domainDesc := flag.String("desc", "Domain imported from JSON", "Description of the domain")
	flag.Parse()

	// Skip if not running test import
	if !*testImportFlag {
		return
	}

	fmt.Println("Starting test import...")

	// Initialize database connection - using the global DB var already initialized in main
	db := dao.DB
	if db == nil {
		log.Fatalf("Database not initialized")
	}

	// Read and parse the JSON file
	jsonFile, err := os.Open(*jsonFilePath)
	if err != nil {
		log.Fatalf("Failed to open JSON file: %v", err)
	}
	defer jsonFile.Close()

	byteValue, err := ioutil.ReadAll(jsonFile)
	if err != nil {
		log.Fatalf("Failed to read JSON file: %v", err)
	}

	var graphData GraphData
	if err := json.Unmarshal(byteValue, &graphData); err != nil {
		log.Fatalf("Failed to parse JSON: %v", err)
	}

	// Create DAOs
	userDAO := dao.NewUserDAO(db)
	domainDAO := dao.NewDomainDAO(db)
	definitionDAO := dao.NewDefinitionDAO(db)
	exerciseDAO := dao.NewExerciseDAO(db)

	// Get admin user or create one if it doesn't exist
	adminUser := &models.User{
		Username:  "admin",
		Email:     "admin@example.com",
		Password:  "admin_password",
		Level:     "admin",
		FirstName: "Admin",
		LastName:  "User",
		IsAdmin:   true,
	}
	if err := userDAO.CreateAdminUser(adminUser); err != nil {
		log.Printf("Warning: Failed to create admin user: %v", err)
	}

	// Find the admin user
	adminUser, err = userDAO.FindUserByEmail("admin@example.com")
	if err != nil {
		log.Fatalf("Failed to find admin user: %v", err)
	}

	// Create a new domain
	domain := &models.Domain{
		Name:        *domainName,
		Privacy:     "public",
		OwnerID:     adminUser.ID,
		Description: *domainDesc,
	}
	if err := domainDAO.Create(domain); err != nil {
		log.Fatalf("Failed to create domain: %v", err)
	}

	fmt.Printf("Created domain: %s (ID: %d)\n", domain.Name, domain.ID)

	// Create definitions
	definitions := make(map[string]*models.Definition)
	for code, def := range graphData.Definitions {
		// Process multiple descriptions - join with a delimiter for storing
		descriptionStr := strings.Join(def.Description, "|||")

		definition := &models.Definition{
			Code:        code,
			Name:        def.Name,
			Description: descriptionStr,
			Notes:       def.Notes,
			DomainID:    domain.ID,
			OwnerID:     adminUser.ID,
			XPosition:   def.XPosition,
			YPosition:   def.YPosition,
		}
		
		// Create the definition (with references but no prerequisites yet)
		if err := definitionDAO.Create(definition, def.References, nil); err != nil {
			log.Fatalf("Failed to create definition %s: %v", code, err)
		}
		
		definitions[code] = definition
		fmt.Printf("Created definition: %s (ID: %d)\n", definition.Name, definition.ID)
	}

	// Now add prerequisites for definitions
	for code, def := range graphData.Definitions {
		if len(def.Prerequisites) > 0 {
			definition := definitions[code]
			var prerequisiteIDs []uint
			
			for _, prereqCode := range def.Prerequisites {
				if prereqDef, exists := definitions[prereqCode]; exists {
					prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
				} else {
					log.Printf("Warning: Prerequisite %s not found for definition %s", prereqCode, code)
				}
			}
			
			if len(prerequisiteIDs) > 0 {
				// Get references
				var references []string
				for _, ref := range definition.References {
					references = append(references, ref.Reference)
				}
				
				if err := definitionDAO.Update(definition, references, prerequisiteIDs); err != nil {
					log.Fatalf("Failed to update definition %s with prerequisites: %v", code, err)
				}
			}
		}
	}

	// Create exercises
	exercises := make(map[string]*models.Exercise)
	for code, ex := range graphData.Exercises {
		difficulty := ex.Difficulty
		if difficulty == "" {
			difficulty = "3" // Default medium difficulty
		}

		exercise := &models.Exercise{
			Code:        code,
			Name:        ex.Name,
			Statement:   ex.Statement,
			Description: ex.Description,
			Hints:       ex.Hints,
			DomainID:    domain.ID,
			OwnerID:     adminUser.ID,
			Verifiable:  ex.Verifiable,
			Result:      ex.Result,
			Difficulty:  difficulty,
			XPosition:   ex.XPosition,
			YPosition:   ex.YPosition,
		}
		
		// Create the exercise with prerequisites
		var prerequisiteIDs []uint
		for _, prereqCode := range ex.Prerequisites {
			if prereqDef, exists := definitions[prereqCode]; exists {
				prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
			} else {
				log.Printf("Warning: Prerequisite %s not found for exercise %s", prereqCode, code)
			}
		}
		
		if err := exerciseDAO.Create(exercise, prerequisiteIDs); err != nil {
			log.Fatalf("Failed to create exercise %s: %v", code, err)
		}
		
		exercises[code] = exercise
		fmt.Printf("Created exercise: %s (ID: %d)\n", exercise.Name, exercise.ID)
	}

	fmt.Println("Import completed successfully!")
	os.Exit(0) // Exit after importing
}
