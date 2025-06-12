package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strings"

	"myapp/server/dao"
	"myapp/server/models"
	"gorm.io/gorm"
)

// TutorialData represents the JSON structure for tutorial content
type TutorialData struct {
	Definitions map[string]TutorialDefinitionNode `json:"definitions"`
	Exercises   map[string]TutorialExerciseNode   `json:"exercises"`
}

// TutorialDefinitionNode represents a definition in the tutorial JSON
type TutorialDefinitionNode struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Description   []string `json:"description"`
	Notes         string   `json:"notes,omitempty"`
	References    []string `json:"references,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
}

// TutorialExerciseNode represents an exercise in the tutorial JSON
type TutorialExerciseNode struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Statement     string   `json:"statement"`
	Description   string   `json:"description,omitempty"`
	Hints         string   `json:"hints,omitempty"`
	Difficulty    int      `json:"difficulty,omitempty"`
	Verifiable    bool     `json:"verifiable,omitempty"`
	Result        string   `json:"result,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
}

const (
	TutorialDomainName = "Tutorial: Introduction to Learning"
	TutorialFileName   = "tutorial.json"
)

// autoImportTutorial checks if tutorial domain exists and imports it if not
func autoImportTutorial(db *gorm.DB) error {
	log.Println("Checking for tutorial domain...")

	// Check if tutorial domain already exists
	domainDAO := dao.NewDomainDAO(db)
	existingDomain, err := domainDAO.FindByName(TutorialDomainName)
	if err == nil && existingDomain != nil {
		log.Printf("Tutorial domain already exists (ID: %d), skipping import", existingDomain.ID)
		return nil
	}

	log.Println("Tutorial domain not found, importing tutorial data...")

	// Get or create admin user
	userDAO := dao.NewUserDAO(db)
	adminUser, err := userDAO.FindUserByEmail("admin@example.com")
	if err != nil {
		// Create admin user if it doesn't exist
		adminUser = &models.User{
			Username:  "admin",
			Email:     "admin@example.com",
			Password:  "admin_password",
			Level:     "admin",
			FirstName: "Admin",
			LastName:  "User",
			IsAdmin:   true,
		}
		if err := userDAO.CreateAdminUser(adminUser); err != nil {
			return fmt.Errorf("failed to create admin user: %v", err)
		}
		adminUser, err = userDAO.FindUserByEmail("admin@example.com")
		if err != nil {
			return fmt.Errorf("failed to find admin user after creation: %v", err)
		}
	}

	// Read tutorial JSON file
	tutorialData, err := readTutorialFile()
	if err != nil {
		return fmt.Errorf("failed to read tutorial file: %v", err)
	}

	// Create tutorial domain
	tutorialDomain := &models.Domain{
		Name:        TutorialDomainName,
		Privacy:     "public",
		OwnerID:     adminUser.ID,
		Description: "Interactive tutorial introducing key concepts in learning science and knowledge management. Perfect for understanding how this spaced repetition system works!",
	}

	if err := domainDAO.Create(tutorialDomain); err != nil {
		return fmt.Errorf("failed to create tutorial domain: %v", err)
	}

	log.Printf("Created tutorial domain: %s (ID: %d)", tutorialDomain.Name, tutorialDomain.ID)

	// Import tutorial content
	if err := importTutorialContent(db, tutorialDomain, adminUser, tutorialData); err != nil {
		return fmt.Errorf("failed to import tutorial content: %v", err)
	}

	log.Println("Tutorial import completed successfully!")
	return nil
}

// readTutorialFile reads and parses the tutorial JSON file
func readTutorialFile() (*TutorialData, error) {
	// Try multiple possible locations for the tutorial file
	possiblePaths := []string{
		TutorialFileName,                    // Current directory
		filepath.Join("data", TutorialFileName), // data subdirectory
		filepath.Join("..", TutorialFileName),   // Parent directory
		filepath.Join("server", TutorialFileName), // server subdirectory
	}

	var jsonFile *os.File
	var err error
	var usedPath string

	for _, path := range possiblePaths {
		jsonFile, err = os.Open(path)
		if err == nil {
			usedPath = path
			break
		}
	}

	if jsonFile == nil {
		return nil, fmt.Errorf("tutorial file not found in any of these locations: %v", possiblePaths)
	}
	defer jsonFile.Close()

	log.Printf("Reading tutorial data from: %s", usedPath)

	byteValue, err := ioutil.ReadAll(jsonFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read tutorial file: %v", err)
	}

	var tutorialData TutorialData
	if err := json.Unmarshal(byteValue, &tutorialData); err != nil {
		return nil, fmt.Errorf("failed to parse tutorial JSON: %v", err)
	}

	return &tutorialData, nil
}

