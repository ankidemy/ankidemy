package services

import (
    "fmt"
    "math"
    "sort"
    "strconv"
    "strings"
    "time"
    "myapp/server/models"
)

// SpacedRepetitionService implements the SM-2 algorithm
type SpacedRepetitionService struct{}

func NewSpacedRepetitionService() *SpacedRepetitionService {
	return &SpacedRepetitionService{}
}

// SRSResult represents the result of an SRS calculation
type SRSResult struct {
	EasinessFactor float64
	IntervalDays   float64
	Repetitions    int
	NextReview     time.Time
}

// CalculateNextInterval implements the SM-2 algorithm
func (s *SpacedRepetitionService) CalculateNextInterval(
	progress *models.UserNodeProgress,
	quality int,
	currentTime time.Time,
) SRSResult {
	ef := progress.EasinessFactor
	interval := progress.IntervalDays
	reps := progress.Repetitions

	// Update easiness factor (EF cannot go below 1.3)
	ef = math.Max(1.3, ef+(0.1-float64(5-quality)*(0.08+float64(5-quality)*0.02)))

	// Calculate next interval
	if quality < 3 {
		// Failed review - restart
		reps = 0
		interval = 1
	} else {
		// Successful review
		reps++
		if reps == 1 {
			interval = 1
		} else if reps == 2 {
			interval = 6
		} else {
			interval = math.Round(interval * ef)
		}
	}

	// Calculate next review date
	nextReview := currentTime.AddDate(0, 0, int(interval))

	return SRSResult{
		EasinessFactor: ef,
		IntervalDays:   interval,
		Repetitions:    reps,
		NextReview:     nextReview,
	}
}

// ApplyPartialCredit applies partial credit from implicit reviews
func (s *SpacedRepetitionService) ApplyPartialCredit(
	progress *models.UserNodeProgress,
	credit float64,
) (accumulatedCredit float64, reviewsCompleted int) {
	newCredit := progress.AccumulatedCredit + credit
	reviewsCompleted = int(math.Floor(math.Abs(newCredit)))
	remainingCredit := newCredit - float64(reviewsCompleted)*math.Copysign(1, newCredit)

	// Clamp to [-1.0, 1.0]
	remainingCredit = math.Max(-1.0, math.Min(1.0, remainingCredit))

	return remainingCredit, reviewsCompleted
}

// CreditPropagationService handles credit flow between nodes
type CreditPropagationService struct{}

func NewCreditPropagationService() *CreditPropagationService {
	return &CreditPropagationService{}
}

// GraphNode represents a node in the knowledge graph
type GraphNode struct {
	ID            uint
	Type          string
	Prerequisites []GraphEdge
	Dependents    []GraphEdge
}

// GraphEdge represents an edge in the knowledge graph
type GraphEdge struct {
	ID     uint
	Type   string
	Weight float64
}

// CreditPropagationResult represents the result of credit propagation
type CreditPropagationResult struct {
	Credits []models.CreditUpdate
}

const (
	// Constants for credit propagation
	CreditThreshold = 0.01
	MaxDistance     = 6
)

// PropagateCredit calculates credit flow from an explicit review
func (c *CreditPropagationService) PropagateCredit(
    reviewedNodeID uint,
    reviewedNodeType string,
    success bool,
    graph map[string]*GraphNode,
) []models.CreditUpdate {
    credits := []models.CreditUpdate{}

    // Always include the explicitly reviewed node
    credits = append(credits, models.CreditUpdate{
        NodeID:   reviewedNodeID,
        NodeType: reviewedNodeType,
        Credit:   1.0,
        Type:     "explicit",
    })

    nodeKey := c.getNodeKey(reviewedNodeID, reviewedNodeType)
    startNode, exists := graph[nodeKey]
    if !exists {
        return credits
    }

    // Perform BFS-based propagation for implicit credits
    implicit := c.bfsPropagate(startNode, success, graph)
    // Append implicit credits after the explicit one
    credits = append(credits, implicit...)

    return credits
}

