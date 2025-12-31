package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gorm.io/gorm"
	"myapp/server/dao"
	"myapp/server/models"
)

// ImportService handles domain import and export operations
type ImportService struct {
	db            *gorm.DB
	domainDAO     *dao.DomainDAO
	definitionDAO *dao.DefinitionDAO
	exerciseDAO   *dao.ExerciseDAO
	userDAO       *dao.UserDAO
}

type DuplicateStrategy string

const (
	DuplicateStrategyRename DuplicateStrategy = "rename"
	DuplicateStrategyUpdate DuplicateStrategy = "update"
)

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
	// Legacy content (kept optional): raw definition nodes and single-version exercises
	Definitions map[string]ImportDefinitionNode `json:"definitions,omitempty"`
	Exercises   map[string]ImportExerciseNode   `json:"exercises,omitempty"`
	// Pooled content
	MetaExercises   map[string]ImportMetaExerciseNode   `json:"metaExercises,omitempty"`
	MetaDefinitions map[string]ImportMetaDefinitionNode `json:"metaDefinitions,omitempty"`
	// Optional node groups
	Groups []ImportGroupData `json:"groups,omitempty"`
}

// ImportGroupNodeRef represents a node reference inside a group (code-based).
type ImportGroupNodeRef struct {
	NodeType string `json:"nodeType"`
	Code     string `json:"code"`
}

// ImportGroupData represents a node group in import/export format.
type ImportGroupData struct {
	Name      string               `json:"name"`
	IsExact   bool                 `json:"isExact"`
	XPosition float64              `json:"xPosition,omitempty"`
	YPosition float64              `json:"yPosition,omitempty"`
	Seeds     []ImportGroupNodeRef `json:"seeds"`
	Members   []ImportGroupNodeRef `json:"members,omitempty"`
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
	XPosition           float64            `json:"xPosition,omitempty"`
	YPosition           float64            `json:"yPosition,omitempty"`
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
	XPosition           float64            `json:"xPosition,omitempty"`
	YPosition           float64            `json:"yPosition,omitempty"`
}

// ImportExerciseVersion represents a single version in a meta-exercise
type ImportExerciseVersion struct {
	Statement            string `json:"statement"`
	Description          string `json:"description,omitempty"`
	Hints                string `json:"hints,omitempty"`
	Verifiable           bool   `json:"verifiable,omitempty"`
	Result               string `json:"result,omitempty"`
	Difficulty           int    `json:"difficulty,omitempty"`
	Notes                string `json:"notes,omitempty"`
	StatementImagePath   string `json:"statementImagePath,omitempty"`
	DescriptionImagePath string `json:"descriptionImagePath,omitempty"`
}

// ImportMetaExerciseNode represents a pool of versions sharing code/name
type ImportMetaExerciseNode struct {
	Code                string                  `json:"code"`
	Name                string                  `json:"name"`
	Prerequisites       []string                `json:"prerequisites,omitempty"`
	PrerequisiteWeights map[string]float64      `json:"prerequisiteWeights,omitempty"`
	XPosition           float64                 `json:"xPosition,omitempty"`
	YPosition           float64                 `json:"yPosition,omitempty"`
	Versions            []ImportExerciseVersion `json:"versions"`
}

// ImportMetaDefinitionVersion represents a single definition version in a meta-definition pool
type ImportMetaDefinitionVersion struct {
	Prompt               string   `json:"prompt"`
	Type                 string   `json:"type,omitempty"`
	Description          string   `json:"description,omitempty"`
	Notes                string   `json:"notes,omitempty"`
	References           []string `json:"references,omitempty"`
	PromptImagePath      string   `json:"promptImagePath,omitempty"`
	DescriptionImagePath string   `json:"descriptionImagePath,omitempty"`
}

// ImportMetaDefinitionNode represents a concept pool of definition versions
type ImportMetaDefinitionNode struct {
	Code                string                        `json:"code"`
	Name                string                        `json:"name"`
	Prerequisites       []string                      `json:"prerequisites,omitempty"`
	PrerequisiteWeights map[string]float64            `json:"prerequisiteWeights,omitempty"`
	XPosition           float64                       `json:"xPosition,omitempty"`
	YPosition           float64                       `json:"yPosition,omitempty"`
	Versions            []ImportMetaDefinitionVersion `json:"versions"`
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

func normalizeImportText(value string) string {
	return strings.TrimSpace(value)
}

func fallbackDefinitionPrompt(name string) string {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return "Define the concept"
	}
	return "Define " + clean
}

func fallbackExerciseStatement(name string) string {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return "No statement"
	}
	return "Solve: " + clean
}

func normalizeDescriptionArray(desc FlexibleStringArray) FlexibleStringArray {
	items := desc.ToStringSlice()
	cleaned := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	if len(cleaned) == 0 {
		cleaned = []string{"No description"}
	}
	return FlexibleStringArray(cleaned)
}

func normalizeOptionalText(value string) string {
	return strings.TrimSpace(value)
}

func normalizeImportName(name string, fallback string) string {
	clean := strings.TrimSpace(name)
	if clean != "" {
		return clean
	}
	cleanFallback := strings.TrimSpace(fallback)
	if cleanFallback != "" {
		return cleanFallback
	}
	return "Unnamed"
}

func normalizeImportCode(code string, key string) string {
	clean := strings.TrimSpace(code)
	if clean != "" {
		return clean
	}
	return strings.TrimSpace(key)
}

func ensureMetaDefinitionVersions(name string, versions []ImportMetaDefinitionVersion) []ImportMetaDefinitionVersion {
	if len(versions) == 0 {
		return []ImportMetaDefinitionVersion{
			{
				Prompt: fallbackDefinitionPrompt(name),
				Type:   "open_ended",
			},
		}
	}
	for i := range versions {
		versions[i].Prompt = normalizeImportText(versions[i].Prompt)
		if versions[i].Prompt == "" {
			versions[i].Prompt = fallbackDefinitionPrompt(name)
		}
		versions[i].Type = normalizeOptionalText(versions[i].Type)
		if versions[i].Type == "" {
			versions[i].Type = "open_ended"
		}
	}
	return versions
}

