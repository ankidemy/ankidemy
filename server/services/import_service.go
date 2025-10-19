package services

import (
	"encoding/json"
	"errors"
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

// ImportService handles domain import and export operations
type ImportService struct {
	db            *gorm.DB
	domainDAO     *dao.DomainDAO
	definitionDAO *dao.DefinitionDAO
	exerciseDAO   *dao.ExerciseDAO
	userDAO       *dao.UserDAO
}

// FlexibleStringArray handles both string and []string for JSON unmarshaling
type FlexibleStringArray []string

// UnmarshalJSON implements custom unmarshaling for FlexibleStringArray
func (fsa *FlexibleStringArray) UnmarshalJSON(data []byte) error {
	// Try to unmarshal as array first
	var arr []string
	if err := json.Unmarshal(data, &arr); err == nil {
		*fsa = FlexibleStringArray(arr)
		return nil
	}

	// If that fails, try as single string
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		// Split by ||| if it contains multiple descriptions
		if strings.Contains(str, "|||") {
			*fsa = FlexibleStringArray(strings.Split(str, "|||"))
		} else {
			*fsa = FlexibleStringArray([]string{str})
		}
		return nil
	}

	return fmt.Errorf("description must be either a string or array of strings")
}

// MarshalJSON implements custom marshaling for FlexibleStringArray
func (fsa FlexibleStringArray) MarshalJSON() ([]byte, error) {
	// Always export as array for consistency
	return json.Marshal([]string(fsa))
}

// ToStringSlice converts FlexibleStringArray to []string
func (fsa FlexibleStringArray) ToStringSlice() []string {
	return []string(fsa)
}

// ImportData represents the unified structure for import/export operations
type ImportData struct {
    Definitions map[string]ImportDefinitionNode `json:"definitions"`
    Exercises   map[string]ImportExerciseNode   `json:"exercises"`
    MetaExercises map[string]ImportMetaExerciseNode `json:"metaExercises,omitempty"`
}

// ImportDefinitionNode represents a definition in the import/export format
type ImportDefinitionNode struct {
	Code          string              `json:"code"`
	Name          string              `json:"name"`
	Description   FlexibleStringArray `json:"description"` // Now handles both string and []string
	Notes         string              `json:"notes,omitempty"`
	References    []string            `json:"references,omitempty"`
    Prerequisites []string            `json:"prerequisites,omitempty"`
    // Optional weights per prerequisite code (0.01 - 1.0)
    PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
	XPosition     float64             `json:"xPosition,omitempty"`
	YPosition     float64             `json:"yPosition,omitempty"`
}

// ImportExerciseNode represents an exercise in the import/export format
type ImportExerciseNode struct {
	Code          string      `json:"code"`
	Name          string      `json:"name"`
	Statement     string      `json:"statement"`
	Description   string      `json:"description,omitempty"` // Exercises keep single string
	Hints         string      `json:"hints,omitempty"`
	Difficulty    interface{} `json:"difficulty,omitempty"` // Accept both string and number
	Verifiable    bool        `json:"verifiable,omitempty"`
	Result        string      `json:"result,omitempty"`
    Prerequisites []string    `json:"prerequisites,omitempty"`
    // Optional weights per prerequisite code (0.01 - 1.0)
    PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
	XPosition     float64     `json:"xPosition,omitempty"`
	YPosition     float64     `json:"yPosition,omitempty"`
}

// ImportExerciseVersion represents a single version in a meta-exercise
type ImportExerciseVersion struct {
    Statement   string `json:"statement"`
    Description string `json:"description,omitempty"`
    Hints       string `json:"hints,omitempty"`
    Verifiable  bool   `json:"verifiable,omitempty"`
    Result      string `json:"result,omitempty"`
    Difficulty  int    `json:"difficulty,omitempty"`
    Notes       string `json:"notes,omitempty"`
}

