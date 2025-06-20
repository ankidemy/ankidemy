// dao/graph_dao.go - Updated version with code-based export keys

package dao

import (
	"errors"
	"myapp/server/models"
	"fmt"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// GraphDAO handles operations related to the knowledge graph
type GraphDAO struct {
	db *gorm.DB
}

// NewGraphDAO creates a new GraphDAO instance
func NewGraphDAO(db *gorm.DB) *GraphDAO {
	return &GraphDAO{db: db}
}

// GraphData represents the full structure of a knowledge graph
type GraphData struct {
	Definitions map[string]DefinitionNode `json:"definitions"`
	Exercises   map[string]ExerciseNode   `json:"exercises"`
}

// DefinitionNode represents a definition in the graph export/import format
type DefinitionNode struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Notes         string   `json:"notes,omitempty"`
	References    []string `json:"references,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
}

// ExerciseNode represents an exercise in the graph export/import format
type ExerciseNode struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Statement     string   `json:"statement"`
	Description   string   `json:"description,omitempty"`
	Hints         string   `json:"hints,omitempty"`
	Verifiable    bool     `json:"verifiable,omitempty"`
	Result        string   `json:"result,omitempty"`
	Difficulty    int      `json:"difficulty,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
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
	// Load domain with all definitions and exercises
	var definitions []models.Definition
	var exercises []models.Exercise
	
	// Get definitions
	if err := d.db.Where("domain_id = ?", domainID).Find(&definitions).Error; err != nil {
		return nil, err
	}
	
	// Get exercises
	if err := d.db.Where("domain_id = ?", domainID).Find(&exercises).Error; err != nil {
		return nil, err
	}
	
	// Check domain exists
	if len(definitions) == 0 && len(exercises) == 0 {
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
	
	// Add definitions to nodes with their prerequisites
	for _, def := range definitions {
		nodeID := fmt.Sprintf("def_%d", def.ID)
		
		// Get prerequisite codes for this definition
		prereqCodes, err := d.getPrerequisiteCodes(def.ID, "definition")
		if err != nil {
			return nil, err
		}
		
		// Add node
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
	
	// Add exercises to nodes with their prerequisites
	for _, ex := range exercises {
		nodeID := fmt.Sprintf("ex_%d", ex.ID)
		
		// Get prerequisite codes for this exercise
		prereqCodes, err := d.getPrerequisiteCodes(ex.ID, "exercise")
		if err != nil {
			return nil, err
		}
		
		// Add node
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
	var prerequisites []models.NodePrerequisite
	query := `
		SELECT np.* FROM node_prerequisites np
		WHERE (
			(np.node_type = 'definition' AND np.node_id IN (SELECT id FROM definitions WHERE domain_id = ?))
			OR 
			(np.node_type = 'exercise' AND np.node_id IN (SELECT id FROM exercises WHERE domain_id = ?))
		)
	`
	
	if err := d.db.Raw(query, domainID, domainID).Scan(&prerequisites).Error; err != nil {
		return nil, err
	}
	
	// Create links from prerequisites
	for _, prereq := range prerequisites {
		var sourceID, targetID string
		
		if prereq.PrerequisiteType == "definition" {
			sourceID = fmt.Sprintf("def_%d", prereq.PrerequisiteID)
		} else {
			sourceID = fmt.Sprintf("ex_%d", prereq.PrerequisiteID)
		}
		
		if prereq.NodeType == "definition" {
			targetID = fmt.Sprintf("def_%d", prereq.NodeID)
		} else {
			targetID = fmt.Sprintf("ex_%d", prereq.NodeID)
		}
		
		graph.Links = append(graph.Links, struct {
			Source string `json:"source"`
			Target string `json:"target"`
		}{
			Source: sourceID,
			Target: targetID,
		})
	}
	
	return graph, nil
}

// ExportDomain exports a domain to the graph format
func (d *GraphDAO) ExportDomain(domainID uint) (*GraphData, error) {
	// Get definitions with prerequisites
	var definitions []models.Definition
	if err := d.db.Preload("References").Where("domain_id = ?", domainID).Find(&definitions).Error; err != nil {
		return nil, err
	}
	
	// Get exercises
	var exercises []models.Exercise
	if err := d.db.Where("domain_id = ?", domainID).Find(&exercises).Error; err != nil {
		return nil, err
	}
	
	// Check domain exists
	if len(definitions) == 0 && len(exercises) == 0 {
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
	}
	
	// Add definitions using CODE as key (FIXED)
	for _, def := range definitions {
		// Extract references
		references := make([]string, 0, len(def.References))
		for _, ref := range def.References {
			references = append(references, ref.Reference)
		}
		
		// Get prerequisite codes
		prerequisiteCodes, err := d.getPrerequisiteCodes(def.ID, "definition")
		if err != nil {
			return nil, err
		}
		
		// Use definition CODE as key, not ID
		graphData.Definitions[def.Code] = DefinitionNode{
			Code:          def.Code,
			Name:          def.Name,
			Description:   def.Description,
			Notes:         def.Notes,
			References:    references,
			Prerequisites: prerequisiteCodes,
			XPosition:     def.XPosition,
			YPosition:     def.YPosition,
		}
	}
	
	// Add exercises using CODE as key (FIXED)
	for _, ex := range exercises {
		// Get prerequisite codes
		prerequisiteCodes, err := d.getPrerequisiteCodes(ex.ID, "exercise")
		if err != nil {
			return nil, err
		}
		
		// Use exercise CODE as key, not ID
		graphData.Exercises[ex.Code] = ExerciseNode{
			Code:          ex.Code,
			Name:          ex.Name,
			Statement:     ex.Statement,
			Description:   ex.Description,
			Hints:         ex.Hints,
			Verifiable:    ex.Verifiable,
			Result:        ex.Result,
			Difficulty:    ex.Difficulty,
			Prerequisites: prerequisiteCodes,
			XPosition:     ex.XPosition,
			YPosition:     ex.YPosition,
		}
	}
	
	return graphData, nil
}

// Helper function to get prerequisite codes for a node
func (d *GraphDAO) getPrerequisiteCodes(nodeID uint, nodeType string) ([]string, error) {
	query := `
		SELECT d.code 
		FROM node_prerequisites np
		JOIN definitions d ON np.prerequisite_id = d.id 
		WHERE np.node_id = ? AND np.node_type = ? AND np.prerequisite_type = 'definition'
		ORDER BY d.code
	`
	
	var codes []string
	if err := d.db.Raw(query, nodeID, nodeType).Scan(&codes).Error; err != nil {
		return nil, err
	}
	
	return codes, nil
}

// ImportDomain imports a domain from the graph format using clean DAOs
func (d *GraphDAO) ImportDomain(domainID uint, data *GraphData) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Verify domain exists
		var domain models.Domain
		if err := tx.First(&domain, domainID).Error; err != nil {
			return err
		}
		
		// Clear existing data for this domain
		// Delete prerequisites first
		if err := tx.Exec(`
			DELETE FROM node_prerequisites 
			WHERE (node_type = 'definition' AND node_id IN (SELECT id FROM definitions WHERE domain_id = ?))
			   OR (node_type = 'exercise' AND node_id IN (SELECT id FROM exercises WHERE domain_id = ?))
		`, domainID, domainID).Error; err != nil {
			return err
		}
		
		// Delete exercises
		if err := tx.Where("domain_id = ?", domainID).Delete(&models.Exercise{}).Error; err != nil {
			return err
		}
		
		// Delete definitions (this will cascade delete references)
		if err := tx.Where("domain_id = ?", domainID).Delete(&models.Definition{}).Error; err != nil {
			return err
		}
		
		// Create DAOs for the transaction
		definitionDAO := NewDefinitionDAO(tx)
		exerciseDAO := NewExerciseDAO(tx)
		
		// Create definitions first - now working with code-based keys
		definitions := make(map[string]*models.Definition)
		for code, defNode := range data.Definitions {
			def := &models.Definition{
				Code:        defNode.Code,
				Name:        defNode.Name,
				Description: defNode.Description,
				Notes:       defNode.Notes,
				DomainID:    domainID,
				OwnerID:     domain.OwnerID,
				XPosition:   defNode.XPosition,
				YPosition:   defNode.YPosition,
			}
			
			if err := definitionDAO.Create(def, defNode.References, nil); err != nil {
				return err
			}
			
			// Store by both the key and the code for lookup
			definitions[code] = def
			definitions[def.Code] = def
		}
		
		// Add definition prerequisites
		for code, defNode := range data.Definitions {
			if len(defNode.Prerequisites) > 0 {
				def := definitions[code]
				var prerequisiteIDs []uint
				
				for _, prereqCode := range defNode.Prerequisites {
					if prereqDef, exists := definitions[prereqCode]; exists {
						prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
					}
				}
				
				if len(prerequisiteIDs) > 0 {
					if err := definitionDAO.Update(def, defNode.References, prerequisiteIDs); err != nil {
						return err
					}
				}
			}
		}
		
		// Create exercises - now working with code-based keys
		for _, exNode := range data.Exercises {
			ex := &models.Exercise{
				Code:        exNode.Code,
				Name:        exNode.Name,
				Statement:   exNode.Statement,
				Description: exNode.Description,
				Hints:       exNode.Hints,
				DomainID:    domainID,
				OwnerID:     domain.OwnerID,
				Verifiable:  exNode.Verifiable,
				Result:      exNode.Result,
				Difficulty:  exNode.Difficulty,
				XPosition:   exNode.XPosition,
				YPosition:   exNode.YPosition,
			}
			
			// Add prerequisites using code matching
			var prerequisiteIDs []uint
			for _, prereqCode := range exNode.Prerequisites {
				if prereqDef, exists := definitions[prereqCode]; exists {
					prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
				}
			}
			
			if err := exerciseDAO.Create(ex, prerequisiteIDs); err != nil {
				return err
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
				// Update definition position
				if err := tx.Model(&models.Definition{}).
					Where("id = ?", id).
					Updates(map[string]interface{}{
						"x_position": pos.X,
						"y_position": pos.Y,
					}).Error; err != nil {
					return err
				}
			} else if nodeType == "ex" {
				// Update exercise position
				if err := tx.Model(&models.Exercise{}).
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