// bfsPropagate performs breadth-first propagation of implicit credits.
// It guarantees that nodes at shorter distances are processed first and
// aggregates contributions from multiple shortest paths at the same distance.
func (c *CreditPropagationService) bfsPropagate(
    start *GraphNode,
    success bool,
    graph map[string]*GraphNode,
) []models.CreditUpdate {
    type entry struct {
        id         uint
        t          string
        distance   int
        pathWeight float64
    }

    // Helper to get next edges based on direction
    nextEdges := func(n *GraphNode) []GraphEdge {
        if success {
            return n.Prerequisites
        }
        return n.Dependents
    }

    // Track best (shortest) distance discovered per node
    bestDist := make(map[string]int)
    // Track single contributing path weight for a node at the best distance.
    // To avoid multi-parent amplification, we keep only one contribution per node.
    bestWeight := make(map[string]float64)
    // Maintain discovery order to output credits in BFS order
    discovery := make([]string, 0, 64)

    // Prevent the explicitly reviewed start node from receiving implicit credit
    // via cycles by pre-marking it as seen at distance 0.
    startKey := c.getNodeKey(start.ID, start.Type)
    bestDist[startKey] = 0
    bestWeight[startKey] = 0

    // Initialize queue with immediate neighbors
    q := make([]entry, 0, 64)
    for _, e := range nextEdges(start) {
        // Start with d=2 for immediate neighbors so that
        // amount = 1/d yields 1/2 for distance-1 = 1.
        // This avoids any chance of giving full (1.0) credit to neighbors.
        q = append(q, entry{id: e.ID, t: e.Type, distance: 2, pathWeight: e.Weight})
    }

    for len(q) > 0 {
        cur := q[0]
        q = q[1:]

        // Maintain MaxDistance as a cap on graph distance.
        // Our 'distance' here is actually (graphDistance + 1), i.e., the denominator d.
        // So we compare (cur.distance - 1) to MaxDistance.
        if cur.distance-1 > MaxDistance {
            continue
        }

        key := c.getNodeKey(cur.id, cur.t)
        // First time discovered: set distance, initialize weight, and enqueue neighbors
        d, seen := bestDist[key]
        if !seen {
            bestDist[key] = cur.distance
            bestWeight[key] = cur.pathWeight
            discovery = append(discovery, key)

            // Enqueue neighbors for further expansion
            if node, ok := graph[key]; ok {
                for _, e := range nextEdges(node) {
                    q = append(q, entry{
                        id:         e.ID,
                        t:          e.Type,
                        distance:   cur.distance + 1, // increment denominator d by 1 per hop
                        pathWeight: cur.pathWeight * e.Weight,
                    })
                }
            }
            continue
        }

        // If we encounter another shortest path of equal distance, keep only a single
        // contribution. Choose the path with the larger absolute weight to avoid
        // under-crediting strongly connected paths while preventing accumulation.
        if cur.distance == d {
            if math.Abs(cur.pathWeight) > math.Abs(bestWeight[key]) {
                bestWeight[key] = cur.pathWeight
            }
            continue
        }

        // If the path is longer than the best known, ignore (BFS ensures this mostly)
    }

    // Build implicit credit updates in BFS discovery order
    credits := make([]models.CreditUpdate, 0, len(discovery))
    for _, key := range discovery {
        id, t := c.parseNodeKey(key)
        distance := bestDist[key]
        weight := bestWeight[key]

        // distance here is the denominator d = (graph distance + 1).
        amount := weight / float64(distance)
        if math.Abs(amount) < CreditThreshold {
            continue
        }
        if !success {
            amount = -amount
        }
        credits = append(credits, models.CreditUpdate{
            NodeID:   id,
            NodeType: t,
            Credit:   amount,
            Type:     "implicit",
        })
    }

    return credits
}

// BuildGraph creates a graph representation from prerequisites
func (c *CreditPropagationService) BuildGraph(prerequisites []models.NodePrerequisite) map[string]*GraphNode {
	graph := make(map[string]*GraphNode)

	// Initialize all nodes
	nodeSet := make(map[string]bool)
	for _, prereq := range prerequisites {
		nodeKey := c.getNodeKey(prereq.NodeID, prereq.NodeType)
		prereqKey := c.getNodeKey(prereq.PrerequisiteID, prereq.PrerequisiteType)
		nodeSet[nodeKey] = true
		nodeSet[prereqKey] = true
	}

	for nodeKey := range nodeSet {
		nodeID, nodeType := c.parseNodeKey(nodeKey)
		graph[nodeKey] = &GraphNode{
			ID:            nodeID,
			Type:          nodeType,
			Prerequisites: []GraphEdge{},
			Dependents:    []GraphEdge{},
		}
	}

	// Build edges
	for _, prereq := range prerequisites {
		nodeKey := c.getNodeKey(prereq.NodeID, prereq.NodeType)
		prereqKey := c.getNodeKey(prereq.PrerequisiteID, prereq.PrerequisiteType)

		if node, exists := graph[nodeKey]; exists {
			node.Prerequisites = append(node.Prerequisites, GraphEdge{
				ID:     prereq.PrerequisiteID,
				Type:   prereq.PrerequisiteType,
				Weight: prereq.Weight,
			})
		}

		if prereqNode, exists := graph[prereqKey]; exists {
			prereqNode.Dependents = append(prereqNode.Dependents, GraphEdge{
				ID:     prereq.NodeID,
				Type:   prereq.NodeType,
				Weight: prereq.Weight,
			})
		}
	}

	return graph
}

