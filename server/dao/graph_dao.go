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
    PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
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
    PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
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
        // Get prerequisite codes and weights
        prerequisiteCodes, err := d.getPrerequisiteCodes(ex.ID, "meta_exercise")
        if err != nil {
            return nil, err
        }
        prereqWeights, err := d.getPrerequisiteWeights(ex.ID, "meta_exercise")
        if err != nil { return nil, err }

        // Use exercise CODE as key, not ID
        graphData.Exercises[ex.Code] = ExerciseNode{
            Code:          ex.Code,
            Name:          ex.Name,
            // meta nodes: omit version-specific fields in export format
            Prerequisites: prerequisiteCodes,
            PrerequisiteWeights: prereqWeights,
            XPosition:     ex.XPosition,
            YPosition:     ex.YPosition,
        }
    }
	
	return graphData, nil
}

// Helper function to get prerequisite codes for a node
func (d *GraphDAO) getPrerequisiteCodes(nodeID uint, nodeType string) ([]string, error) {
    if nodeType == "meta_exercise" {
        // Exercises depend on definitions (legacy)
        query := `
            SELECT d.code
            FROM node_prerequisites np
            JOIN definitions d ON np.prerequisite_id = d.id
            WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'definition'
            ORDER BY d.code
        `
        var codes []string
        if err := d.db.Raw(query, nodeID).Scan(&codes).Error; err != nil { return nil, err }
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
        if err := d.db.Raw(query, nodeID).Scan(&codes).Error; err != nil { return nil, err }
        return codes, nil
    }
    return []string{}, nil
}

