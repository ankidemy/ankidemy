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
	Difficulty    int      `json:"difficulty,omitempty"` // Changed from string to int
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
}

// ExportDomain exports a domain to the graph format
func (d *GraphDAO) ExportDomain(domainID uint) (*GraphData, error) {
	// Load domain with all definitions and exercises
	var domain models.Domain
	result := d.db.
		Preload("Definitions").
		Preload("Definitions.References").
		Preload("Definitions.Prerequisites").
		Preload("Exercises").
		Preload("Exercises.Prerequisites").
		First(&domain, domainID)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("domain not found")
		}
		return nil, result.Error
	}
	
	// Prepare graph data
	graphData := &GraphData{
		Definitions: make(map[string]DefinitionNode),
		Exercises:   make(map[string]ExerciseNode),
	}
	
	// Add definitions - use ID as key in the map since code is no longer unique
	for _, def := range domain.Definitions {
		// Extract references
		references := make([]string, 0, len(def.References))
		for _, ref := range def.References {
			references = append(references, ref.Reference)
		}
		
		// Extract prerequisites
		prerequisites := make([]string, 0, len(def.Prerequisites))
		for _, prereq := range def.Prerequisites {
			prerequisites = append(prerequisites, prereq.Code)
		}
		
		// Add to graph data using ID string as key
		graphData.Definitions[idToString(def.ID)] = DefinitionNode{
			Code:          def.Code,
			Name:          def.Name,
			Description:   def.Description,
			Notes:         def.Notes,
			References:    references,
			Prerequisites: prerequisites,
			XPosition:     def.XPosition,
			YPosition:     def.YPosition,
		}
	}
	
	// Add exercises - use ID as key in the map since code is no longer unique
	for _, ex := range domain.Exercises {
		// Extract prerequisites
		prerequisites := make([]string, 0, len(ex.Prerequisites))
		for _, prereq := range ex.Prerequisites {
			prerequisites = append(prerequisites, prereq.Code)
		}
		
		// Add to graph data using ID string as key
		graphData.Exercises[idToString(ex.ID)] = ExerciseNode{
			Code:          ex.Code,
			Name:          ex.Name,
			Statement:     ex.Statement,
			Description:   ex.Description,
			Hints:         ex.Hints,
			Verifiable:    ex.Verifiable,
			Result:        ex.Result,
			Difficulty:    ex.Difficulty,
			Prerequisites: prerequisites,
			XPosition:     ex.XPosition,
			YPosition:     ex.YPosition,
		}
	}
	
	return graphData, nil
}

// Helper function to convert uint ID to string
func idToString(id uint) string {
	return strconv.FormatUint(uint64(id), 10)
}

// ImportDomain imports a domain from the graph format
func (d *GraphDAO) ImportDomain(domainID uint, data *GraphData) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		// Verify domain exists
		var domain models.Domain
		if err := tx.First(&domain, domainID).Error; err != nil {
			return err
		}
		
		// Clear existing data for this domain
		// First delete exercises
		if err := tx.Where("domain_id = ?", domainID).Delete(&models.Exercise{}).Error; err != nil {
			return err
		}
		
		// Then delete definitions
		if err := tx.Where("domain_id = ?", domainID).Delete(&models.Definition{}).Error; err != nil {
			return err
		}
		
		// Create definitions first
		definitions := make(map[string]*models.Definition)
		for nodeID, defNode := range data.Definitions {
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
			
			if err := tx.Create(def).Error; err != nil {
				return err
			}
			
			// Store for later use - use nodeID from import as the key
			definitions[nodeID] = def
			
			// Add references
			for _, refText := range defNode.References {
				ref := models.Reference{
					DefinitionID: def.ID,
					Reference:    refText,
				}
				if err := tx.Create(&ref).Error; err != nil {
					return err
				}
			}
		}
		
		// Create a code-to-definition map for looking up prerequisites
		codeToDefinition := make(map[string][]*models.Definition)
		for _, def := range definitions {
			codeToDefinition[def.Code] = append(codeToDefinition[def.Code], def)
		}
		
		// Add definition prerequisites
		for nodeID, defNode := range data.Definitions {
			def := definitions[nodeID]
			for _, prereqCode := range defNode.Prerequisites {
				prereqList, exists := codeToDefinition[prereqCode]
				if !exists || len(prereqList) == 0 {
					continue // Skip if prerequisite not found
				}
				
				// Use first matching code as prerequisite
				prereq := prereqList[0]
				if err := tx.Model(def).Association("Prerequisites").Append(prereq); err != nil {
					return err
				}
			}
		}
		
		// Create exercises
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
			
			if err := tx.Create(ex).Error; err != nil {
				return err
			}
			
			// Add prerequisites using code matching
			for _, prereqCode := range exNode.Prerequisites {
				prereqList, exists := codeToDefinition[prereqCode]
				if !exists || len(prereqList) == 0 {
					continue // Skip if prerequisite not found
				}
				
				// Use first matching code as prerequisite
				prereq := prereqList[0]
				if err := tx.Model(ex).Association("Prerequisites").Append(prereq); err != nil {
					return err
				}
			}
		}
		
		return nil
	})
}