// ImportMetaExerciseNode represents a pool of versions sharing code/name
type ImportMetaExerciseNode struct {
    Code        string   `json:"code"`
    Name        string   `json:"name"`
    Prerequisites []string `json:"prerequisites,omitempty"`
    PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
    XPosition   float64  `json:"xPosition,omitempty"`
    YPosition   float64  `json:"yPosition,omitempty"`
    Versions    []ImportExerciseVersion `json:"versions"`
}

// NewImportService creates a new ImportService instance
func NewImportService(db *gorm.DB) *ImportService {
	return &ImportService{
		db:            db,
		domainDAO:     dao.NewDomainDAO(db),
		definitionDAO: dao.NewDefinitionDAO(db),
		exerciseDAO:   dao.NewExerciseDAO(db),
		userDAO:       dao.NewUserDAO(db),
	}
}

// CreateDomainWithImport creates a new domain and imports data into it
func (s *ImportService) CreateDomainWithImport(userID uint, name, privacy, description string, data *ImportData) (*models.Domain, error) {
	// Validate import data first
	if err := s.ValidateImportData(data); err != nil {
		return nil, fmt.Errorf("import data validation failed: %v", err)
	}

	// Declare the variable outside the transaction
	var domain *models.Domain

	// The Transaction function returns only an error
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Create domain
		createdDomain := &models.Domain{
			Name:        name,
			Privacy:     privacy,
			OwnerID:     userID,
			Description: description,
		}

		domainDAO := dao.NewDomainDAO(tx)
		if err := domainDAO.Create(createdDomain); err != nil {
			return fmt.Errorf("failed to create domain: %v", err)
		}

		log.Printf("Created domain: %s (ID: %d)", createdDomain.Name, createdDomain.ID)

		// Assign to outer variable
		domain = createdDomain

		// Import data into the new domain
		if err := s.importDataToDomain(tx, domain, userID, data); err != nil {
			return fmt.Errorf("failed to import data: %v", err)
		}

		// Enroll the owner in the domain
		progressDAO := dao.NewProgressDAO(tx)
		if err := progressDAO.EnrollUserInDomain(userID, domain.ID); err != nil {
			log.Printf("Warning: Failed to enroll owner in domain: %v", err)
			// Not returning this error, so it won't cause rollback
		}

		return nil
	})

	return domain, err
}

// ImportToDomain imports data into an existing domain
func (s *ImportService) ImportToDomain(domainID uint, data *ImportData) error {
	// Validate import data first
	if err := s.ValidateImportData(data); err != nil {
		return fmt.Errorf("import data validation failed: %v", err)
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// Get domain
		domain, err := s.domainDAO.FindByID(domainID)
		if err != nil {
			return fmt.Errorf("domain not found: %v", err)
		}

		// Import data into the domain
		return s.importDataToDomain(tx, domain, domain.OwnerID, data)
	})
}

