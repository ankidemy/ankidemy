package services

import (
	"encoding/json"
	"math"
	"sort"
	"time"

	"ankidemy/server/models"
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

const (
	defaultSRSIntervalMultiplier = 1.0
	defaultSRSFirstIntervalDays  = 1.0
	defaultSRSSecondIntervalDays = 6.0
	defaultSRSLapseIntervalDays  = 1.0
	defaultSRSMinEasinessFactor  = 1.3

	minSRSIntervalMultiplier = 0.25
	maxSRSIntervalMultiplier = 4.0
	minSRSIntervalDays       = 1.0
	maxSRSIntervalDays       = 120.0
	minSRSMinEasinessFactor  = 1.1
	maxSRSMinEasinessFactor  = 2.5

	// maxSRSComputedIntervalDays caps the final scheduled interval so every
	// node is reviewed at least once a year.
	maxSRSComputedIntervalDays = 366.0
)

// SRSAlgorithmConfig tunes SM-2 behavior per user/domain.
type SRSAlgorithmConfig struct {
	IntervalMultiplier float64
	FirstIntervalDays  float64
	SecondIntervalDays float64
	LapseIntervalDays  float64
	MinEasinessFactor  float64
}

type domainUserPreferences struct {
	Review *domainReviewPreferences `json:"review"`
}

type domainReviewPreferences struct {
	SRS *domainSRSPreferences `json:"srs"`
}

type domainSRSPreferences struct {
	IntervalMultiplier *float64 `json:"intervalMultiplier"`
	FirstIntervalDays  *float64 `json:"firstIntervalDays"`
	SecondIntervalDays *float64 `json:"secondIntervalDays"`
	LapseIntervalDays  *float64 `json:"lapseIntervalDays"`
	MinEasinessFactor  *float64 `json:"minEasinessFactor"`
}

func DefaultSRSAlgorithmConfig() SRSAlgorithmConfig {
	return SRSAlgorithmConfig{
		IntervalMultiplier: defaultSRSIntervalMultiplier,
		FirstIntervalDays:  defaultSRSFirstIntervalDays,
		SecondIntervalDays: defaultSRSSecondIntervalDays,
		LapseIntervalDays:  defaultSRSLapseIntervalDays,
		MinEasinessFactor:  defaultSRSMinEasinessFactor,
	}
}

// ParseSRSAlgorithmConfig extracts and clamps preferences.review.srs.
func ParseSRSAlgorithmConfig(preferences json.RawMessage) SRSAlgorithmConfig {
	config := DefaultSRSAlgorithmConfig()
	if len(preferences) == 0 {
		return config
	}

	var parsed domainUserPreferences
	if err := json.Unmarshal(preferences, &parsed); err != nil || parsed.Review == nil || parsed.Review.SRS == nil {
		return config
	}

	srsPrefs := parsed.Review.SRS
	config.IntervalMultiplier = getSRSFloatOrDefault(srsPrefs.IntervalMultiplier, config.IntervalMultiplier)
	config.FirstIntervalDays = getSRSFloatOrDefault(srsPrefs.FirstIntervalDays, config.FirstIntervalDays)
	config.SecondIntervalDays = getSRSFloatOrDefault(srsPrefs.SecondIntervalDays, config.SecondIntervalDays)
	config.LapseIntervalDays = getSRSFloatOrDefault(srsPrefs.LapseIntervalDays, config.LapseIntervalDays)
	config.MinEasinessFactor = getSRSFloatOrDefault(srsPrefs.MinEasinessFactor, config.MinEasinessFactor)

	return normalizeSRSAlgorithmConfig(config)
}

func getSRSFloatOrDefault(value *float64, fallback float64) float64 {
	if value == nil {
		return fallback
	}
	if math.IsNaN(*value) || math.IsInf(*value, 0) {
		return fallback
	}
	return *value
}

func clampSRSFloat(value float64, min float64, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func normalizeSRSAlgorithmConfig(config SRSAlgorithmConfig) SRSAlgorithmConfig {
	normalized := DefaultSRSAlgorithmConfig()

	normalized.IntervalMultiplier = clampSRSFloat(
		getSRSFloatOrDefault(&config.IntervalMultiplier, normalized.IntervalMultiplier),
		minSRSIntervalMultiplier,
		maxSRSIntervalMultiplier,
	)
	normalized.FirstIntervalDays = clampSRSFloat(
		getSRSFloatOrDefault(&config.FirstIntervalDays, normalized.FirstIntervalDays),
		minSRSIntervalDays,
		maxSRSIntervalDays,
	)
	normalized.SecondIntervalDays = clampSRSFloat(
		getSRSFloatOrDefault(&config.SecondIntervalDays, normalized.SecondIntervalDays),
		minSRSIntervalDays,
		maxSRSIntervalDays,
	)
	normalized.LapseIntervalDays = clampSRSFloat(
		getSRSFloatOrDefault(&config.LapseIntervalDays, normalized.LapseIntervalDays),
		minSRSIntervalDays,
		maxSRSIntervalDays,
	)
	normalized.MinEasinessFactor = clampSRSFloat(
		getSRSFloatOrDefault(&config.MinEasinessFactor, normalized.MinEasinessFactor),
		minSRSMinEasinessFactor,
		maxSRSMinEasinessFactor,
	)

	if normalized.SecondIntervalDays < normalized.FirstIntervalDays {
		normalized.SecondIntervalDays = normalized.FirstIntervalDays
	}

	return normalized
}

// CalculateNextInterval implements the SM-2 algorithm
func (s *SpacedRepetitionService) CalculateNextInterval(
	progress *models.UserNodeProgress,
	quality int,
	currentTime time.Time,
	config SRSAlgorithmConfig,
) SRSResult {
	config = normalizeSRSAlgorithmConfig(config)

	ef := progress.EasinessFactor
	interval := progress.IntervalDays
	reps := progress.Repetitions

	// Update easiness factor (EF cannot go below configured minimum)
	ef = math.Max(config.MinEasinessFactor, ef+(0.1-float64(5-quality)*(0.08+float64(5-quality)*0.02)))

	// Calculate next interval
	if quality < 3 {
		// Failed review - restart
		reps = 0
		interval = config.LapseIntervalDays
	} else {
		// Successful review
		reps++
		switch reps {
		case 1:
			interval = config.FirstIntervalDays
		case 2:
			interval = config.SecondIntervalDays
		default:
			interval = math.Round(interval * ef)
		}
	}
	interval = math.Max(1, math.Round(interval*config.IntervalMultiplier))
	interval = math.Min(interval, maxSRSComputedIntervalDays)

	// Calculate next review date
	nextReview := currentTime.AddDate(0, 0, int(interval))

	return SRSResult{
		EasinessFactor: ef,
		IntervalDays:   interval,
		Repetitions:    reps,
		NextReview:     nextReview,
	}
}

// CreditPropagationService handles credit flow between nodes
type CreditPropagationService struct{}

func NewCreditPropagationService() *CreditPropagationService {
	return &CreditPropagationService{}
}

// NodeKey identifies a node in the knowledge graph. Using a comparable
// struct (instead of formatted strings) keeps node types with underscores
// like "exercise" unambiguous and avoids per-lookup allocations.
type NodeKey struct {
	Type string
	ID   uint
}

func makeNodeKey(nodeID uint, nodeType string) NodeKey {
	return NodeKey{Type: nodeType, ID: nodeID}
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
	graph map[NodeKey]*GraphNode,
) []models.CreditUpdate {
	credits := []models.CreditUpdate{}

	// Always include the explicitly reviewed node
	credits = append(credits, models.CreditUpdate{
		NodeID:   reviewedNodeID,
		NodeType: reviewedNodeType,
		Credit:   1.0,
		Type:     "explicit",
	})

	startNode, exists := graph[makeNodeKey(reviewedNodeID, reviewedNodeType)]
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
	graph map[NodeKey]*GraphNode,
) []models.CreditUpdate {
	type entry struct {
		key        NodeKey
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
	bestDist := make(map[NodeKey]int)
	// Track single contributing path weight for a node at the best distance.
	// To avoid multi-parent amplification, we keep only one contribution per node.
	bestWeight := make(map[NodeKey]float64)
	// Maintain discovery order to output credits in BFS order
	discovery := make([]NodeKey, 0, 64)

	// Prevent the explicitly reviewed start node from receiving implicit credit
	// via cycles by pre-marking it as seen at distance 0.
	startKey := makeNodeKey(start.ID, start.Type)
	bestDist[startKey] = 0
	bestWeight[startKey] = 0

	// Initialize queue with immediate neighbors
	q := make([]entry, 0, 64)
	for _, e := range nextEdges(start) {
		// Start with d=2 for immediate neighbors so that
		// amount = 1/d yields 1/2 for distance-1 = 1.
		// This avoids any chance of giving full (1.0) credit to neighbors.
		q = append(q, entry{key: makeNodeKey(e.ID, e.Type), distance: 2, pathWeight: e.Weight})
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

		// First time discovered: set distance, initialize weight, and enqueue neighbors
		d, seen := bestDist[cur.key]
		if !seen {
			bestDist[cur.key] = cur.distance
			bestWeight[cur.key] = cur.pathWeight
			discovery = append(discovery, cur.key)

			// Enqueue neighbors for further expansion
			if node, ok := graph[cur.key]; ok {
				for _, e := range nextEdges(node) {
					q = append(q, entry{
						key:        makeNodeKey(e.ID, e.Type),
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
			if math.Abs(cur.pathWeight) > math.Abs(bestWeight[cur.key]) {
				bestWeight[cur.key] = cur.pathWeight
			}
			continue
		}

		// If the path is longer than the best known, ignore (BFS ensures this mostly)
	}

	// Build implicit credit updates in BFS discovery order
	credits := make([]models.CreditUpdate, 0, len(discovery))
	for _, key := range discovery {
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
			NodeID:   key.ID,
			NodeType: key.Type,
			Credit:   amount,
			Type:     "implicit",
		})
	}

	return credits
}

// BuildGraph creates a graph representation from prerequisites
func (c *CreditPropagationService) BuildGraph(prerequisites []models.NodePrerequisite) map[NodeKey]*GraphNode {
	graph := make(map[NodeKey]*GraphNode, len(prerequisites))

	ensureNode := func(key NodeKey) *GraphNode {
		if node, exists := graph[key]; exists {
			return node
		}
		node := &GraphNode{
			ID:            key.ID,
			Type:          key.Type,
			Prerequisites: []GraphEdge{},
			Dependents:    []GraphEdge{},
		}
		graph[key] = node
		return node
	}

	for _, prereq := range prerequisites {
		node := ensureNode(makeNodeKey(prereq.NodeID, prereq.NodeType))
		prereqNode := ensureNode(makeNodeKey(prereq.PrerequisiteID, prereq.PrerequisiteType))

		node.Prerequisites = append(node.Prerequisites, GraphEdge{
			ID:     prereq.PrerequisiteID,
			Type:   prereq.PrerequisiteType,
			Weight: prereq.Weight,
		})
		prereqNode.Dependents = append(prereqNode.Dependents, GraphEdge{
			ID:     prereq.NodeID,
			Type:   prereq.NodeType,
			Weight: prereq.Weight,
		})
	}

	return graph
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
	graph map[NodeKey]*GraphNode,
) []models.NodeProgress {
	if len(dueNodes) == 0 {
		return dueNodes
	}

	dueSet := make(map[NodeKey]bool)
	for _, node := range dueNodes {
		dueSet[makeNodeKey(node.NodeID, node.NodeType)] = true
	}

	// Longest-path depths are global node properties; share one memo across
	// all due nodes so the whole batch costs O(nodes + edges).
	depthMemo := make(map[NodeKey]int)

	scores := make([]NodeScore, 0, len(dueNodes))

	for _, node := range dueNodes {
		// Calculate impact (credit propagated to other due nodes)
		credits := r.creditService.PropagateCredit(node.NodeID, node.NodeType, true, graph)
		impact := 0.0

		for _, credit := range credits {
			creditKey := makeNodeKey(credit.NodeID, credit.NodeType)
			if dueSet[creditKey] && credit.Type == "implicit" && credit.Credit > 0 {
				impact += credit.Credit
			}
		}

		// Calculate distance from root
		distance := r.calculateDistanceFromRootMemo(node.NodeID, node.NodeType, graph, depthMemo)

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
	nodeMap := make(map[NodeKey]models.NodeProgress)

	for _, node := range dueNodes {
		nodeMap[makeNodeKey(node.NodeID, node.NodeType)] = node
	}

	for _, score := range scores {
		if node, exists := nodeMap[makeNodeKey(score.NodeID, score.NodeType)]; exists {
			result = append(result, node)
		}
	}

	return result
}

// calculateDistanceFromRoot finds the longest prerequisite path
func (r *ReviewOptimizationService) calculateDistanceFromRoot(
	nodeID uint,
	nodeType string,
	graph map[NodeKey]*GraphNode,
) int {
	return r.calculateDistanceFromRootMemo(nodeID, nodeType, graph, make(map[NodeKey]int))
}

func (r *ReviewOptimizationService) calculateDistanceFromRootMemo(
	nodeID uint,
	nodeType string,
	graph map[NodeKey]*GraphNode,
	memo map[NodeKey]int,
) int {
	key := makeNodeKey(nodeID, nodeType)
	return r.nodeDepth(key, graph, memo, make(map[NodeKey]bool))
}

// nodeDepth returns the longest prerequisite path below key, memoized.
// On acyclic graphs (the intended shape of prerequisite data) this matches
// exhaustive DFS exactly while running in O(nodes + edges) overall; nodes on
// the current recursion stack terminate a path, so cycles cannot loop or
// blow up the search space.
func (r *ReviewOptimizationService) nodeDepth(
	key NodeKey,
	graph map[NodeKey]*GraphNode,
	memo map[NodeKey]int,
	onStack map[NodeKey]bool,
) int {
	if depth, ok := memo[key]; ok {
		return depth
	}
	if onStack[key] {
		return 0
	}

	node, exists := graph[key]
	if !exists || len(node.Prerequisites) == 0 {
		memo[key] = 0
		return 0
	}

	onStack[key] = true
	maxDepth := 0
	for _, prereq := range node.Prerequisites {
		depth := 1 + r.nodeDepth(makeNodeKey(prereq.ID, prereq.Type), graph, memo, onStack)
		if depth > maxDepth {
			maxDepth = depth
		}
	}
	delete(onStack, key)

	memo[key] = maxDepth
	return maxDepth
}