// GetVisualGraph returns a structure representing the graph for visualization
type VisualNode struct {
	ID            string   `json:"id"`
	Type          string   `json:"type"` // "definition" or "exercise"
	Name          string   `json:"name"`
	Code          string   `json:"code"`
	X             float64  `json:"x,omitempty"`
	Y             float64  `json:"y,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
}

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
	var domain models.Domain
	result := d.db.
		Preload("Definitions").
		Preload("Definitions.Prerequisites").
		Preload("Exercises").
		Preload("Exercises.Prerequisites").
		First(&domain, domainID)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("domain not found")
		}
		return nil, result.Error
	}
	
	graph := &VisualGraph{
		Nodes: make([]VisualNode, 0),
		Links: make([]struct {
			Source string `json:"source"`
			Target string `json:"target"`
		}, 0),
	}
	
	// Create maps to track unique IDs for nodes (since code is no longer unique)
	definitionIDs := make(map[string]string)
	
	// Add definitions to nodes
	for _, def := range domain.Definitions {
		// Create a unique ID for this node
		nodeID := fmt.Sprintf("def_%d", def.ID)
		definitionIDs[def.Code+"_"+strconv.FormatUint(uint64(def.ID), 10)] = nodeID
		
		// Get prerequisite codes
		prereqCodes := make([]string, 0, len(def.Prerequisites))
		for _, prereq := range def.Prerequisites {
			prereqCodes = append(prereqCodes, prereq.Code)
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
	
	// Add exercises to nodes
	for _, ex := range domain.Exercises {
		// Create a unique ID for this node
		nodeID := fmt.Sprintf("ex_%d", ex.ID)
		
		// Get prerequisite codes
		prereqCodes := make([]string, 0, len(ex.Prerequisites))
		for _, prereq := range ex.Prerequisites {
			prereqCodes = append(prereqCodes, prereq.Code)
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
	
	// Add definition links - we need to be careful with non-unique codes
	for _, def := range domain.Definitions {
		targetID := fmt.Sprintf("def_%d", def.ID)
		
		for _, prereq := range def.Prerequisites {
			// Since code is no longer unique, we need to use the actual prereq ID
			sourceID := fmt.Sprintf("def_%d", prereq.ID)
			
			graph.Links = append(graph.Links, struct {
				Source string `json:"source"`
				Target string `json:"target"`
			}{
				Source: sourceID,
				Target: targetID,
			})
		}
	}
	
	// Add exercise links
	for _, ex := range domain.Exercises {
		targetID := fmt.Sprintf("ex_%d", ex.ID)
		
		for _, prereq := range ex.Prerequisites {
			// Since code is no longer unique, we need to use the actual prereq ID
			sourceID := fmt.Sprintf("def_%d", prereq.ID)
			
			graph.Links = append(graph.Links, struct {
				Source string `json:"source"`
				Target string `json:"target"`
			}{
				Source: sourceID,
				Target: targetID,
			})
		}
	}
	
	return graph, nil
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