// ExportDomain exports a domain to ImportData format
func (s *ImportService) ExportDomain(domainID uint) (*ImportData, error) {
	// Get definitions with prerequisites
	var definitions []models.Definition
	if err := s.db.Preload("References").Where("domain_id = ?", domainID).Find(&definitions).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch definitions: %v", err)
	}

    // Get pools (meta_exercises)
    var metas []models.MetaExercise
    if err := s.db.Where("domain_id = ?", domainID).Find(&metas).Error; err != nil {
        return nil, fmt.Errorf("failed to fetch meta exercises: %v", err)
    }

	// Check domain exists
    if len(definitions) == 0 && len(metas) == 0 {
        var count int64
        s.db.Model(&models.Domain{}).Where("id = ?", domainID).Count(&count)
        if count == 0 {
            return nil, errors.New("domain not found")
        }
    }

	// Prepare export data
    exportData := &ImportData{
        Definitions: make(map[string]ImportDefinitionNode),
        Exercises:   make(map[string]ImportExerciseNode),
        MetaExercises: make(map[string]ImportMetaExerciseNode),
    }

    // Export definitions (with weights)
    for _, def := range definitions {
		// Extract references
		references := make([]string, 0, len(def.References))
		for _, ref := range def.References {
			references = append(references, ref.Reference)
		}

        // Get prerequisite codes and weights
        prerequisiteCodes, err := s.getPrerequisiteCodes(def.ID, "definition")
        if err != nil {
            return nil, fmt.Errorf("failed to get prerequisites for definition %s: %v", def.Code, err)
        }
        prereqWeights, err := s.getPrerequisiteWeights(def.ID, "definition")
        if err != nil {
            return nil, fmt.Errorf("failed to get prerequisite weights for definition %s: %v", def.Code, err)
        }

		// Handle multiple descriptions - STANDARDIZED EXPORT
		var descriptions FlexibleStringArray
		if strings.Contains(def.Description, "|||") {
			descriptions = FlexibleStringArray(strings.Split(def.Description, "|||"))
		} else {
			descriptions = FlexibleStringArray([]string{def.Description})
		}

        exportData.Definitions[def.Code] = ImportDefinitionNode{
            Code:          def.Code,
            Name:          def.Name,
            Description:   descriptions, // Always export as FlexibleStringArray (which marshals to []string)
            Notes:         def.Notes,
            References:    references,
            Prerequisites: prerequisiteCodes,
            PrerequisiteWeights: prereqWeights,
            XPosition:     def.XPosition,
            YPosition:     def.YPosition,
        }
    }

    // Export meta-exercises (with versions and weights)
    for _, me := range metas {
        prerequisiteCodes, err := s.getPrerequisiteCodes(me.ID, "meta_exercise")
        if err != nil { return nil, fmt.Errorf("failed to get prerequisites for meta %s: %v", me.Code, err) }
        prereqWeights, err := s.getPrerequisiteWeights(me.ID, "meta_exercise")
        if err != nil { return nil, fmt.Errorf("failed to get prerequisite weights for meta %s: %v", me.Code, err) }
        var versions []models.Exercise
        if err := s.db.Where("meta_exercise_id = ?", me.ID).Order("id ASC").Find(&versions).Error; err != nil {
            return nil, fmt.Errorf("failed to fetch versions for %s: %v", me.Code, err)
        }
        vnodes := make([]ImportExerciseVersion, 0, len(versions))
        for _, v := range versions {
            vnodes = append(vnodes, ImportExerciseVersion{
                Statement: v.Statement,
                Description: v.Description,
                Hints: v.Hints,
                Verifiable: v.Verifiable,
                Result: v.Result,
                Difficulty: v.Difficulty,
                Notes: v.Notes,
            })
        }
        exportData.MetaExercises[me.Code] = ImportMetaExerciseNode{
            Code: me.Code,
            Name: me.Name,
            Prerequisites: prerequisiteCodes,
            PrerequisiteWeights: prereqWeights,
            XPosition: me.XPosition,
            YPosition: me.YPosition,
            Versions: vnodes,
        }
    }

	return exportData, nil
}

// ReadImportFileFromPath reads and parses an import file from a file path
func (s *ImportService) ReadImportFileFromPath(filePath string) (*ImportData, error) {
	// Try multiple possible locations for the file
	possiblePaths := []string{
		filePath,                                 // Exact path provided
		filepath.Join("data", filePath),          // data subdirectory
		filepath.Join("..", filePath),            // Parent directory
		filepath.Join("server", filePath),        // server subdirectory
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
		return nil, fmt.Errorf("import file not found in any of these locations: %v", possiblePaths)
	}
	defer jsonFile.Close()

	log.Printf("Reading import data from: %s", usedPath)

	byteValue, err := ioutil.ReadAll(jsonFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read import file: %v", err)
	}

	var importData ImportData
	if err := json.Unmarshal(byteValue, &importData); err != nil {
		return nil, fmt.Errorf("failed to parse import JSON: %v", err)
	}

	return &importData, nil
}

