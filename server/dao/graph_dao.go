// dao/graph_dao.go - Updated version with code-based export keys

package dao

import (
	"errors"
	"fmt"
	"myapp/server/models"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// GraphDAO handles operations related to the knowledge graph
type GraphDAO struct {
	db *gorm.DB
}

func fallbackGraphDefinitionDescription(value string) string {
	clean := strings.TrimSpace(value)
	if clean == "" {
		return "No description"
	}
	return clean
}

func fallbackGraphExerciseStatement(name string) string {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return "No statement"
	}
	return "Solve: " + clean
}

// NewGraphDAO creates a new GraphDAO instance
func NewGraphDAO(db *gorm.DB) *GraphDAO {
	return &GraphDAO{db: db}
}

// GraphData represents the full structure of a knowledge graph
type GraphData struct {
	Definitions map[string]DefinitionNode `json:"definitions"`
	Exercises   map[string]ExerciseNode   `json:"exercises"`
	Groups      []GroupData               `json:"groups,omitempty"`
}

// DefinitionNode represents a definition in the graph export/import format
type DefinitionNode struct {
	Code                string             `json:"code"`
	Name                string             `json:"name"`
	Description         string             `json:"description"`
	Notes               string             `json:"notes,omitempty"`
	References          []string           `json:"references,omitempty"`
	Prerequisites       []string           `json:"prerequisites,omitempty"`
	PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
	XPosition           float64            `json:"xPosition,omitempty"`
	YPosition           float64            `json:"yPosition,omitempty"`
}

// ExerciseNode represents an exercise in the graph export/import format
type ExerciseNode struct {
	Code                string             `json:"code"`
	Name                string             `json:"name"`
	Statement           string             `json:"statement"`
	Description         string             `json:"description,omitempty"`
	Hints               string             `json:"hints,omitempty"`
	Verifiable          bool               `json:"verifiable,omitempty"`
	Result              string             `json:"result,omitempty"`
	Difficulty          int                `json:"difficulty,omitempty"`
	Prerequisites       []string           `json:"prerequisites,omitempty"`
	PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
	XPosition           float64            `json:"xPosition,omitempty"`
	YPosition           float64            `json:"yPosition,omitempty"`
}

// GroupNodeRef represents a node reference inside a group (code-based).
type GroupNodeRef struct {
	NodeType string `json:"nodeType"`
	Code     string `json:"code"`
}

// GroupData represents a node group in export/import format.
type GroupData struct {
	Name      string         `json:"name"`
	IsExact   bool           `json:"isExact"`
	XPosition float64        `json:"xPosition,omitempty"`
	YPosition float64        `json:"yPosition,omitempty"`
	Seeds     []GroupNodeRef `json:"seeds"`
	Members   []GroupNodeRef `json:"members,omitempty"`
}