// importTutorialContent imports the tutorial definitions and exercises
func importTutorialContent(db *gorm.DB, domain *models.Domain, owner *models.User, data *TutorialData) error {
	definitionDAO := dao.NewDefinitionDAO(db)
	exerciseDAO := dao.NewExerciseDAO(db)

	// Create definitions first (without prerequisites)
	definitions := make(map[string]*models.Definition)
	for code, defNode := range data.Definitions {
		// Join multiple description lines
		descriptionStr := strings.Join(defNode.Description, "\n\n")

		definition := &models.Definition{
			Code:        defNode.Code,
			Name:        defNode.Name,
			Description: descriptionStr,
			Notes:       defNode.Notes,
			DomainID:    domain.ID,
			OwnerID:     owner.ID,
			XPosition:   defNode.XPosition,
			YPosition:   defNode.YPosition,
		}

		// Create definition with references but no prerequisites yet
		if err := definitionDAO.Create(definition, defNode.References, nil); err != nil {
			return fmt.Errorf("failed to create definition %s: %v", code, err)
		}

		definitions[code] = definition
		log.Printf("Created definition: %s (ID: %d)", definition.Name, definition.ID)
	}

	// Now add prerequisites for definitions
	for code, defNode := range data.Definitions {
		if len(defNode.Prerequisites) > 0 {
			definition := definitions[code]
			var prerequisiteIDs []uint

			for _, prereqCode := range defNode.Prerequisites {
				if prereqDef, exists := definitions[prereqCode]; exists {
					prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
				} else {
					log.Printf("Warning: Prerequisite %s not found for definition %s", prereqCode, code)
				}
			}

			if len(prerequisiteIDs) > 0 {
				// Update definition with prerequisites
				if err := definitionDAO.Update(definition, defNode.References, prerequisiteIDs); err != nil {
					return fmt.Errorf("failed to update definition %s with prerequisites: %v", code, err)
				}
			}
		}
	}

	// Create exercises
	for code, exNode := range data.Exercises {
		exercise := &models.Exercise{
			Code:        exNode.Code,
			Name:        exNode.Name,
			Statement:   exNode.Statement,
			Description: exNode.Description,
			Hints:       exNode.Hints,
			DomainID:    domain.ID,
			OwnerID:     owner.ID,
			Verifiable:  exNode.Verifiable,
			Result:      exNode.Result,
			Difficulty:  exNode.Difficulty,
			XPosition:   exNode.XPosition,
			YPosition:   exNode.YPosition,
		}

		// Collect prerequisite IDs
		var prerequisiteIDs []uint
		for _, prereqCode := range exNode.Prerequisites {
			if prereqDef, exists := definitions[prereqCode]; exists {
				prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
			} else {
				log.Printf("Warning: Prerequisite %s not found for exercise %s", prereqCode, code)
			}
		}

		// Create exercise with prerequisites
		if err := exerciseDAO.Create(exercise, prerequisiteIDs); err != nil {
			return fmt.Errorf("failed to create exercise %s: %v", code, err)
		}

		log.Printf("Created exercise: %s (ID: %d)", exercise.Name, exercise.ID)
	}

	// Verify prerequisites were created correctly
	var prereqCount int64
	db.Model(&models.NodePrerequisite{}).
		Joins("JOIN definitions d1 ON (node_id = d1.id AND node_type = 'definition') OR (prerequisite_id = d1.id AND prerequisite_type = 'definition')").
		Joins("JOIN exercises e1 ON (node_id = e1.id AND node_type = 'exercise') OR (prerequisite_id = e1.id AND prerequisite_type = 'exercise')").
		Where("d1.domain_id = ? OR e1.domain_id = ?", domain.ID, domain.ID).
		Count(&prereqCount)

	log.Printf("Created %d prerequisite relationships for tutorial domain", prereqCount)

	return nil
}

// createTutorialFile creates the tutorial.json file if it doesn't exist
func createTutorialFile() error {
	// Check if file already exists
	if _, err := os.Stat(TutorialFileName); err == nil {
		log.Printf("Tutorial file %s already exists", TutorialFileName)
		return nil
	}

	log.Printf("Creating tutorial file: %s", TutorialFileName)

	// This would contain the tutorial data - in practice, you'd embed it or generate it
	// For now, we'll just create a placeholder
	placeholderContent := `{
  "definitions": {},
  "exercises": {}
}`

	return ioutil.WriteFile(TutorialFileName, []byte(placeholderContent), 0644)
}