// ValidateImportData validates the structure and content of import data
func (s *ImportService) ValidateImportData(data *ImportData) error {
	if data == nil {
		return errors.New("import data is nil")
	}

	// Collect all codes to check for duplicates
	allCodes := make(map[string]bool)

	// Validate definitions
	for code, def := range data.Definitions {
		if def.Code == "" {
			return fmt.Errorf("definition %s has empty code", code)
		}
		if def.Name == "" {
			return fmt.Errorf("definition %s has empty name", code)
		}
		if len(def.Description.ToStringSlice()) == 0 {
			return fmt.Errorf("definition %s has empty description", code)
		}

		if allCodes[def.Code] {
			return fmt.Errorf("duplicate code found: %s", def.Code)
		}
		allCodes[def.Code] = true
	}

    // Validate metaExercises or legacy exercises
    if len(data.MetaExercises) > 0 {
        for code, me := range data.MetaExercises {
            if me.Code == "" { return fmt.Errorf("metaExercise %s has empty code", code) }
            if me.Name == "" { return fmt.Errorf("metaExercise %s has empty name", code) }
            if len(me.Versions) == 0 { return fmt.Errorf("metaExercise %s has no versions", code) }
            if allCodes[me.Code] { return fmt.Errorf("duplicate code found: %s", me.Code) }
            allCodes[me.Code] = true
        }
    } else {
        for code, ex := range data.Exercises {
            if ex.Code == "" { return fmt.Errorf("exercise %s has empty code", code) }
            if ex.Name == "" { return fmt.Errorf("exercise %s has empty name", code) }
            if ex.Statement == "" { return fmt.Errorf("exercise %s has empty statement", code) }
            if allCodes[ex.Code] { return fmt.Errorf("duplicate code found: %s", ex.Code) }
            allCodes[ex.Code] = true
        }
    }

	// Validate prerequisite references
	for code, def := range data.Definitions {
		for _, prereq := range def.Prerequisites {
			if !allCodes[prereq] {
				return fmt.Errorf("definition %s references unknown prerequisite: %s", code, prereq)
			}
		}
	}

    if len(data.MetaExercises) > 0 {
        for code, me := range data.MetaExercises {
            for _, p := range me.Prerequisites {
                if !allCodes[p] {
                    return fmt.Errorf("metaExercise %s references unknown prerequisite code: %s", code, p)
                }
            }
        }
    } else {
        for code, ex := range data.Exercises {
            for _, prereq := range ex.Prerequisites {
                if !allCodes[prereq] {
                    return fmt.Errorf("exercise %s references unknown prerequisite: %s", code, prereq)
                }
            }
        }
    }

	return nil
}

// ImportTutorialIfNotExists imports the tutorial domain if it doesn't already exist
func (s *ImportService) ImportTutorialIfNotExists() error {
	tutorialDomainName := "Tutorial: Introduction to Learning"

	// Check if tutorial domain already exists
	existingDomain, err := s.domainDAO.FindByName(tutorialDomainName)
	if err == nil && existingDomain != nil {
		log.Printf("Tutorial domain already exists (ID: %d), skipping import", existingDomain.ID)
		return nil
	}

	log.Println("Tutorial domain not found, importing tutorial data...")

	// Get or create admin user
	adminUser, err := s.userDAO.FindUserByEmail("admin@example.com")
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
		if err := s.userDAO.CreateAdminUser(adminUser); err != nil {
			return fmt.Errorf("failed to create admin user: %v", err)
		}
		adminUser, err = s.userDAO.FindUserByEmail("admin@example.com")
		if err != nil {
			return fmt.Errorf("failed to find admin user after creation: %v", err)
		}
	}

	// Read tutorial data
	tutorialData, err := s.ReadImportFileFromPath("tutorial.json")
	if err != nil {
		return fmt.Errorf("failed to read tutorial file: %v", err)
	}

	// Create tutorial domain with imported data
	tutorialDescription := "Interactive tutorial introducing key concepts in learning science and knowledge management. Perfect for understanding how this spaced repetition system works!"
	
	_, err = s.CreateDomainWithImport(
		adminUser.ID,
		tutorialDomainName,
		"public",
		tutorialDescription,
		tutorialData,
	)
	
	if err != nil {
		return fmt.Errorf("failed to create tutorial domain with import: %v", err)
	}

	log.Println("Tutorial import completed successfully!")
	return nil
}