func ensureMetaExerciseVersions(name string, versions []ImportExerciseVersion) []ImportExerciseVersion {
	if len(versions) == 0 {
		return []ImportExerciseVersion{
			{
				Statement:  fallbackExerciseStatement(name),
				Difficulty: 3,
			},
		}
	}
	for i := range versions {
		versions[i].Statement = normalizeImportText(versions[i].Statement)
		if versions[i].Statement == "" {
			versions[i].Statement = fallbackExerciseStatement(name)
		}
		if versions[i].Difficulty < 1 || versions[i].Difficulty > 7 {
			versions[i].Difficulty = 3
		}
	}
	return versions
}

func (s *ImportService) NormalizeImportData(data *ImportData) {
	if data == nil {
		return
	}

	for key, md := range data.MetaDefinitions {
		md.Code = normalizeImportCode(md.Code, key)
		md.Name = normalizeImportName(md.Name, md.Code)
		md.Versions = ensureMetaDefinitionVersions(md.Name, md.Versions)
		data.MetaDefinitions[key] = md
	}

	for key, def := range data.Definitions {
		def.Code = normalizeImportCode(def.Code, key)
		def.Name = normalizeImportName(def.Name, def.Code)
		def.Description = normalizeDescriptionArray(def.Description)
		def.Notes = normalizeOptionalText(def.Notes)
		data.Definitions[key] = def
	}

	for key, me := range data.MetaExercises {
		me.Code = normalizeImportCode(me.Code, key)
		me.Name = normalizeImportName(me.Name, me.Code)
		me.Versions = ensureMetaExerciseVersions(me.Name, me.Versions)
		data.MetaExercises[key] = me
	}

	for key, ex := range data.Exercises {
		ex.Code = normalizeImportCode(ex.Code, key)
		ex.Name = normalizeImportName(ex.Name, ex.Code)
		ex.Statement = normalizeImportText(ex.Statement)
		if ex.Statement == "" {
			ex.Statement = fallbackExerciseStatement(ex.Name)
		}
		ex.Description = normalizeOptionalText(ex.Description)
		ex.Hints = normalizeOptionalText(ex.Hints)
		ex.Result = normalizeOptionalText(ex.Result)
		data.Exercises[key] = ex
	}
}

// CreateDomainWithImport creates a new domain and imports data into it
func (s *ImportService) CreateDomainWithImport(userID uint, name, privacy, description string, data *ImportData) (*models.Domain, error) {
	// Validate import data first
	s.NormalizeImportData(data)
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

		if createdDomain.DomainUID == nil || *createdDomain.DomainUID == "" {
			uid, err := GenerateDomainUID(userID, createdDomain.ID)
			if err != nil {
				return fmt.Errorf("failed to generate domain uid: %v", err)
			}
			createdDomain.DomainUID = &uid
			if err := domainDAO.Update(createdDomain); err != nil {
				return fmt.Errorf("failed to set domain uid: %v", err)
			}
		}

		// Assign to outer variable
		domain = createdDomain

		// Import data into the new domain
		if err := s.importDataToDomain(tx, domain, userID, data, DuplicateStrategyUpdate); err != nil {
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
func (s *ImportService) ImportToDomain(domainID uint, data *ImportData, strategy DuplicateStrategy) error {
	// Validate import data first
	s.NormalizeImportData(data)
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
		return s.importDataToDomain(tx, domain, domain.OwnerID, data, strategy)
	})
}