// getPrerequisiteWeights returns map[code]weight for a node's prerequisites
func (d *GraphDAO) getPrerequisiteWeights(nodeID uint, nodeType string) (map[string]float64, error) {
    type row struct{ Code string; Weight float64 }
    if nodeType == "meta_exercise" {
        query := `
            SELECT d.code, np.weight
            FROM node_prerequisites np
            JOIN definitions d ON np.prerequisite_id = d.id
            WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'definition'
            ORDER BY d.code
        `
        var rows []row
        if err := d.db.Raw(query, nodeID).Scan(&rows).Error; err != nil { return nil, err }
        res := make(map[string]float64, len(rows))
        for _, r := range rows { res[r.Code] = r.Weight }
        return res, nil
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
        if err := d.db.Raw(query, nodeID).Scan(&rows).Error; err != nil { return nil, err }
        res := make(map[string]float64, len(rows))
        for _, r := range rows { res[r.Code] = r.Weight }
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
        
        // Clear existing data for this domain
        // Delete prerequisites first (meta_definitions and meta_exercises)
        if err := tx.Exec(`
            DELETE FROM node_prerequisites
            WHERE (node_type = 'meta_definition' AND node_id IN (SELECT id FROM meta_definitions WHERE domain_id = ?))
               OR (node_type = 'definition' AND node_id IN (SELECT id FROM definitions WHERE domain_id = ?))
               OR (node_type = 'meta_exercise' AND node_id IN (SELECT id FROM meta_exercises WHERE domain_id = ?))
        `, domainID, domainID, domainID).Error; err != nil {
            return err
        }

        // Delete exercise versions then meta exercises
        if err := tx.Where("domain_id = ?", domainID).Delete(&models.Exercise{}).Error; err != nil {
            return err
        }
        if err := tx.Where("domain_id = ?", domainID).Delete(&models.MetaExercise{}).Error; err != nil {
            return err
        }

        // Delete definition versions (this will cascade delete references)
        if err := tx.Where("domain_id = ?", domainID).Delete(&models.Definition{}).Error; err != nil {
            return err
        }

        // Delete meta_definitions
        if err := tx.Where("domain_id = ?", domainID).Delete(&models.MetaDefinition{}).Error; err != nil {
            return err
        }
		
        // Create DAOs for the transaction
        metaDefDAO := NewMetaDefinitionDAO(tx)
        metaExDAO := NewMetaExerciseDAO(tx)

		// Create meta_definitions first (concept pools) - now working with code-based keys
		metaDefs := make(map[string]*models.MetaDefinition)
		for code, defNode := range data.Definitions {
			// Create the meta_definition (pool)
			metaDef := &models.MetaDefinition{
				Code:      defNode.Code,
				Name:      defNode.Name,
				DomainID:  domainID,
				OwnerID:   domain.OwnerID,
				XPosition: defNode.XPosition,
				YPosition: defNode.YPosition,
			}

			// Create with no prerequisites initially (will add after all created)
			if err := metaDefDAO.Create(metaDef, nil, nil); err != nil {
				return err
			}

			// Create the first version with description/notes/references
			versionReq := &models.DefinitionVersionRequest{
				Description: defNode.Description,
				Notes:       defNode.Notes,
				References:  defNode.References,
			}

			if _, err := metaDefDAO.AddVersion(metaDef.ID, versionReq); err != nil {
				return err
			}

			// Store by both the key and the code for lookup
			metaDefs[code] = metaDef
			metaDefs[metaDef.Code] = metaDef
		}
		
		// Add meta_definition prerequisites
		for code, defNode := range data.Definitions {
			if len(defNode.Prerequisites) > 0 {
				metaDef := metaDefs[code]
				var prerequisiteIDs []uint

				for _, prereqCode := range defNode.Prerequisites {
					if prereqMetaDef, exists := metaDefs[prereqCode]; exists {
						prerequisiteIDs = append(prerequisiteIDs, prereqMetaDef.ID)
					}
				}

				if len(prerequisiteIDs) > 0 {
					// Build weights map by ID if provided
					var idWeights map[uint]float64
					if len(defNode.PrerequisiteWeights) > 0 {
						idWeights = make(map[uint]float64, len(defNode.PrerequisiteWeights))
						for pcode, w := range defNode.PrerequisiteWeights {
							if prereqMetaDef, ok := metaDefs[pcode]; ok {
								if w < 0.01 {
									w = 0.01
								} else if w > 1.0 {
									w = 1.0
								}
								idWeights[prereqMetaDef.ID] = w
							}
						}
					}
					if err := metaDefDAO.Update(metaDef, prerequisiteIDs, idWeights); err != nil {
						return err
					}
				}
			}
		}
		
        // Create meta-exercise nodes from the exported "exercises" entries
        // Note: Graph export uses meta_exercises as "exercises" without version details.
        // Build a map of first definition version by code for resolving exercise prerequisites
        definitionsByCode := make(map[string]*models.Definition)
        for _, md := range metaDefs {
            var first models.Definition
            if err := tx.Where("meta_definition_id = ?", md.ID).Order("id ASC").Limit(1).First(&first).Error; err == nil {
                definitionsByCode[first.Code] = &first
            }
        }

        for _, exNode := range data.Exercises {
            meta := &models.MetaExercise{
                Code:      exNode.Code,
                Name:      exNode.Name,
                DomainID:  domainID,
                OwnerID:   domain.OwnerID,
                XPosition: exNode.XPosition,
                YPosition: exNode.YPosition,
            }

            // Resolve prerequisites by code (definitions for exercises)
            var prerequisiteIDs []uint
            for _, prereqCode := range exNode.Prerequisites {
                if prereqDef, exists := definitionsByCode[prereqCode]; exists {
                    prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
                }
            }

            // Map code->weight to id->weight
            var idWeights map[uint]float64
            if len(exNode.PrerequisiteWeights) > 0 {
                idWeights = make(map[uint]float64, len(exNode.PrerequisiteWeights))
                for pcode, w := range exNode.PrerequisiteWeights {
                    if prereqDef, ok := definitionsByCode[pcode]; ok {
                        if w < 0.01 {
                            w = 0.01
                        } else if w > 1.0 {
                            w = 1.0
                        }
                        idWeights[prereqDef.ID] = w
                    }
                }
            }

            if err := metaExDAO.Create(meta, prerequisiteIDs, idWeights); err != nil {
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