// loadExistingCodes loads all existing codes from a domain (both definitions and meta-exercises)
func (s *ImportService) loadExistingCodes(domainID uint) (map[string]bool, error) {
	codesInUse := make(map[string]bool)

	// Load definition codes
	var definitions []models.Definition
	if err := s.db.Select("code").Where("domain_id = ?", domainID).Find(&definitions).Error; err != nil {
		return nil, err
	}
	for _, def := range definitions {
		codesInUse[def.Code] = true
	}

	// Load meta-exercise codes
	var metaExercises []models.MetaExercise
	if err := s.db.Select("code").Where("domain_id = ?", domainID).Find(&metaExercises).Error; err != nil {
		return nil, err
	}
	for _, meta := range metaExercises {
		codesInUse[meta.Code] = true
	}

	return codesInUse, nil
}

// uniqueCodeFor finds a unique code by appending .1, .2, etc. if the base code is taken
func uniqueCodeFor(base string, used map[string]bool) string {
	if !used[base] {
		return base
	}

	for k := 1; ; k++ {
		candidate := fmt.Sprintf("%s.%d", base, k)
		if !used[candidate] {
			return candidate
		}
	}
}

// Helper function to get prerequisite codes for a node
func (s *ImportService) getPrerequisiteCodes(nodeID uint, nodeType string) ([]string, error) {
	query := `
		SELECT d.code 
		FROM node_prerequisites np
		JOIN definitions d ON np.prerequisite_id = d.id 
		WHERE np.node_id = ? AND np.node_type = ? AND np.prerequisite_type = 'definition'
		ORDER BY d.code
	`

	var codes []string
	if err := s.db.Raw(query, nodeID, nodeType).Scan(&codes).Error; err != nil {
		return nil, err
	}

	return codes, nil
}

// getPrerequisiteWeights returns a map[code]weight for a node's prerequisites
func (s *ImportService) getPrerequisiteWeights(nodeID uint, nodeType string) (map[string]float64, error) {
    query := `
        SELECT d.code, np.weight 
        FROM node_prerequisites np
        JOIN definitions d ON np.prerequisite_id = d.id 
        WHERE np.node_id = ? AND np.node_type = ? AND np.prerequisite_type = 'definition'
        ORDER BY d.code
    `
    type row struct{
        Code string
        Weight float64
    }
    var rows []row
    if err := s.db.Raw(query, nodeID, nodeType).Scan(&rows).Error; err != nil {
        return nil, err
    }
    res := make(map[string]float64, len(rows))
    for _, r := range rows { res[r.Code] = r.Weight }
    return res, nil
}