// VisualNode represents a node in the visual graph
type VisualNode struct {
	ID            string   `json:"id"`
	Type          string   `json:"type"` // "definition" or "exercise"
	Name          string   `json:"name"`
	Code          string   `json:"code"`
	X             float64  `json:"x,omitempty"`
	Y             float64  `json:"y,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
}

// VisualGraph represents the graph structure for visualization
type VisualGraph struct {
	Nodes []VisualNode `json:"nodes"`
	Links []struct {
		Source string `json:"source"`
		Target string `json:"target"`
	} `json:"links"`
}

// GetVisualGraph returns the domain as a visual graph structure
func (d *GraphDAO) GetVisualGraph(domainID uint) (*VisualGraph, error) {
	// Load domain with meta definitions and meta exercises
	var metaDefs []models.MetaDefinition
	var metaExs []models.MetaExercise

	// Get meta definitions
	if err := d.db.Where("domain_id = ?", domainID).Find(&metaDefs).Error; err != nil {
		return nil, err
	}

	// Get meta exercises
	if err := d.db.Where("domain_id = ?", domainID).Find(&metaExs).Error; err != nil {
		return nil, err
	}

	// Check domain exists
	if len(metaDefs) == 0 && len(metaExs) == 0 {
		var count int64
		d.db.Model(&models.Domain{}).Where("id = ?", domainID).Count(&count)
		if count == 0 {
			return nil, errors.New("domain not found")
		}
	}

	graph := &VisualGraph{
		Nodes: make([]VisualNode, 0),
		Links: make([]struct {
			Source string `json:"source"`
			Target string `json:"target"`
		}, 0),
	}

	// Add meta_definitions to nodes with their prerequisites
	for _, def := range metaDefs {
		nodeID := fmt.Sprintf("def_%d", def.ID)

		// Get prerequisite codes for this meta_definition
		prereqCodes, err := d.getPrerequisiteCodes(def.ID, "meta_definition")
		if err != nil {
			return nil, err
		}

		// Add node (visually displayed as "definition")
		graph.Nodes = append(graph.Nodes, VisualNode{
			ID:            nodeID,
			Type:          "definition",
			Name:          def.Name,
			Code:          def.Code,
			X:             def.XPosition,
			Y:             def.YPosition,
			Prerequisites: prereqCodes,
		})
	}

	// Add meta_exercises to nodes with their prerequisites
	for _, ex := range metaExs {
		nodeID := fmt.Sprintf("ex_%d", ex.ID)

		// Get prerequisite codes for this meta_exercise
		prereqCodes, err := d.getPrerequisiteCodes(ex.ID, "meta_exercise")
		if err != nil {
			return nil, err
		}

		// Add node (visually displayed as "exercise")
		graph.Nodes = append(graph.Nodes, VisualNode{
			ID:            nodeID,
			Type:          "exercise",
			Name:          ex.Name,
			Code:          ex.Code,
			X:             ex.XPosition,
			Y:             ex.YPosition,
			Prerequisites: prereqCodes,
		})
	}

	// Build links from node_prerequisites table
	// Build links with proper source mapping
	type linkRow struct {
		NodeID           uint
		NodeType         string
		PrerequisiteID   uint
		PrerequisiteType string
		SourceMetaDefID  *uint
	}
	linkQuery := `
        SELECT 
            np.node_id as node_id,
            np.node_type as node_type,
            np.prerequisite_id as prerequisite_id,
            np.prerequisite_type as prerequisite_type,
            CASE 
                WHEN np.prerequisite_type = 'definition' THEN (SELECT d.meta_definition_id FROM definitions d WHERE d.id = np.prerequisite_id)
                WHEN np.prerequisite_type = 'meta_definition' THEN np.prerequisite_id
                ELSE NULL
            END as source_meta_def_id
        FROM node_prerequisites np
        WHERE (
            (np.node_type = 'meta_definition' AND np.node_id IN (SELECT id FROM meta_definitions WHERE domain_id = ?))
            OR 
            (np.node_type = 'meta_exercise' AND np.node_id IN (SELECT id FROM meta_exercises WHERE domain_id = ?))
        )
    `
	var rows []linkRow
	if err := d.db.Raw(linkQuery, domainID, domainID).Scan(&rows).Error; err != nil {
		return nil, err
	}

	for _, r := range rows {
		var sourceID, targetID string
		// Source for concept prereqs points to meta_definition node
		if r.PrerequisiteType == "definition" || r.PrerequisiteType == "meta_definition" {
			if r.SourceMetaDefID != nil {
				sourceID = fmt.Sprintf("def_%d", *r.SourceMetaDefID)
			} else {
				// Fallback skip if we can't resolve
				continue
			}
		} else {
			sourceID = fmt.Sprintf("ex_%d", r.PrerequisiteID)
		}

		if r.NodeType == "meta_definition" {
			targetID = fmt.Sprintf("def_%d", r.NodeID)
		} else {
			targetID = fmt.Sprintf("ex_%d", r.NodeID)
		}

		graph.Links = append(graph.Links, struct {
			Source string `json:"source"`
			Target string `json:"target"`
		}{Source: sourceID, Target: targetID})
	}

	return graph, nil
}

// ExportDomain exports a domain to the graph format
func (d *GraphDAO) ExportDomain(domainID uint) (*GraphData, error) {
	// Get meta_definitions (concept pools) instead of raw definition versions
	var metaDefs []models.MetaDefinition
	if err := d.db.Where("domain_id = ?", domainID).Find(&metaDefs).Error; err != nil {
		return nil, err
	}

	// Get exercises
	var exercises []models.MetaExercise
	if err := d.db.Where("domain_id = ?", domainID).Find(&exercises).Error; err != nil {
		return nil, err
	}

	// Check domain exists
	if len(metaDefs) == 0 && len(exercises) == 0 {
		var count int64
		d.db.Model(&models.Domain{}).Where("id = ?", domainID).Count(&count)
		if count == 0 {
			return nil, errors.New("domain not found")
		}
	}

	// Prepare graph data
	graphData := &GraphData{
		Definitions: make(map[string]DefinitionNode),
		Exercises:   make(map[string]ExerciseNode),
		Groups:      make([]GroupData, 0),
	}

	// Add meta_definitions using CODE as key
	for _, metaDef := range metaDefs {
		// Get the first version for description/notes/references
		// (export uses first version as representative)
		var firstVersion models.Definition
		var references []string
		var description, notes string

		err := d.db.Where("meta_definition_id = ?", metaDef.ID).
			Order("id ASC").
			Limit(1).
			First(&firstVersion).Error

		if err == nil {
			description = firstVersion.Description
			notes = firstVersion.Notes

			// Get references for first version
			var refs []models.Reference
			d.db.Where("definition_id = ?", firstVersion.ID).Find(&refs)
			references = make([]string, 0, len(refs))
			for _, ref := range refs {
				references = append(references, ref.Reference)
			}
		}
		description = fallbackGraphDefinitionDescription(description)

		// Get prerequisite codes and weights
		prerequisiteCodes, err := d.getPrerequisiteCodes(metaDef.ID, "meta_definition")
		if err != nil {
			return nil, err
		}
		prereqWeights, err := d.getPrerequisiteWeights(metaDef.ID, "meta_definition")
		if err != nil {
			return nil, err
		}

		// Use meta_definition CODE as key
		graphData.Definitions[metaDef.Code] = DefinitionNode{
			Code:                metaDef.Code,
			Name:                metaDef.Name,
			Description:         description,
			Notes:               notes,
			References:          references,
			Prerequisites:       prerequisiteCodes,
			PrerequisiteWeights: prereqWeights,
			XPosition:           metaDef.XPosition,
			YPosition:           metaDef.YPosition,
		}
	}

	// Add meta_exercises using CODE as key (FIXED)
	for _, ex := range exercises {
		var firstVersion models.Exercise
		var statement, description, hints, result string
		var verifiable bool
		var difficulty int

		exErr := d.db.Where("meta_exercise_id = ?", ex.ID).
			Order("id ASC").
			Limit(1).
			First(&firstVersion).Error
		if exErr == nil {
			statement = strings.TrimSpace(firstVersion.Statement)
			description = firstVersion.Description
			hints = firstVersion.Hints
			result = firstVersion.Result
			verifiable = firstVersion.Verifiable
			difficulty = firstVersion.Difficulty
		}
		if statement == "" {
			statement = fallbackGraphExerciseStatement(ex.Name)
		}
		if difficulty < 1 || difficulty > 7 {
			difficulty = 3
		}

		// Get prerequisite codes and weights
		prerequisiteCodes, err := d.getPrerequisiteCodes(ex.ID, "meta_exercise")
		if err != nil {
			return nil, err
		}
		prereqWeights, err := d.getPrerequisiteWeights(ex.ID, "meta_exercise")
		if err != nil {
			return nil, err
		}

		// Use exercise CODE as key, not ID
		graphData.Exercises[ex.Code] = ExerciseNode{
			Code:                ex.Code,
			Name:                ex.Name,
			Statement:           statement,
			Description:         description,
			Hints:               hints,
			Verifiable:          verifiable,
			Result:              result,
			Difficulty:          difficulty,
			Prerequisites:       prerequisiteCodes,
			PrerequisiteWeights: prereqWeights,
			XPosition:           ex.XPosition,
			YPosition:           ex.YPosition,
		}
	}

	// Export groups (code-based)
	var groups []models.NodeGroup
	if err := d.db.Where("domain_id = ?", domainID).Find(&groups).Error; err != nil {
		return nil, err
	}
	if len(groups) > 0 {
		groupIDs := make([]uint, 0, len(groups))
		for _, g := range groups {
			groupIDs = append(groupIDs, g.ID)
		}

		var seeds []models.NodeGroupSeed
		if err := d.db.Where("group_id IN ?", groupIDs).Find(&seeds).Error; err != nil {
			return nil, err
		}
		var members []models.NodeGroupMember
		if err := d.db.Where("group_id IN ?", groupIDs).Find(&members).Error; err != nil {
			return nil, err
		}

		metaDefCodes := make(map[uint]string, len(metaDefs))
		for _, md := range metaDefs {
			metaDefCodes[md.ID] = md.Code
		}
		metaExCodes := make(map[uint]string, len(exercises))
		for _, ex := range exercises {
			metaExCodes[ex.ID] = ex.Code
		}

		seedsByGroup := make(map[uint][]GroupNodeRef)
		for _, s := range seeds {
			ref := GroupNodeRef{NodeType: s.NodeType}
			if s.NodeType == "meta_definition" {
				if code, ok := metaDefCodes[s.NodeID]; ok {
					ref.Code = code
				}
			} else if s.NodeType == "meta_exercise" {
				if code, ok := metaExCodes[s.NodeID]; ok {
					ref.Code = code
				}
			}
			if ref.Code != "" {
				seedsByGroup[s.GroupID] = append(seedsByGroup[s.GroupID], ref)
			}
		}

		membersByGroup := make(map[uint][]GroupNodeRef)
		for _, m := range members {
			ref := GroupNodeRef{NodeType: m.NodeType}
			if m.NodeType == "meta_definition" {
				if code, ok := metaDefCodes[m.NodeID]; ok {
					ref.Code = code
				}
			} else if m.NodeType == "meta_exercise" {
				if code, ok := metaExCodes[m.NodeID]; ok {
					ref.Code = code
				}
			}
			if ref.Code != "" {
				membersByGroup[m.GroupID] = append(membersByGroup[m.GroupID], ref)
			}
		}

		for _, g := range groups {
			graphData.Groups = append(graphData.Groups, GroupData{
				Name:      g.Name,
				IsExact:   g.IsExact,
				XPosition: g.XPosition,
				YPosition: g.YPosition,
				Seeds:     seedsByGroup[g.ID],
				Members:   membersByGroup[g.ID],
			})
		}
	}

	return graphData, nil
}

// Helper function to get prerequisite codes for a node
func (d *GraphDAO) getPrerequisiteCodes(nodeID uint, nodeType string) ([]string, error) {
	if nodeType == "meta_exercise" {
		// Exercises can depend on meta_definitions, meta_exercises, or legacy definitions.
		codes := make([]string, 0)
		seen := make(map[string]bool)

		mdQuery := `
            SELECT md.code
            FROM node_prerequisites np
            JOIN meta_definitions md ON np.prerequisite_id = md.id
            WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'meta_definition'
            ORDER BY md.code
        `
		var mdCodes []string
		if err := d.db.Raw(mdQuery, nodeID).Scan(&mdCodes).Error; err != nil {
			return nil, err
		}
		for _, code := range mdCodes {
			if code == "" || seen[code] {
				continue
			}
			seen[code] = true
			codes = append(codes, code)
		}

		meQuery := `
            SELECT me.code
            FROM node_prerequisites np
            JOIN meta_exercises me ON np.prerequisite_id = me.id
            WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'meta_exercise'
            ORDER BY me.code
        `
		var meCodes []string
		if err := d.db.Raw(meQuery, nodeID).Scan(&meCodes).Error; err != nil {
			return nil, err
		}
		for _, code := range meCodes {
			if code == "" || seen[code] {
				continue
			}
			seen[code] = true
			codes = append(codes, code)
		}

		legacyQuery := `
            SELECT d.code
            FROM node_prerequisites np
            JOIN definitions d ON np.prerequisite_id = d.id
            WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'definition'
            ORDER BY d.code
        `
		var legacyCodes []string
		if err := d.db.Raw(legacyQuery, nodeID).Scan(&legacyCodes).Error; err != nil {
			return nil, err
		}
		for _, code := range legacyCodes {
			if code == "" || seen[code] {
				continue
			}
			seen[code] = true
			codes = append(codes, code)
		}

		return codes, nil
	}
	if nodeType == "meta_definition" {
		// Concepts depend on concepts (meta_definition)
		query := `
            SELECT md.code
            FROM node_prerequisites np
            JOIN meta_definitions md ON np.prerequisite_id = md.id
            WHERE np.node_id = ? AND np.node_type = 'meta_definition' AND np.prerequisite_type = 'meta_definition'
            ORDER BY md.code
        `
		var codes []string
		if err := d.db.Raw(query, nodeID).Scan(&codes).Error; err != nil {
			return nil, err
		}
		return codes, nil
	}
	return []string{}, nil
}

// getPrerequisiteWeights returns map[code]weight for a node's prerequisites
func (d *GraphDAO) getPrerequisiteWeights(nodeID uint, nodeType string) (map[string]float64, error) {
	type row struct {
		Code   string
		Weight float64
	}
	if nodeType == "meta_exercise" {
		weights := make(map[string]float64)

		mdQuery := `
            SELECT md.code, np.weight
            FROM node_prerequisites np
            JOIN meta_definitions md ON np.prerequisite_id = md.id
            WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'meta_definition'
            ORDER BY md.code
        `
		var mdRows []row
		if err := d.db.Raw(mdQuery, nodeID).Scan(&mdRows).Error; err != nil {
			return nil, err
		}
		for _, r := range mdRows {
			if r.Code != "" {
				weights[r.Code] = r.Weight
			}
		}

		meQuery := `
            SELECT me.code, np.weight
            FROM node_prerequisites np
            JOIN meta_exercises me ON np.prerequisite_id = me.id
            WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'meta_exercise'
            ORDER BY me.code
        `
		var meRows []row
		if err := d.db.Raw(meQuery, nodeID).Scan(&meRows).Error; err != nil {
			return nil, err
		}
		for _, r := range meRows {
			if r.Code != "" {
				weights[r.Code] = r.Weight
			}
		}

		legacyQuery := `
            SELECT d.code, np.weight
            FROM node_prerequisites np
            JOIN definitions d ON np.prerequisite_id = d.id
            WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'definition'
            ORDER BY d.code
        `
		var rows []row
		if err := d.db.Raw(legacyQuery, nodeID).Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, r := range rows {
			if r.Code == "" {
				continue
			}
			if _, exists := weights[r.Code]; !exists {
				weights[r.Code] = r.Weight
			}
		}
		return weights, nil
	}
	if nodeType == "meta_definition" {
		query := `
            SELECT md.code, np.weight
            FROM node_prerequisites np
            JOIN meta_definitions md ON np.prerequisite_id = md.id
            WHERE np.node_id = ? AND np.node_type = 'meta_definition' AND np.prerequisite_type = 'meta_definition'
            ORDER BY md.code
        `
		var rows []row
		if err := d.db.Raw(query, nodeID).Scan(&rows).Error; err != nil {
			return nil, err
		}
		res := make(map[string]float64, len(rows))
		for _, r := range rows {
			res[r.Code] = r.Weight
		}
		return res, nil
	}
	return map[string]float64{}, nil
}

// ImportDomain imports a domain from the graph format using clean DAOs
func (d *GraphDAO) ImportDomain(domainID uint, data *GraphData) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Verify domain exists
		var domain models.Domain
		if err := tx.First(&domain, domainID).Error; err != nil {
			return err
		}

		metaDefDAO := NewMetaDefinitionDAO(tx)
		metaExDAO := NewMetaExerciseDAO(tx)

		var existingMetaDefs []models.MetaDefinition
		if err := tx.Where("domain_id = ?", domainID).Find(&existingMetaDefs).Error; err != nil {
			return err
		}
		metaDefsByCode := make(map[string]*models.MetaDefinition, len(existingMetaDefs))
		for i := range existingMetaDefs {
			metaDefsByCode[existingMetaDefs[i].Code] = &existingMetaDefs[i]
		}

		var existingMetaExs []models.MetaExercise
		if err := tx.Where("domain_id = ?", domainID).Find(&existingMetaExs).Error; err != nil {
			return err
		}
		metaExByCode := make(map[string]*models.MetaExercise, len(existingMetaExs))
		for i := range existingMetaExs {
			metaExByCode[existingMetaExs[i].Code] = &existingMetaExs[i]
		}

		// Ensure meta_definitions exist and update fields
		for key, defNode := range data.Definitions {
			code := strings.TrimSpace(defNode.Code)
			if code == "" {
				code = strings.TrimSpace(key)
			}
			name := strings.TrimSpace(defNode.Name)
			if name == "" {
				name = code
			}
			if md, ok := metaDefsByCode[code]; ok {
				md.Name = name
				md.XPosition = defNode.XPosition
				md.YPosition = defNode.YPosition
				if err := tx.Save(md).Error; err != nil {
					return err
				}
				continue
			}
			metaDef := &models.MetaDefinition{
				Code:      code,
				Name:      name,
				DomainID:  domainID,
				OwnerID:   domain.OwnerID,
				XPosition: defNode.XPosition,
				YPosition: defNode.YPosition,
			}
			if err := tx.Create(metaDef).Error; err != nil {
				return err
			}
			metaDefsByCode[code] = metaDef
		}

		// Create/update definition versions and build first-version lookup for prerequisites
		definitionsByCode := make(map[string]*models.Definition)
		for key, defNode := range data.Definitions {
			code := strings.TrimSpace(defNode.Code)
			if code == "" {
				code = strings.TrimSpace(key)
			}
			md := metaDefsByCode[code]
			description := fallbackGraphDefinitionDescription(defNode.Description)
			var versions []models.Definition
			if err := tx.Where("meta_definition_id = ?", md.ID).Order("id ASC").Find(&versions).Error; err != nil {
				return err
			}

			if len(versions) == 0 {
				created, err := metaDefDAO.AddVersion(md.ID, &models.DefinitionVersionRequest{
					Description: description,
					Notes:       defNode.Notes,
					References:  defNode.References,
				})
				if err != nil {
					return err
				}
				definitionsByCode[code] = created
				continue
			}

			first := versions[0]
			updated, err := metaDefDAO.UpdateVersion(first.ID, &models.DefinitionVersionRequest{
				Description:          description,
				Notes:                defNode.Notes,
				References:           defNode.References,
				PromptImagePath:      first.PromptImagePath,
				DescriptionImagePath: first.DescriptionImagePath,
			})
			if err != nil {
				return err
			}
			definitionsByCode[code] = updated
		}

		// Update meta_definition prerequisites
		for key, defNode := range data.Definitions {
			code := strings.TrimSpace(defNode.Code)
			if code == "" {
				code = strings.TrimSpace(key)
			}
			md := metaDefsByCode[code]
			var prerequisiteIDs []uint
			idWeights := make(map[uint]float64)
			for _, prereqCode := range defNode.Prerequisites {
				if prereqMetaDef, exists := metaDefsByCode[prereqCode]; exists {
					prerequisiteIDs = append(prerequisiteIDs, prereqMetaDef.ID)
					if w, ok := defNode.PrerequisiteWeights[prereqCode]; ok {
						if w < 0.01 {
							w = 0.01
						} else if w > 1.0 {
							w = 1.0
						}
						idWeights[prereqMetaDef.ID] = w
					}
				}
			}
			if err := metaDefDAO.Update(md, prerequisiteIDs, idWeights); err != nil {
				return err
			}
		}

		// Ensure meta_exercises exist and update fields
		for key, exNode := range data.Exercises {
			code := strings.TrimSpace(exNode.Code)
			if code == "" {
				code = strings.TrimSpace(key)
			}
			name := strings.TrimSpace(exNode.Name)
			if name == "" {
				name = code
			}
			if me, ok := metaExByCode[code]; ok {
				me.Name = name
				me.XPosition = exNode.XPosition
				me.YPosition = exNode.YPosition
				if err := tx.Save(me).Error; err != nil {
					return err
				}
				continue
			}
			meta := &models.MetaExercise{
				Code:      code,
				Name:      name,
				DomainID:  domainID,
				OwnerID:   domain.OwnerID,
				XPosition: exNode.XPosition,
				YPosition: exNode.YPosition,
			}
			if err := tx.Create(meta).Error; err != nil {
				return err
			}
			metaExByCode[code] = meta
		}

		// Create/update exercise versions (use first version as representative)
		for key, exNode := range data.Exercises {
			code := strings.TrimSpace(exNode.Code)
			if code == "" {
				code = strings.TrimSpace(key)
			}
			meta, ok := metaExByCode[code]
			if !ok {
				continue
			}
			statement := strings.TrimSpace(exNode.Statement)
			if statement == "" {
				statement = fallbackGraphExerciseStatement(meta.Name)
			}
			diff := exNode.Difficulty
			if diff < 1 || diff > 7 {
				diff = 3
			}
			req := &models.ExerciseVersionRequest{
				Statement:   statement,
				Description: exNode.Description,
				Hints:       exNode.Hints,
				Verifiable:  exNode.Verifiable,
				Result:      exNode.Result,
				Difficulty:  diff,
			}
			var versions []models.Exercise
			if err := tx.Where("meta_exercise_id = ?", meta.ID).Order("id ASC").Find(&versions).Error; err != nil {
				return err
			}
			if len(versions) == 0 {
				if _, err := metaExDAO.AddVersion(meta.ID, req); err != nil {
					return err
				}
				continue
			}
			if _, err := metaExDAO.UpdateVersion(versions[0].ID, req); err != nil {
				return err
			}
		}

		// Update meta_exercise prerequisites (prefer meta_definition/meta_exercise, fallback to legacy definition)
		for key, exNode := range data.Exercises {
			code := strings.TrimSpace(exNode.Code)
			if code == "" {
				code = strings.TrimSpace(key)
			}
			meta := metaExByCode[code]
			if err := tx.Where("node_id = ? AND node_type = ?", meta.ID, "meta_exercise").
				Delete(&models.NodePrerequisite{}).Error; err != nil {
				return err
			}
			for _, prereqCode := range exNode.Prerequisites {
				w := 1.0
				if exNode.PrerequisiteWeights != nil {
					if val, ok := exNode.PrerequisiteWeights[prereqCode]; ok {
						if val < 0.01 {
							w = 0.01
						} else if val > 1.0 {
							w = 1.0
						} else {
							w = val
						}
					}
				}
				if prereqMetaDef, ok := metaDefsByCode[prereqCode]; ok {
					if err := tx.Create(&models.NodePrerequisite{
						NodeID:           meta.ID,
						NodeType:         "meta_exercise",
						PrerequisiteID:   prereqMetaDef.ID,
						PrerequisiteType: "meta_definition",
						Weight:           w,
						IsManual:         true,
					}).Error; err != nil {
						return err
					}
					continue
				}
				if prereqMetaEx, ok := metaExByCode[prereqCode]; ok {
					if err := tx.Create(&models.NodePrerequisite{
						NodeID:           meta.ID,
						NodeType:         "meta_exercise",
						PrerequisiteID:   prereqMetaEx.ID,
						PrerequisiteType: "meta_exercise",
						Weight:           w,
						IsManual:         true,
					}).Error; err != nil {
						return err
					}
					continue
				}
				if prereqDef, ok := definitionsByCode[prereqCode]; ok {
					if err := tx.Create(&models.NodePrerequisite{
						NodeID:           meta.ID,
						NodeType:         "meta_exercise",
						PrerequisiteID:   prereqDef.ID,
						PrerequisiteType: "definition",
						Weight:           w,
						IsManual:         true,
					}).Error; err != nil {
						return err
					}
				}
			}
		}

		// Import groups (code-based, overwrite by name)
		var existingGroups []models.NodeGroup
		if err := tx.Where("domain_id = ?", domainID).Find(&existingGroups).Error; err != nil {
			return err
		}
		groupsByName := make(map[string]*models.NodeGroup, len(existingGroups))
		for i := range existingGroups {
			g := &existingGroups[i]
			name := strings.TrimSpace(g.Name)
			if name != "" {
				groupsByName[name] = g
			}
		}

		for _, group := range data.Groups {
			name := strings.TrimSpace(group.Name)
			if name == "" || len(group.Seeds) == 0 {
				continue
			}

			seeds := make([]models.NodeGroupSeed, 0, len(group.Seeds))
			for _, seed := range group.Seeds {
				switch seed.NodeType {
				case "meta_definition":
					if md, ok := metaDefsByCode[seed.Code]; ok {
						seeds = append(seeds, models.NodeGroupSeed{NodeID: md.ID, NodeType: "meta_definition"})
					}
				case "meta_exercise":
					if me, ok := metaExByCode[seed.Code]; ok {
						seeds = append(seeds, models.NodeGroupSeed{NodeID: me.ID, NodeType: "meta_exercise"})
					}
				}
			}
			if len(seeds) == 0 {
				continue
			}

			var members []models.NodeGroupMember
			if group.IsExact {
				memberRefs := group.Members
				if len(memberRefs) == 0 {
					memberRefs = group.Seeds
				}
				for _, member := range memberRefs {
					switch member.NodeType {
					case "meta_definition":
						if md, ok := metaDefsByCode[member.Code]; ok {
							members = append(members, models.NodeGroupMember{NodeID: md.ID, NodeType: "meta_definition"})
						}
					case "meta_exercise":
						if me, ok := metaExByCode[member.Code]; ok {
							members = append(members, models.NodeGroupMember{NodeID: me.ID, NodeType: "meta_exercise"})
						}
					}
				}
			}

			if existing, ok := groupsByName[name]; ok {
				existing.IsExact = group.IsExact
				existing.XPosition = group.XPosition
				existing.YPosition = group.YPosition
				if err := tx.Save(existing).Error; err != nil {
					return err
				}
				if err := tx.Where("group_id = ?", existing.ID).Delete(&models.NodeGroupSeed{}).Error; err != nil {
					return err
				}
				if err := tx.Where("group_id = ?", existing.ID).Delete(&models.NodeGroupMember{}).Error; err != nil {
					return err
				}
				for i := range seeds {
					seeds[i].GroupID = existing.ID
				}
				if err := tx.Create(&seeds).Error; err != nil {
					return err
				}
				if existing.IsExact && len(members) > 0 {
					for i := range members {
						members[i].GroupID = existing.ID
					}
					if err := tx.Create(&members).Error; err != nil {
						return err
					}
				}
				continue
			}

			groupModel := models.NodeGroup{
				DomainID:  domainID,
				Name:      name,
				IsExact:   group.IsExact,
				XPosition: group.XPosition,
				YPosition: group.YPosition,
				CreatedBy: domain.OwnerID,
			}
			if err := tx.Create(&groupModel).Error; err != nil {
				return err
			}
			for i := range seeds {
				seeds[i].GroupID = groupModel.ID
			}
			if err := tx.Create(&seeds).Error; err != nil {
				return err
			}
			if groupModel.IsExact && len(members) > 0 {
				for i := range members {
					members[i].GroupID = groupModel.ID
				}
				if err := tx.Create(&members).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})
}

// UpdateGraphPositions updates the positions of nodes in the graph
func (d *GraphDAO) UpdateGraphPositions(positionUpdates map[string]struct{ X, Y float64 }) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		for nodeID, pos := range positionUpdates {
			// Parse the node ID to determine if it's a definition or exercise
			parts := strings.Split(nodeID, "_")
			if len(parts) != 2 {
				return errors.New("invalid node ID format: " + nodeID)
			}

			nodeType := parts[0]
			nodeIDStr := parts[1]

			id, err := strconv.ParseUint(nodeIDStr, 10, 32)
			if err != nil {
				return errors.New("invalid node ID number: " + nodeIDStr)
			}

			if nodeType == "def" {
				// Update meta_definition position
				if err := tx.Model(&models.MetaDefinition{}).
					Where("id = ?", id).
					Updates(map[string]interface{}{
						"x_position": pos.X,
						"y_position": pos.Y,
					}).Error; err != nil {
					return err
				}
			} else if nodeType == "ex" {
				// Update meta_exercise position
				if err := tx.Model(&models.MetaExercise{}).
					Where("id = ?", id).
					Updates(map[string]interface{}{
						"x_position": pos.X,
						"y_position": pos.Y,
					}).Error; err != nil {
					return err
				}
			} else {
				return errors.New("unknown node type: " + nodeType)
			}
		}

		return nil
	})
}