// ExportDomain exports a domain to ImportData format
func (s *ImportService) ExportDomain(domainID uint) (*ImportData, error) {
	// Get pools (meta_definitions & meta_exercises)
	var metaDefs []models.MetaDefinition
	if err := s.db.Where("domain_id = ?", domainID).Find(&metaDefs).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch meta definitions: %v", err)
	}
	var metas []models.MetaExercise
	if err := s.db.Where("domain_id = ?", domainID).Find(&metas).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch meta exercises: %v", err)
	}

	// Check domain exists
	if len(metaDefs) == 0 && len(metas) == 0 {
		var count int64
		s.db.Model(&models.Domain{}).Where("id = ?", domainID).Count(&count)
		if count == 0 {
			return nil, errors.New("domain not found")
		}
	}

	// Prepare export data
	exportData := &ImportData{
		MetaDefinitions: make(map[string]ImportMetaDefinitionNode),
		MetaExercises:   make(map[string]ImportMetaExerciseNode),
	}

	// Export meta-definitions (pools with versions)
	for _, md := range metaDefs {
		// Get concept prerequisites and weights (meta_definition -> meta_definition)
		prerequisiteCodes, err := s.getMetaDefinitionPrerequisiteCodes(md.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to get prerequisites for meta definition %s: %v", md.Code, err)
		}
		prereqWeights, err := s.getMetaDefinitionPrerequisiteWeights(md.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to get prerequisite weights for meta definition %s: %v", md.Code, err)
		}

		// Get definition versions under this pool
		var versions []models.Definition
		if err := s.db.Where("meta_definition_id = ?", md.ID).Order("id ASC").Find(&versions).Error; err != nil {
			return nil, fmt.Errorf("failed to fetch versions for %s: %v", md.Code, err)
		}
		vnodes := make([]ImportMetaDefinitionVersion, 0, len(versions))
		for _, v := range versions {
			// Load references
			var refs []models.Reference
			if err := s.db.Where("definition_id = ?", v.ID).Find(&refs).Error; err != nil {
				return nil, fmt.Errorf("failed to fetch references for definition %d: %v", v.ID, err)
			}
			refStrings := make([]string, 0, len(refs))
			for _, r := range refs {
				refStrings = append(refStrings, r.Reference)
			}

			prompt := normalizeImportText(v.Prompt)
			if prompt == "" {
				prompt = fallbackDefinitionPrompt(md.Name)
			}
			versionType := normalizeOptionalText(v.Type)
			if versionType == "" {
				versionType = "open_ended"
			}
			vnodes = append(vnodes, ImportMetaDefinitionVersion{
				Prompt:               prompt,
				Type:                 versionType,
				Description:          v.Description,
				Notes:                v.Notes,
				References:           refStrings,
				PromptImagePath:      v.PromptImagePath,
				DescriptionImagePath: v.DescriptionImagePath,
			})
		}
		if len(vnodes) == 0 {
			vnodes = append(vnodes, ImportMetaDefinitionVersion{
				Prompt: fallbackDefinitionPrompt(md.Name),
				Type:   "open_ended",
			})
		}
		exportData.MetaDefinitions[md.Code] = ImportMetaDefinitionNode{
			Code:                md.Code,
			Name:                md.Name,
			Prerequisites:       prerequisiteCodes,
			PrerequisiteWeights: prereqWeights,
			XPosition:           md.XPosition,
			YPosition:           md.YPosition,
			Versions:            vnodes,
		}
	}

	// Export meta-exercises (with all prerequisite types and weights)
	for _, me := range metas {
		prerequisiteCodes, prereqWeights, err := s.getMetaExerciseAllPrerequisites(me.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to get prerequisites for meta exercise %s: %v", me.Code, err)
		}
		var versions []models.Exercise
		if err := s.db.Where("meta_exercise_id = ?", me.ID).Order("id ASC").Find(&versions).Error; err != nil {
			return nil, fmt.Errorf("failed to fetch versions for %s: %v", me.Code, err)
		}
		vnodes := make([]ImportExerciseVersion, 0, len(versions))
		for _, v := range versions {
			statement := normalizeImportText(v.Statement)
			if statement == "" {
				statement = fallbackExerciseStatement(me.Name)
			}
			diff := v.Difficulty
			if diff < 1 || diff > 7 {
				diff = 3
			}
			vnodes = append(vnodes, ImportExerciseVersion{
				Statement:            statement,
				Description:          v.Description,
				Hints:                v.Hints,
				Verifiable:           v.Verifiable,
				Result:               v.Result,
				Difficulty:           diff,
				Notes:                v.Notes,
				StatementImagePath:   v.StatementImagePath,
				DescriptionImagePath: v.DescriptionImagePath,
			})
		}
		if len(vnodes) == 0 {
			vnodes = append(vnodes, ImportExerciseVersion{
				Statement:  fallbackExerciseStatement(me.Name),
				Difficulty: 3,
			})
		}
		exportData.MetaExercises[me.Code] = ImportMetaExerciseNode{
			Code:                me.Code,
			Name:                me.Name,
			Prerequisites:       prerequisiteCodes,
			PrerequisiteWeights: prereqWeights,
			XPosition:           me.XPosition,
			YPosition:           me.YPosition,
			Versions:            vnodes,
		}
	}

	// Export node groups (code-based)
	var groups []models.NodeGroup
	if err := s.db.Where("domain_id = ?", domainID).Find(&groups).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch groups: %v", err)
	}
	if len(groups) > 0 {
		groupIDs := make([]uint, 0, len(groups))
		for _, g := range groups {
			groupIDs = append(groupIDs, g.ID)
		}
		var seeds []models.NodeGroupSeed
		if err := s.db.Where("group_id IN ?", groupIDs).Find(&seeds).Error; err != nil {
			return nil, fmt.Errorf("failed to fetch group seeds: %v", err)
		}
		var members []models.NodeGroupMember
		if err := s.db.Where("group_id IN ?", groupIDs).Find(&members).Error; err != nil {
			return nil, fmt.Errorf("failed to fetch group members: %v", err)
		}

		metaDefCodes := make(map[uint]string, len(metaDefs))
		for _, md := range metaDefs {
			metaDefCodes[md.ID] = md.Code
		}
		metaExCodes := make(map[uint]string, len(metas))
		for _, me := range metas {
			metaExCodes[me.ID] = me.Code
		}

		seedsByGroup := make(map[uint][]ImportGroupNodeRef)
		for _, s := range seeds {
			ref := ImportGroupNodeRef{NodeType: s.NodeType}
			if s.NodeType == "meta_definition" {
				ref.Code = metaDefCodes[s.NodeID]
			} else if s.NodeType == "meta_exercise" {
				ref.Code = metaExCodes[s.NodeID]
			}
			if ref.Code != "" {
				seedsByGroup[s.GroupID] = append(seedsByGroup[s.GroupID], ref)
			}
		}
		membersByGroup := make(map[uint][]ImportGroupNodeRef)
		for _, m := range members {
			ref := ImportGroupNodeRef{NodeType: m.NodeType}
			if m.NodeType == "meta_definition" {
				ref.Code = metaDefCodes[m.NodeID]
			} else if m.NodeType == "meta_exercise" {
				ref.Code = metaExCodes[m.NodeID]
			}
			if ref.Code != "" {
				membersByGroup[m.GroupID] = append(membersByGroup[m.GroupID], ref)
			}
		}

		exportData.Groups = make([]ImportGroupData, 0, len(groups))
		for _, g := range groups {
			exportData.Groups = append(exportData.Groups, ImportGroupData{
				Name:      g.Name,
				IsExact:   g.IsExact,
				XPosition: g.XPosition,
				YPosition: g.YPosition,
				Seeds:     seedsByGroup[g.ID],
				Members:   membersByGroup[g.ID],
			})
		}
	}

	return exportData, nil
}