// importDataToDomain handles the core import logic for definitions and exercises
func (s *ImportService) importDataToDomain(tx *gorm.DB, domain *models.Domain, ownerID uint, data *ImportData) error {
	// Load existing codes in the target domain
	codesInUse, err := s.loadExistingCodes(domain.ID)
	if err != nil {
		return fmt.Errorf("failed to load existing codes: %v", err)
	}

	// Build code assignment maps for collision-safe renaming
	defAssigned := make(map[string]string)  // original -> assigned
	metaAssigned := make(map[string]string) // original -> assigned

	// Assign unique codes for definitions
	for code, defNode := range data.Definitions {
		baseCode := defNode.Code
		if baseCode == "" {
			baseCode = code // Fallback to map key
		}
		assignedCode := uniqueCodeFor(baseCode, codesInUse)
		defAssigned[code] = assignedCode
		codesInUse[assignedCode] = true
	}

	// Assign unique codes for meta-exercises
	for code, me := range data.MetaExercises {
		baseCode := me.Code
		if baseCode == "" {
			baseCode = code
		}
		assignedCode := uniqueCodeFor(baseCode, codesInUse)
		metaAssigned[code] = assignedCode
		codesInUse[assignedCode] = true
	}

	// Create DAOs for the transaction
	definitionDAO := dao.NewDefinitionDAO(tx)
	exerciseDAO := dao.NewExerciseDAO(tx)

	// Create definitions first (without prerequisites)
	definitions := make(map[string]*models.Definition) // map by assigned code
	for code, defNode := range data.Definitions {
		assignedCode := defAssigned[code]
		// Process multiple descriptions - join with a delimiter for storing
		var descriptionStr string
		descriptions := defNode.Description.ToStringSlice()
		if len(descriptions) > 1 {
			descriptionStr = strings.Join(descriptions, "|||")
		} else if len(descriptions) == 1 {
			descriptionStr = descriptions[0]
		} else {
			descriptionStr = ""
		}

		definition := &models.Definition{
			Code:        assignedCode, // Use assigned code
			Name:        defNode.Name,
			Description: descriptionStr,
			Notes:       defNode.Notes,
			DomainID:    domain.ID,
			OwnerID:     ownerID,
			XPosition:   defNode.XPosition,
			YPosition:   defNode.YPosition,
		}

		// Create the definition with references but no prerequisites yet
        if err := definitionDAO.Create(definition, defNode.References, nil, nil); err != nil {
            return fmt.Errorf("failed to create definition %s: %v", assignedCode, err)
        }

		definitions[assignedCode] = definition // Store by assigned code
		if assignedCode != code {
			log.Printf("Created definition: %s (ID: %d) [renamed from %s]", definition.Name, definition.ID, code)
		} else {
			log.Printf("Created definition: %s (ID: %d)", definition.Name, definition.ID)
		}
	}

	// Now add prerequisites for definitions
	for code, defNode := range data.Definitions {
		if len(defNode.Prerequisites) > 0 {
			assignedCode := defAssigned[code]
			definition := definitions[assignedCode]
			var prerequisiteIDs []uint

			for _, prereqCode := range defNode.Prerequisites {
				// Resolve prerequisite through assignment map
				resolvedPrereq := defAssigned[prereqCode]
				if resolvedPrereq == "" {
					resolvedPrereq = prereqCode // Not in import, might be existing
				}

				if prereqDef, exists := definitions[resolvedPrereq]; exists {
					prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
				} else {
					log.Printf("Warning: Prerequisite %s not found for definition %s", prereqCode, assignedCode)
				}
			}

            if len(prerequisiteIDs) > 0 {
                var idWeights map[uint]float64
                if len(defNode.PrerequisiteWeights) > 0 {
                    idWeights = make(map[uint]float64, len(defNode.PrerequisiteWeights))
                    for pcode, w := range defNode.PrerequisiteWeights {
                        // Resolve prerequisite code through assignment map
                        resolvedPrereq := defAssigned[pcode]
                        if resolvedPrereq == "" {
                            resolvedPrereq = pcode
                        }
                        if prereqDef, ok := definitions[resolvedPrereq]; ok {
                            if w < 0.01 { w = 0.01 } else if w > 1.0 { w = 1.0 }
                            idWeights[prereqDef.ID] = w
                        }
                    }
                }
                // Update definition with prerequisites (and weights if provided)
                if err := definitionDAO.Update(definition, defNode.References, prerequisiteIDs, idWeights); err != nil {
                    return fmt.Errorf("failed to update definition %s with prerequisites: %v", assignedCode, err)
                }
            }
		}
	}

    // Backward compatibility: if no metaExercises present, group legacy exercises by code -> meta
    if len(data.MetaExercises) == 0 && len(data.Exercises) > 0 {
        grouped := make(map[string][]ImportExerciseNode)
        for _, ex := range data.Exercises { grouped[ex.Code] = append(grouped[ex.Code], ex) }
        data.MetaExercises = make(map[string]ImportMetaExerciseNode)
        for k, list := range grouped {
            if len(list) == 0 { continue }
            base := list[0]
            // Union prerequisites + weights
            pre := map[string]float64{}
            for _, e := range list {
                for _, p := range e.Prerequisites { if _, ok := pre[p]; !ok { pre[p] = 1.0 } }
                for p, w := range e.PrerequisiteWeights { pre[p] = w }
            }
            versions := make([]ImportExerciseVersion, 0, len(list))
            for _, e := range list {
                diff, _ := s.parseDifficulty(e.Difficulty)
                versions = append(versions, ImportExerciseVersion{ Statement: e.Statement, Description: e.Description, Hints: e.Hints, Verifiable: e.Verifiable, Result: e.Result, Difficulty: diff })
            }
            data.MetaExercises[k] = ImportMetaExerciseNode{ Code: base.Code, Name: base.Name, Prerequisites: keys(pre), PrerequisiteWeights: pre, XPosition: base.XPosition, YPosition: base.YPosition, Versions: versions }
        }
    }

    // Create meta-exercises and then attach prerequisites + versions
    metas := make(map[string]*models.MetaExercise) // map by assigned code
    for code, me := range data.MetaExercises {
        assignedCode := metaAssigned[code]
        meta := &models.MetaExercise{ Code: assignedCode, Name: me.Name, DomainID: domain.ID, OwnerID: ownerID, XPosition: me.XPosition, YPosition: me.YPosition }
        if err := tx.Create(meta).Error; err != nil { return fmt.Errorf("failed to create metaExercise %s: %v", assignedCode, err) }
        metas[assignedCode] = meta
        if assignedCode != code {
            log.Printf("Created meta-exercise: %s (ID: %d) [renamed from %s]", meta.Name, meta.ID, code)
        }
    }

    // Attach meta prerequisites (can reference definitions or other metas) after all metas exist
    for code, me := range data.MetaExercises {
        if len(me.Prerequisites) == 0 { continue }
        assignedCode := metaAssigned[code]
        for _, pcode := range me.Prerequisites {
            // Resolve prerequisite through assignment maps
            resolvedDefCode := defAssigned[pcode]
            resolvedMetaCode := metaAssigned[pcode]

            // Try to find in imported definitions first
            if resolvedDefCode != "" {
                if def, ok := definitions[resolvedDefCode]; ok {
                    w := clamp01(me.PrerequisiteWeights[pcode])
                    np := &models.NodePrerequisite{ NodeID: metas[assignedCode].ID, NodeType: "meta_exercise", PrerequisiteID: def.ID, PrerequisiteType: "definition", Weight: w, IsManual: true }
                    _ = tx.Create(np).Error
                    continue
                }
            }

            // Try to find in imported meta-exercises
            if resolvedMetaCode != "" {
                if meta, ok := metas[resolvedMetaCode]; ok {
                    w := clamp01(me.PrerequisiteWeights[pcode])
                    np := &models.NodePrerequisite{ NodeID: metas[assignedCode].ID, NodeType: "meta_exercise", PrerequisiteID: meta.ID, PrerequisiteType: "meta_exercise", Weight: w, IsManual: true }
                    _ = tx.Create(np).Error
                    continue
                }
            }

            log.Printf("Warning: Unknown prerequisite code %s for metaExercise %s", pcode, assignedCode)
        }
    }

    // Create versions for each meta
    for code, me := range data.MetaExercises {
        assignedCode := metaAssigned[code]
        meta := metas[assignedCode]
        for _, v := range me.Versions {
            vv := &models.Exercise{
                Code: assignedCode, Name: me.Name, Statement: v.Statement, Description: v.Description, Hints: v.Hints, Notes: v.Notes,
                DomainID: domain.ID, OwnerID: ownerID, MetaExerciseID: meta.ID, Verifiable: v.Verifiable, Result: v.Result, Difficulty: v.Difficulty,
                XPosition: me.XPosition, YPosition: me.YPosition,
            }
            if err := tx.Create(vv).Error; err != nil { return fmt.Errorf("failed to create version for %s: %v", assignedCode, err) }
        }
    }

    // Legacy path (if still any exercises remain in shape; unlikely after conversion above)
    for code, exNode := range data.Exercises {
        // Parse difficulty - now handles both string and number
        difficulty := 3 // Default medium difficulty
        if difficultyInt, err := s.parseDifficulty(exNode.Difficulty); err == nil {
            difficulty = difficultyInt
        }

		exercise := &models.Exercise{
			Code:        exNode.Code,
			Name:        exNode.Name,
			Statement:   exNode.Statement,
			Description: exNode.Description,
			Hints:       exNode.Hints,
			DomainID:    domain.ID,
			OwnerID:     ownerID,
			Verifiable:  exNode.Verifiable,
			Result:      exNode.Result,
			Difficulty:  difficulty,
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

        // Build weights map by ID if provided
        var idWeights map[uint]float64
        if len(exNode.PrerequisiteWeights) > 0 {
            idWeights = make(map[uint]float64, len(exNode.PrerequisiteWeights))
            for pcode, w := range exNode.PrerequisiteWeights {
                if prereqDef, ok := definitions[pcode]; ok {
                    if w < 0.01 { w = 0.01 } else if w > 1.0 { w = 1.0 }
                    idWeights[prereqDef.ID] = w
                }
            }
        }
        // Create exercise with prerequisites (and weights if provided)
        if err := exerciseDAO.Create(exercise, prerequisiteIDs, idWeights); err != nil {
            return fmt.Errorf("failed to create exercise %s: %v", code, err)
        }

        log.Printf("Created exercise: %s (ID: %d)", exercise.Name, exercise.ID)
    }

    return nil
}

// parseDifficulty converts interface{} difficulty to int with fallback
func (s *ImportService) parseDifficulty(difficulty interface{}) (int, error) {
	if difficulty == nil {
		return 3, nil // Default
	}

	switch v := difficulty.(type) {
	case string:
		return s.parseDifficultyString(v)
	case int:
		if v >= 1 && v <= 7 {
			return v, nil
		}
		return 0, fmt.Errorf("difficulty number out of range: %d", v)
	case float64:
		intVal := int(v)
		if intVal >= 1 && intVal <= 7 {
			return intVal, nil
		}
		return 0, fmt.Errorf("difficulty number out of range: %f", v)
	case json.Number:
		if intVal, err := v.Int64(); err == nil {
			if intVal >= 1 && intVal <= 7 {
				return int(intVal), nil
			}
		}
		return 0, fmt.Errorf("invalid difficulty number: %s", string(v))
	default:
		return 0, fmt.Errorf("invalid difficulty type: %T", v)
	}
}

func clamp01(w float64) float64 {
    if w < 0.01 { return 0.01 }
    if w > 1.0 { return 1.0 }
    return w
}

func keys(m map[string]float64) []string { res := make([]string, 0, len(m)); for k := range m { res = append(res, k) }; return res }

// parseDifficultyString converts string difficulty to int with fallback
func (s *ImportService) parseDifficultyString(difficulty string) (int, error) {
	switch strings.ToLower(difficulty) {
	case "1", "very easy", "beginner":
		return 1, nil
	case "2", "easy":
		return 2, nil
	case "3", "medium", "normal":
		return 3, nil
	case "4", "hard":
		return 4, nil
	case "5", "very hard":
		return 5, nil
	case "6", "expert":
		return 6, nil
	case "7", "master":
		return 7, nil
	default:
		// Try parsing as number
		if len(difficulty) == 1 && difficulty[0] >= '1' && difficulty[0] <= '7' {
			return int(difficulty[0] - '0'), nil
		}
		return 0, fmt.Errorf("invalid difficulty: %s", difficulty)
	}
}