// getNodeKey creates a unique key for a node
func (c *CreditPropagationService) getNodeKey(nodeID uint, nodeType string) string {
	return fmt.Sprintf("%s_%d", nodeType, nodeID)
}

// parseNodeKey parses a node key back to ID and type
func (c *CreditPropagationService) parseNodeKey(key string) (uint, string) {
	parts := strings.Split(key, "_")
	if len(parts) != 2 {
		return 0, ""
	}
	
	id, err := strconv.ParseUint(parts[1], 10, 32)
	if err != nil {
		return 0, ""
	}
	
	return uint(id), parts[0]
}

// ReviewOptimizationService handles optimal review ordering
type ReviewOptimizationService struct {
	creditService *CreditPropagationService
}

func NewReviewOptimizationService() *ReviewOptimizationService {
	return &ReviewOptimizationService{
		creditService: NewCreditPropagationService(),
	}
}

// NodeScore represents a node with its optimization score
type NodeScore struct {
	NodeID           uint
	NodeType         string
	Impact           float64
	DistanceFromRoot int
}

// OptimizeReviewOrder sorts nodes for optimal review sequence
func (r *ReviewOptimizationService) OptimizeReviewOrder(
	dueNodes []models.NodeProgress,
	graph map[string]*GraphNode,
) []models.NodeProgress {
	if len(dueNodes) == 0 {
		return dueNodes
	}

	dueSet := make(map[string]bool)
	for _, node := range dueNodes {
		key := r.creditService.getNodeKey(node.NodeID, node.NodeType)
		dueSet[key] = true
	}

	scores := make([]NodeScore, 0, len(dueNodes))

	for _, node := range dueNodes {
		// Calculate impact (credit propagated to other due nodes)
		credits := r.creditService.PropagateCredit(node.NodeID, node.NodeType, true, graph)
		impact := 0.0
		
		for _, credit := range credits {
			creditKey := r.creditService.getNodeKey(credit.NodeID, credit.NodeType)
			if dueSet[creditKey] && credit.Type == "implicit" && credit.Credit > 0 {
				impact += credit.Credit
			}
		}

		// Calculate distance from root
		distance := r.calculateDistanceFromRoot(node.NodeID, node.NodeType, graph)

		scores = append(scores, NodeScore{
			NodeID:           node.NodeID,
			NodeType:         node.NodeType,
			Impact:           impact,
			DistanceFromRoot: distance,
		})
	}

	// Sort by impact (desc), then by distance from root (desc)
	sort.Slice(scores, func(i, j int) bool {
		if math.Abs(scores[i].Impact-scores[j].Impact) > 0.1 {
			return scores[i].Impact > scores[j].Impact
		}
		return scores[i].DistanceFromRoot > scores[j].DistanceFromRoot
	})

	// Reorder original nodes based on scores
	result := make([]models.NodeProgress, 0, len(dueNodes))
	nodeMap := make(map[string]models.NodeProgress)
	
	for _, node := range dueNodes {
		key := r.creditService.getNodeKey(node.NodeID, node.NodeType)
		nodeMap[key] = node
	}

	for _, score := range scores {
		key := r.creditService.getNodeKey(score.NodeID, score.NodeType)
		if node, exists := nodeMap[key]; exists {
			result = append(result, node)
		}
	}

	return result
}

// calculateDistanceFromRoot finds the longest prerequisite path
func (r *ReviewOptimizationService) calculateDistanceFromRoot(
	nodeID uint,
	nodeType string,
	graph map[string]*GraphNode,
) int {
	visited := make(map[string]bool)
	return r.dfsMaxDepth(nodeID, nodeType, 0, graph, visited)
}

// dfsMaxDepth calculates maximum depth using DFS
func (r *ReviewOptimizationService) dfsMaxDepth(
	nodeID uint,
	nodeType string,
	currentDepth int,
	graph map[string]*GraphNode,
	visited map[string]bool,
) int {
	nodeKey := r.creditService.getNodeKey(nodeID, nodeType)
	if visited[nodeKey] {
		return currentDepth
	}

	visited[nodeKey] = true
	defer func() { delete(visited, nodeKey) }()

	node, exists := graph[nodeKey]
	if !exists || len(node.Prerequisites) == 0 {
		return currentDepth
	}

	maxDepth := currentDepth
	for _, prereq := range node.Prerequisites {
		depth := r.dfsMaxDepth(prereq.ID, prereq.Type, currentDepth+1, graph, visited)
		if depth > maxDepth {
			maxDepth = depth
		}
	}

	return maxDepth
}