// ReadImportFileFromPath reads and parses an import file from a file path
func (s *ImportService) ReadImportFileFromPath(filePath string) (*ImportData, error) {
	// Try multiple possible locations for the file
	possiblePaths := []string{
		filePath,                          // Exact path provided
		filepath.Join("data", filePath),   // data subdirectory
		filepath.Join("..", filePath),     // Parent directory
		filepath.Join("server", filePath), // server subdirectory
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

	// Validate meta-definitions (preferred path)
	for code, md := range data.MetaDefinitions {
		if strings.TrimSpace(md.Code) == "" {
			return fmt.Errorf("metaDefinition %s has empty code", code)
		}
		if strings.TrimSpace(md.Name) == "" {
			return fmt.Errorf("metaDefinition %s has empty name", code)
		}
		if len(md.Versions) == 0 {
			return fmt.Errorf("metaDefinition %s has no versions", code)
		}
		for idx, v := range md.Versions {
			if strings.TrimSpace(v.Prompt) == "" {
				return fmt.Errorf("metaDefinition %s version %d has empty prompt", code, idx)
			}
		}
		if allCodes[md.Code] {
			return fmt.Errorf("duplicate code found: %s", md.Code)
		}
		allCodes[md.Code] = true
	}

	// Validate definitions (legacy, optional)
	for code, def := range data.Definitions {
		if strings.TrimSpace(def.Code) == "" {
			return fmt.Errorf("definition %s has empty code", code)
		}
		if strings.TrimSpace(def.Name) == "" {
			return fmt.Errorf("definition %s has empty name", code)
		}
		descItems := def.Description.ToStringSlice()
		hasDescription := false
		for _, item := range descItems {
			if strings.TrimSpace(item) != "" {
				hasDescription = true
				break
			}
		}
		if !hasDescription {
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
			if strings.TrimSpace(me.Code) == "" {
				return fmt.Errorf("metaExercise %s has empty code", code)
			}
			if strings.TrimSpace(me.Name) == "" {
				return fmt.Errorf("metaExercise %s has empty name", code)
			}
			if len(me.Versions) == 0 {
				return fmt.Errorf("metaExercise %s has no versions", code)
			}
			for idx, v := range me.Versions {
				if strings.TrimSpace(v.Statement) == "" {
					return fmt.Errorf("metaExercise %s version %d has empty statement", code, idx)
				}
			}
			if allCodes[me.Code] {
				return fmt.Errorf("duplicate code found: %s", me.Code)
			}
			allCodes[me.Code] = true
		}
	} else {
		for code, ex := range data.Exercises {
			if strings.TrimSpace(ex.Code) == "" {
				return fmt.Errorf("exercise %s has empty code", code)
			}
			if strings.TrimSpace(ex.Name) == "" {
				return fmt.Errorf("exercise %s has empty name", code)
			}
			if strings.TrimSpace(ex.Statement) == "" {
				return fmt.Errorf("exercise %s has empty statement", code)
			}
			if allCodes[ex.Code] {
				return fmt.Errorf("duplicate code found: %s", ex.Code)
			}
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

	// Validate groups (optional)
	for _, group := range data.Groups {
		if strings.TrimSpace(group.Name) == "" {
			return fmt.Errorf("group has empty name")
		}
		if len(group.Seeds) == 0 {
			return fmt.Errorf("group %s has no seeds", group.Name)
		}
		for _, seed := range group.Seeds {
			if seed.NodeType != "meta_definition" && seed.NodeType != "meta_exercise" {
				return fmt.Errorf("group %s has invalid nodeType %s", group.Name, seed.NodeType)
			}
			if seed.Code == "" || !allCodes[seed.Code] {
				return fmt.Errorf("group %s references unknown code %s", group.Name, seed.Code)
			}
		}
		for _, member := range group.Members {
			if member.NodeType != "meta_definition" && member.NodeType != "meta_exercise" {
				return fmt.Errorf("group %s has invalid nodeType %s", group.Name, member.NodeType)
			}
			if member.Code == "" || !allCodes[member.Code] {
				return fmt.Errorf("group %s references unknown code %s", group.Name, member.Code)
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

// loadExistingCodes loads all existing codes from a domain (meta-definitions + meta-exercises)
func (s *ImportService) loadExistingCodes(domainID uint) (map[string]bool, error) {
	codesInUse := make(map[string]bool)

	// Load meta-definition codes
	var metaDefinitions []models.MetaDefinition
	if err := s.db.Select("code").Where("domain_id = ?", domainID).Find(&metaDefinitions).Error; err != nil {
		return nil, err
	}
	for _, def := range metaDefinitions {
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

func (s *ImportService) loadExistingMetaMaps(domainID uint) (map[string]*models.MetaDefinition, map[string]*models.MetaExercise, error) {
	metaDefs := make(map[string]*models.MetaDefinition)
	metaExs := make(map[string]*models.MetaExercise)

	var defs []models.MetaDefinition
	if err := s.db.Where("domain_id = ?", domainID).Find(&defs).Error; err != nil {
		return nil, nil, err
	}
	for i := range defs {
		metaDefs[defs[i].Code] = &defs[i]
	}

	var exs []models.MetaExercise
	if err := s.db.Where("domain_id = ?", domainID).Find(&exs).Error; err != nil {
		return nil, nil, err
	}
	for i := range exs {
		metaExs[exs[i].Code] = &exs[i]
	}

	return metaDefs, metaExs, nil
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

func normalizeDuplicateStrategy(strategy DuplicateStrategy) DuplicateStrategy {
	switch strategy {
	case DuplicateStrategyRename, DuplicateStrategyUpdate:
		return strategy
	default:
		return DuplicateStrategyUpdate
	}
}

// Helper function to get prerequisite codes for a node (legacy - definitions only)
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

// getPrerequisiteWeights returns a map[code]weight for a node's prerequisites (legacy - definitions only)
func (s *ImportService) getPrerequisiteWeights(nodeID uint, nodeType string) (map[string]float64, error) {
	query := `
        SELECT d.code, np.weight
        FROM node_prerequisites np
        JOIN definitions d ON np.prerequisite_id = d.id
        WHERE np.node_id = ? AND np.node_type = ? AND np.prerequisite_type = 'definition'
        ORDER BY d.code
    `
	type row struct {
		Code   string
		Weight float64
	}
	var rows []row
	if err := s.db.Raw(query, nodeID, nodeType).Scan(&rows).Error; err != nil {
		return nil, err
	}
	res := make(map[string]float64, len(rows))
	for _, r := range rows {
		res[r.Code] = r.Weight
	}
	return res, nil
}

// getMetaDefinitionPrerequisiteCodes returns concept prerequisite codes for a meta_definition
func (s *ImportService) getMetaDefinitionPrerequisiteCodes(nodeID uint) ([]string, error) {
	query := `
		SELECT md.code
		FROM node_prerequisites np
		JOIN meta_definitions md ON np.prerequisite_id = md.id
		WHERE np.node_id = ? AND np.node_type = 'meta_definition' AND np.prerequisite_type = 'meta_definition'
		ORDER BY md.code
	`
	var codes []string
	if err := s.db.Raw(query, nodeID).Scan(&codes).Error; err != nil {
		return nil, err
	}
	return codes, nil
}

// getMetaDefinitionPrerequisiteWeights returns concept prerequisite weights for a meta_definition
func (s *ImportService) getMetaDefinitionPrerequisiteWeights(nodeID uint) (map[string]float64, error) {
	query := `
        SELECT md.code, np.weight
        FROM node_prerequisites np
        JOIN meta_definitions md ON np.prerequisite_id = md.id
        WHERE np.node_id = ? AND np.node_type = 'meta_definition' AND np.prerequisite_type = 'meta_definition'
        ORDER BY md.code
    `
	type row struct {
		Code   string
		Weight float64
	}
	var rows []row
	if err := s.db.Raw(query, nodeID).Scan(&rows).Error; err != nil {
		return nil, err
	}
	res := make(map[string]float64, len(rows))
	for _, r := range rows {
		res[r.Code] = r.Weight
	}
	return res, nil
}

// getMetaExerciseAllPrerequisites returns all prerequisite codes and weights for a meta_exercise
// (includes meta_definition, meta_exercise, and legacy definition types)
func (s *ImportService) getMetaExerciseAllPrerequisites(nodeID uint) ([]string, map[string]float64, error) {
	type row struct {
		Code   string
		Weight float64
	}

	// Get meta_definition prerequisites
	query1 := `
        SELECT md.code, np.weight
        FROM node_prerequisites np
        JOIN meta_definitions md ON np.prerequisite_id = md.id
        WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'meta_definition'
    `
	var mdRows []row
	if err := s.db.Raw(query1, nodeID).Scan(&mdRows).Error; err != nil {
		return nil, nil, err
	}

	// Get meta_exercise prerequisites
	query2 := `
        SELECT me.code, np.weight
        FROM node_prerequisites np
        JOIN meta_exercises me ON np.prerequisite_id = me.id
        WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'meta_exercise'
    `
	var meRows []row
	if err := s.db.Raw(query2, nodeID).Scan(&meRows).Error; err != nil {
		return nil, nil, err
	}

	// Get legacy definition prerequisites (for backward compatibility)
	query3 := `
        SELECT d.code, np.weight
        FROM node_prerequisites np
        JOIN definitions d ON np.prerequisite_id = d.id
        WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'definition'
    `
	var defRows []row
	if err := s.db.Raw(query3, nodeID).Scan(&defRows).Error; err != nil {
		return nil, nil, err
	}

	codes := make([]string, 0, len(mdRows)+len(meRows)+len(defRows))
	weights := make(map[string]float64, len(mdRows)+len(meRows)+len(defRows))
	seen := make(map[string]bool, len(mdRows)+len(meRows)+len(defRows))

	for _, r := range mdRows {
		if r.Code == "" || seen[r.Code] {
			continue
		}
		seen[r.Code] = true
		codes = append(codes, r.Code)
		weights[r.Code] = r.Weight
	}
	for _, r := range meRows {
		if r.Code == "" || seen[r.Code] {
			continue
		}
		seen[r.Code] = true
		codes = append(codes, r.Code)
		weights[r.Code] = r.Weight
	}
	for _, r := range defRows {
		if r.Code == "" || seen[r.Code] {
			continue
		}
		seen[r.Code] = true
		codes = append(codes, r.Code)
		weights[r.Code] = r.Weight
	}

	return codes, weights, nil
}

// importDataToDomain handles the core import logic for definitions and exercises
func (s *ImportService) importDataToDomain(tx *gorm.DB, domain *models.Domain, ownerID uint, data *ImportData, strategy DuplicateStrategy) error {
	strategy = normalizeDuplicateStrategy(strategy)
	// Load existing codes in the target domain
	codesInUse, err := s.loadExistingCodes(domain.ID)
	if err != nil {
		return fmt.Errorf("failed to load existing codes: %v", err)
	}
	existingMetaDefs, existingMetaExs, err := s.loadExistingMetaMaps(domain.ID)
	if err != nil {
		return fmt.Errorf("failed to load existing nodes: %v", err)
	}

	// Build code assignment maps for collision-safe renaming
	defAssigned := make(map[string]string)  // original -> assigned
	metaAssigned := make(map[string]string) // original -> assigned

	// Convert legacy definitions to metaDefinitions so graph nodes are always created.
	if len(data.MetaDefinitions) == 0 && len(data.Definitions) > 0 {
		data.MetaDefinitions = make(map[string]ImportMetaDefinitionNode)
		for key, def := range data.Definitions {
			name := normalizeImportName(def.Name, def.Code)
			descItems := def.Description.ToStringSlice()
			cleaned := make([]string, 0, len(descItems))
			for _, item := range descItems {
				trimmed := strings.TrimSpace(item)
				if trimmed != "" {
					cleaned = append(cleaned, trimmed)
				}
			}
			if len(cleaned) == 0 {
				cleaned = []string{"No description"}
			}
			data.MetaDefinitions[key] = ImportMetaDefinitionNode{
				Code:                def.Code,
				Name:                name,
				Prerequisites:       def.Prerequisites,
				PrerequisiteWeights: def.PrerequisiteWeights,
				XPosition:           def.XPosition,
				YPosition:           def.YPosition,
				Versions: []ImportMetaDefinitionVersion{
					{
						Prompt:      fallbackDefinitionPrompt(name),
						Type:        "open_ended",
						Description: strings.Join(cleaned, "|||"),
						Notes:       def.Notes,
						References:  def.References,
					},
				},
			}
		}
		data.Definitions = nil
	}

	// IMPORTANT: Convert legacy exercises to metaExercises BEFORE assigning meta codes
	// so that metaAssigned gets populated for the generated meta entries.
	if len(data.MetaExercises) == 0 && len(data.Exercises) > 0 {
		grouped := make(map[string][]ImportExerciseNode)
		for _, ex := range data.Exercises {
			grouped[ex.Code] = append(grouped[ex.Code], ex)
		}
		data.MetaExercises = make(map[string]ImportMetaExerciseNode)
		for k, list := range grouped {
			if len(list) == 0 {
				continue
			}
			base := list[0]
			// Union prerequisites + weights (dedup by code)
			pre := map[string]float64{}
			for _, e := range list {
				for _, p := range e.Prerequisites {
					if _, ok := pre[p]; !ok {
						pre[p] = 1.0
					}
				}
				for p, w := range e.PrerequisiteWeights {
					pre[p] = w
				}
			}
			versions := make([]ImportExerciseVersion, 0, len(list))
			for _, e := range list {
				diff, _ := s.parseDifficulty(e.Difficulty)
				versions = append(versions, ImportExerciseVersion{
					Statement:   e.Statement,
					Description: e.Description,
					Hints:       e.Hints,
					Verifiable:  e.Verifiable,
					Result:      e.Result,
					Difficulty:  diff,
				})
			}
			data.MetaExercises[k] = ImportMetaExerciseNode{
				Code:                base.Code,
				Name:                base.Name,
				Prerequisites:       keys(pre),
				PrerequisiteWeights: pre,
				XPosition:           base.XPosition,
				YPosition:           base.YPosition,
				Versions:            versions,
			}
		}
	}

	// Assign unique codes for meta-definitions (preferred)
	metaDefAssigned := map[string]string{}
	for code, md := range data.MetaDefinitions {
		baseCode := md.Code
		if baseCode == "" {
			baseCode = code
		}
		assigned := baseCode
		if !(strategy == DuplicateStrategyUpdate && existingMetaDefs[baseCode] != nil) {
			assigned = uniqueCodeFor(baseCode, codesInUse)
		}
		metaDefAssigned[code] = assigned
		codesInUse[assigned] = true
	}

	// Assign unique codes for definitions (legacy path)
	for code, defNode := range data.Definitions {
		baseCode := defNode.Code
		if baseCode == "" {
			baseCode = code
		}
		assignedCode := uniqueCodeFor(baseCode, codesInUse)
		defAssigned[code] = assignedCode
		codesInUse[assignedCode] = true
	}

	// Assign unique codes for meta-exercises (after legacy conversion above)
	for code, me := range data.MetaExercises {
		baseCode := me.Code
		if baseCode == "" {
			baseCode = code
		}
		assignedCode := baseCode
		if !(strategy == DuplicateStrategyUpdate && existingMetaExs[baseCode] != nil) {
			assignedCode = uniqueCodeFor(baseCode, codesInUse)
		}
		metaAssigned[code] = assignedCode
		codesInUse[assignedCode] = true
	}

	// Create DAOs for the transaction
	exerciseDAO := dao.NewExerciseDAO(tx)
	metaDefDAO := dao.NewMetaDefinitionDAO(tx)
	metaExDAO := dao.NewMetaExerciseDAO(tx)

	// Create meta-definitions first (with no prerequisites)
	metaDefs := make(map[string]*models.MetaDefinition)
	for code, node := range data.MetaDefinitions {
		baseCode := node.Code
		if baseCode == "" {
			baseCode = code
		}
		assigned := metaDefAssigned[code]
		if strategy == DuplicateStrategyUpdate {
			if existing, ok := existingMetaDefs[assigned]; ok {
				existing.Name = node.Name
				existing.XPosition = node.XPosition
				existing.YPosition = node.YPosition
				if err := tx.Save(existing).Error; err != nil {
					return fmt.Errorf("failed to update metaDefinition %s: %v", assigned, err)
				}
				metaDefs[assigned] = existing
				if assigned != baseCode {
					log.Printf("Updated meta-definition: %s (ID: %d) [renamed from %s]", existing.Name, existing.ID, code)
				}
				continue
			}
		}

		md := &models.MetaDefinition{
			Code:      assigned,
			Name:      node.Name,
			DomainID:  domain.ID,
			OwnerID:   ownerID,
			XPosition: node.XPosition,
			YPosition: node.YPosition,
		}
		if err := tx.Create(md).Error; err != nil {
			return fmt.Errorf("failed to create metaDefinition %s: %v", assigned, err)
		}
		metaDefs[assigned] = md
		if assigned != baseCode {
			log.Printf("Created meta-definition: %s (ID: %d) [renamed from %s]", md.Name, md.ID, code)
		}
	}

	// Create versions for each meta-definition
	// Build a map for first definition version per meta-definition to help exercise prerequisite resolution later
	firstDefByCode := map[string]*models.Definition{}
	for code, node := range data.MetaDefinitions {
		assigned := metaDefAssigned[code]
		md := metaDefs[assigned]
		if strategy == DuplicateStrategyUpdate {
			if _, ok := existingMetaDefs[assigned]; ok {
				var versionIDs []uint
				if err := tx.Model(&models.Definition{}).
					Where("meta_definition_id = ?", md.ID).
					Pluck("id", &versionIDs).Error; err != nil {
					return fmt.Errorf("failed to load existing versions for %s: %v", assigned, err)
				}
				if len(versionIDs) > 0 {
					if err := tx.Where("definition_id IN ?", versionIDs).
						Delete(&models.Reference{}).Error; err != nil {
						return fmt.Errorf("failed to clear references for %s: %v", assigned, err)
					}
				}
				if err := tx.Where("meta_definition_id = ?", md.ID).
					Delete(&models.Definition{}).Error; err != nil {
					return fmt.Errorf("failed to clear versions for %s: %v", assigned, err)
				}
			}
		}
		for idx, v := range node.Versions {
			def, err := metaDefDAO.AddVersion(md.ID, &models.DefinitionVersionRequest{
				Prompt:               v.Prompt,
				Type:                 v.Type,
				Description:          v.Description,
				Notes:                v.Notes,
				References:           v.References,
				PromptImagePath:      v.PromptImagePath,
				DescriptionImagePath: v.DescriptionImagePath,
			})
			if err != nil {
				return fmt.Errorf("failed to create version for %s: %v", assigned, err)
			}
			if idx == 0 {
				firstDefByCode[assigned] = def
			}
		}
	}

	// Attach concept prerequisites (meta_definition → meta_definition)
	for code, node := range data.MetaDefinitions {
		assigned := metaDefAssigned[code]
		md := metaDefs[assigned]
		var ids []uint
		weights := map[uint]float64{}
		for _, pcode := range node.Prerequisites {
			// Resolve through assigned mapping (prefer imported metaDefinitions)
			resolved := metaDefAssigned[pcode]
			if resolved == "" {
				resolved = pcode
			}
			if target, ok := metaDefs[resolved]; ok {
				ids = append(ids, target.ID)
				if w, ok2 := node.PrerequisiteWeights[pcode]; ok2 {
					if w < 0.01 {
						w = 0.01
					} else if w > 1.0 {
						w = 1.0
					}
					weights[target.ID] = w
				}
			} else {
				log.Printf("Warning: Unknown prerequisite code %s for metaDefinition %s", pcode, assigned)
			}
		}
		if len(ids) > 0 || strategy == DuplicateStrategyUpdate {
			if err := metaDefDAO.Update(md, ids, weights); err != nil {
				return fmt.Errorf("failed to attach prerequisites for %s: %v", assigned, err)
			}
		}
	}

	// (legacy conversion moved earlier)

	// Create meta-exercises and then attach prerequisites + versions
	metas := make(map[string]*models.MetaExercise) // map by assigned code
	for code, me := range data.MetaExercises {
		baseCode := me.Code
		if baseCode == "" {
			baseCode = code
		}
		assignedCode := metaAssigned[code]
		if strategy == DuplicateStrategyUpdate {
			if existing, ok := existingMetaExs[assignedCode]; ok {
				existing.Name = me.Name
				existing.XPosition = me.XPosition
				existing.YPosition = me.YPosition
				if err := tx.Save(existing).Error; err != nil {
					return fmt.Errorf("failed to update metaExercise %s: %v", assignedCode, err)
				}
				metas[assignedCode] = existing
				if assignedCode != baseCode {
					log.Printf("Updated meta-exercise: %s (ID: %d) [renamed from %s]", existing.Name, existing.ID, code)
				}
				continue
			}
		}

		meta := &models.MetaExercise{Code: assignedCode, Name: me.Name, DomainID: domain.ID, OwnerID: ownerID, XPosition: me.XPosition, YPosition: me.YPosition}
		if err := tx.Create(meta).Error; err != nil {
			return fmt.Errorf("failed to create metaExercise %s: %v", assignedCode, err)
		}
		metas[assignedCode] = meta
		if assignedCode != baseCode {
			log.Printf("Created meta-exercise: %s (ID: %d) [renamed from %s]", meta.Name, meta.ID, code)
		}
	}

	// Attach meta prerequisites (can reference definitions or other metas) after all metas exist
	for code, me := range data.MetaExercises {
		assignedCode := metaAssigned[code]
		meta := metas[assignedCode]
		if strategy == DuplicateStrategyUpdate {
			if _, ok := existingMetaExs[assignedCode]; ok {
				if err := tx.Where("node_id = ? AND node_type = ?", meta.ID, "meta_exercise").
					Delete(&models.NodePrerequisite{}).Error; err != nil {
					return fmt.Errorf("failed to clear prerequisites for %s: %v", assignedCode, err)
				}
			}
		}
		if len(me.Prerequisites) == 0 {
			continue
		}
		// Deduplicate in case input contains duplicates
		seen := map[string]struct{}{}
		for _, pcode := range me.Prerequisites {
			if _, ok := seen[pcode]; ok {
				continue
			}
			seen[pcode] = struct{}{}

			// Resolve prerequisite through assignment maps
			// Priority: meta_definition (concepts) > meta_exercise > legacy definitions
			resolvedMetaDefCode := metaDefAssigned[pcode]
			if resolvedMetaDefCode == "" {
				resolvedMetaDefCode = pcode
			}
			resolvedMetaExCode := metaAssigned[pcode]

			// 1. Try to find in imported meta-definitions (concepts) - preferred for graph
			if metaDef, ok := metaDefs[resolvedMetaDefCode]; ok {
				w := clamp01(me.PrerequisiteWeights[pcode])
				var count int64
				if err := tx.Model(&models.NodePrerequisite{}).
					Where("node_id = ? AND node_type = ? AND prerequisite_id = ? AND prerequisite_type = ?",
						metas[assignedCode].ID, "meta_exercise", metaDef.ID, "meta_definition").
					Count(&count).Error; err != nil {
					return fmt.Errorf("failed to check existing prerequisite: %v", err)
				}
				if count == 0 {
					if err := tx.Create(&models.NodePrerequisite{
						NodeID:           metas[assignedCode].ID,
						NodeType:         "meta_exercise",
						PrerequisiteID:   metaDef.ID,
						PrerequisiteType: "meta_definition",
						Weight:           w,
						IsManual:         true,
					}).Error; err != nil {
						return fmt.Errorf("failed to attach meta_definition prerequisite %s to %s: %v", pcode, assignedCode, err)
					}
				}
				continue
			}

			// 2. Try to find in imported meta-exercises
			if metaEx, ok := metas[resolvedMetaExCode]; ok {
				w := clamp01(me.PrerequisiteWeights[pcode])
				var count int64
				if err := tx.Model(&models.NodePrerequisite{}).
					Where("node_id = ? AND node_type = ? AND prerequisite_id = ? AND prerequisite_type = ?",
						metas[assignedCode].ID, "meta_exercise", metaEx.ID, "meta_exercise").
					Count(&count).Error; err != nil {
					return fmt.Errorf("failed to check existing prerequisite: %v", err)
				}
				if count == 0 {
					if err := tx.Create(&models.NodePrerequisite{
						NodeID:           metas[assignedCode].ID,
						NodeType:         "meta_exercise",
						PrerequisiteID:   metaEx.ID,
						PrerequisiteType: "meta_exercise",
						Weight:           w,
						IsManual:         true,
					}).Error; err != nil {
						return fmt.Errorf("failed to attach meta_exercise prerequisite %s to %s: %v", pcode, assignedCode, err)
					}
				}
				continue
			}

			// 3. No legacy fallback: do not create meta_exercise → definition links in dev meta graph
			// If code does not resolve to meta_definition or meta_exercise, skip with warning.

			log.Printf("Warning: Unknown prerequisite code %s for metaExercise %s", pcode, assignedCode)
		}
	}

	// Create versions for each meta
	for code, me := range data.MetaExercises {
		assignedCode := metaAssigned[code]
		meta := metas[assignedCode]
		if strategy == DuplicateStrategyUpdate {
			if _, ok := existingMetaExs[assignedCode]; ok {
				if err := tx.Where("meta_exercise_id = ?", meta.ID).
					Delete(&models.Exercise{}).Error; err != nil {
					return fmt.Errorf("failed to clear versions for %s: %v", assignedCode, err)
				}
			}
		}
		for _, v := range me.Versions {
			_, err := metaExDAO.AddVersion(meta.ID, &models.ExerciseVersionRequest{
				Statement:            v.Statement,
				Description:          v.Description,
				Hints:                v.Hints,
				Verifiable:           v.Verifiable,
				Result:               v.Result,
				Difficulty:           v.Difficulty,
				Notes:                v.Notes,
				StatementImagePath:   v.StatementImagePath,
				DescriptionImagePath: v.DescriptionImagePath,
			})
			if err != nil {
				return fmt.Errorf("failed to create version for %s: %v", assignedCode, err)
			}
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
			if prereqDef, exists := firstDefByCode[prereqCode]; exists {
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
				if prereqDef, ok := firstDefByCode[pcode]; ok {
					if w < 0.01 {
						w = 0.01
					} else if w > 1.0 {
						w = 1.0
					}
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

	// Import node groups (code-based)
	buildGroupKey := func(nodeType string, nodeID uint) string {
		return nodeType + ":" + strconv.Itoa(int(nodeID))
	}
	resolveGroupRefs := func(refs []ImportGroupNodeRef) map[string]models.NodeGroupSeed {
		resolved := make(map[string]models.NodeGroupSeed)
		for _, ref := range refs {
			switch ref.NodeType {
			case "meta_definition":
				code := metaDefAssigned[ref.Code]
				if code == "" {
					code = ref.Code
				}
				if md, ok := metaDefs[code]; ok {
					key := buildGroupKey("meta_definition", md.ID)
					resolved[key] = models.NodeGroupSeed{NodeID: md.ID, NodeType: "meta_definition"}
				}
			case "meta_exercise":
				code := metaAssigned[ref.Code]
				if code == "" {
					code = ref.Code
				}
				if me, ok := metas[code]; ok {
					key := buildGroupKey("meta_exercise", me.ID)
					resolved[key] = models.NodeGroupSeed{NodeID: me.ID, NodeType: "meta_exercise"}
				}
			}
		}
		return resolved
	}
	toSeedSlice := func(groupID uint, seedSet map[string]models.NodeGroupSeed) []models.NodeGroupSeed {
		out := make([]models.NodeGroupSeed, 0, len(seedSet))
		for _, seed := range seedSet {
			seed.GroupID = groupID
			out = append(out, seed)
		}
		return out
	}
	toMemberSlice := func(groupID uint, seedSet map[string]models.NodeGroupSeed) []models.NodeGroupMember {
		out := make([]models.NodeGroupMember, 0, len(seedSet))
		for _, seed := range seedSet {
			out = append(out, models.NodeGroupMember{
				GroupID:  groupID,
				NodeID:   seed.NodeID,
				NodeType: seed.NodeType,
			})
		}
		return out
	}

	existingGroups := []models.NodeGroup{}
	if err := tx.Where("domain_id = ?", domain.ID).Find(&existingGroups).Error; err != nil {
		return fmt.Errorf("failed to load existing groups: %v", err)
	}
	groupsByName := make(map[string]*models.NodeGroup, len(existingGroups))
	for i := range existingGroups {
		group := &existingGroups[i]
		groupKey := strings.TrimSpace(group.Name)
		if groupKey == "" {
			continue
		}
		if _, exists := groupsByName[groupKey]; !exists {
			groupsByName[groupKey] = group
		}
	}

	for _, group := range data.Groups {
		name := strings.TrimSpace(group.Name)
		if name == "" || len(group.Seeds) == 0 {
			continue
		}

		incomingSeeds := resolveGroupRefs(group.Seeds)
		if len(incomingSeeds) == 0 {
			continue
		}
		incomingMembers := resolveGroupRefs(group.Members)

		if existing, exists := groupsByName[name]; exists {
			existing.IsExact = group.IsExact
			existing.XPosition = group.XPosition
			existing.YPosition = group.YPosition
			if err := tx.Save(existing).Error; err != nil {
				return fmt.Errorf("failed to update group %s: %v", name, err)
			}
			if err := tx.Where("group_id = ?", existing.ID).Delete(&models.NodeGroupSeed{}).Error; err != nil {
				return fmt.Errorf("failed to update group seeds for %s: %v", name, err)
			}
			if err := tx.Where("group_id = ?", existing.ID).Delete(&models.NodeGroupMember{}).Error; err != nil {
				return fmt.Errorf("failed to update group members for %s: %v", name, err)
			}

			seeds := toSeedSlice(existing.ID, incomingSeeds)
			if len(seeds) > 0 {
				if err := tx.Create(&seeds).Error; err != nil {
					return fmt.Errorf("failed to update group seeds for %s: %v", name, err)
				}
			}

			if existing.IsExact {
				if len(incomingMembers) == 0 {
					incomingMembers = incomingSeeds
				}
				members := toMemberSlice(existing.ID, incomingMembers)
				if len(members) > 0 {
					if err := tx.Create(&members).Error; err != nil {
						return fmt.Errorf("failed to update group members for %s: %v", name, err)
					}
				}
			}
			continue
		}

		groupModel := models.NodeGroup{
			DomainID:  domain.ID,
			Name:      name,
			IsExact:   group.IsExact,
			XPosition: group.XPosition,
			YPosition: group.YPosition,
			CreatedBy: ownerID,
		}
		if err := tx.Create(&groupModel).Error; err != nil {
			return fmt.Errorf("failed to create group %s: %v", name, err)
		}
		groupsByName[name] = &groupModel

		seeds := toSeedSlice(groupModel.ID, incomingSeeds)
		if len(seeds) == 0 {
			_ = tx.Delete(&groupModel).Error
			continue
		}
		if err := tx.Create(&seeds).Error; err != nil {
			return fmt.Errorf("failed to create group seeds for %s: %v", name, err)
		}
		if group.IsExact {
			if len(incomingMembers) == 0 {
				incomingMembers = incomingSeeds
			}
			members := toMemberSlice(groupModel.ID, incomingMembers)
			if len(members) > 0 {
				if err := tx.Create(&members).Error; err != nil {
					return fmt.Errorf("failed to create group members for %s: %v", name, err)
				}
			}
		}
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
	if w < 0.01 {
		return 0.01
	}
	if w > 1.0 {
		return 1.0
	}
	return w
}

func keys(m map[string]float64) []string {
	res := make([]string, 0, len(m))
	for k := range m {
		res = append(res, k)
	}
	return res
}

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
