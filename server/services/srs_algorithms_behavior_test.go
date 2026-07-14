package services

import (
	"math"
	"testing"

	"ankidemy/server/models"
)

// These tests pin down the observable behavior of the SRS graph algorithms
// (credit propagation and review ordering) so that performance refactors can
// be validated against them.

func prereq(nodeID uint, nodeType string, prereqID uint, prereqType string, weight float64) models.NodePrerequisite {
	return models.NodePrerequisite{
		NodeID:           nodeID,
		NodeType:         nodeType,
		PrerequisiteID:   prereqID,
		PrerequisiteType: prereqType,
		Weight:           weight,
	}
}

func creditByNode(credits []models.CreditUpdate) map[uint]models.CreditUpdate {
	out := make(map[uint]models.CreditUpdate, len(credits))
	for _, c := range credits {
		out[c.NodeID] = c
	}
	return out
}

// Chain: 3 depends on 2, 2 depends on 1. Reviewing 3 successfully sends
// implicit credit up the prerequisite chain with amount weight/(distance+1).
func TestPropagateCreditChain(t *testing.T) {
	c := NewCreditPropagationService()
	prereqs := []models.NodePrerequisite{
		prereq(2, "definition", 1, "definition", 1.0),
		prereq(3, "definition", 2, "definition", 1.0),
	}
	graph := c.BuildGraph(prereqs)

	credits := c.PropagateCredit(3, "definition", true, graph)
	if len(credits) != 3 {
		t.Fatalf("expected 3 credits, got %d: %+v", len(credits), credits)
	}
	byNode := creditByNode(credits)

	if got := byNode[3]; got.Credit != 1.0 || got.Type != "explicit" {
		t.Errorf("node 3: expected explicit 1.0, got %+v", got)
	}
	if got := byNode[2]; math.Abs(got.Credit-0.5) > 1e-9 || got.Type != "implicit" {
		t.Errorf("node 2: expected implicit 0.5, got %+v", got)
	}
	if got := byNode[1]; math.Abs(got.Credit-1.0/3.0) > 1e-9 || got.Type != "implicit" {
		t.Errorf("node 1: expected implicit 1/3, got %+v", got)
	}

	// Failure flows toward dependents (none here beyond the chain downward).
	credits = c.PropagateCredit(1, "definition", false, graph)
	byNode = creditByNode(credits)
	if got := byNode[2]; math.Abs(got.Credit+0.5) > 1e-9 {
		t.Errorf("node 2 on failure: expected implicit -0.5, got %+v", got)
	}
	if got := byNode[3]; math.Abs(got.Credit+1.0/3.0) > 1e-9 {
		t.Errorf("node 3 on failure: expected implicit -1/3, got %+v", got)
	}
}

// Diamond: 4 depends on 2 and 3 (weights 0.4 / 0.9), both depend on 1.
// Equal-distance paths keep the single largest-|weight| contribution.
func TestPropagateCreditDiamondKeepsMaxWeightPath(t *testing.T) {
	c := NewCreditPropagationService()
	prereqs := []models.NodePrerequisite{
		prereq(2, "definition", 1, "definition", 0.4),
		prereq(3, "definition", 1, "definition", 0.9),
		prereq(4, "definition", 2, "definition", 0.4),
		prereq(4, "definition", 3, "definition", 0.9),
	}
	graph := c.BuildGraph(prereqs)

	credits := c.PropagateCredit(4, "definition", true, graph)
	byNode := creditByNode(credits)

	if got := byNode[2]; math.Abs(got.Credit-0.4/2) > 1e-9 {
		t.Errorf("node 2: expected 0.2, got %+v", got)
	}
	if got := byNode[3]; math.Abs(got.Credit-0.9/2) > 1e-9 {
		t.Errorf("node 3: expected 0.45, got %+v", got)
	}
	// Node 1 at distance 2 (denominator 3): two paths 0.4*0.4=0.16 and
	// 0.9*0.9=0.81; the larger absolute path weight wins.
	if got := byNode[1]; math.Abs(got.Credit-0.81/3) > 1e-9 {
		t.Errorf("node 1: expected 0.27, got %+v", got)
	}
}

// Credits below CreditThreshold (0.01) are dropped.
func TestPropagateCreditThreshold(t *testing.T) {
	c := NewCreditPropagationService()
	prereqs := []models.NodePrerequisite{
		prereq(2, "definition", 1, "definition", 0.019),
	}
	graph := c.BuildGraph(prereqs)
	credits := c.PropagateCredit(2, "definition", true, graph)
	// 0.019/2 = 0.0095 < 0.01 → only the explicit credit remains.
	if len(credits) != 1 {
		t.Fatalf("expected only explicit credit, got %+v", credits)
	}
}

// Propagation stops after MaxDistance hops.
func TestPropagateCreditMaxDistance(t *testing.T) {
	c := NewCreditPropagationService()
	var prereqs []models.NodePrerequisite
	// Chain 1 <- 2 <- ... <- 10
	for i := uint(2); i <= 10; i++ {
		prereqs = append(prereqs, prereq(i, "definition", i-1, "definition", 1.0))
	}
	graph := c.BuildGraph(prereqs)
	credits := c.PropagateCredit(10, "definition", true, graph)
	byNode := creditByNode(credits)

	// Nodes 9..4 are within MaxDistance (6 hops). Node 3 is 7 hops away.
	if _, ok := byNode[4]; !ok {
		t.Errorf("node 4 (distance 6) should receive credit")
	}
	if _, ok := byNode[3]; ok {
		t.Errorf("node 3 (distance 7) should NOT receive credit, got %+v", byNode[3])
	}
	if got := byNode[4]; math.Abs(got.Credit-1.0/7.0) > 1e-9 {
		t.Errorf("node 4: expected 1/7, got %+v", got)
	}
}

// Cycles must not feed credit back into the reviewed node and must terminate.
func TestPropagateCreditCycleSafe(t *testing.T) {
	c := NewCreditPropagationService()
	prereqs := []models.NodePrerequisite{
		prereq(1, "definition", 2, "definition", 1.0),
		prereq(2, "definition", 3, "definition", 1.0),
		prereq(3, "definition", 1, "definition", 1.0),
	}
	graph := c.BuildGraph(prereqs)
	credits := c.PropagateCredit(1, "definition", true, graph)
	byNode := creditByNode(credits)
	if got := byNode[1]; got.Type != "explicit" {
		t.Errorf("node 1 must only get the explicit credit, got %+v", got)
	}
	if got := byNode[2]; math.Abs(got.Credit-0.5) > 1e-9 {
		t.Errorf("node 2: expected 0.5, got %+v", got)
	}
	if got := byNode[3]; math.Abs(got.Credit-1.0/3.0) > 1e-9 {
		t.Errorf("node 3: expected 1/3, got %+v", got)
	}
}

// Reviewing an exercise falls back to the meta_exercise node in the graph,
// and implicit credits must carry usable node IDs/types for meta_* nodes.
func TestPropagateCreditMetaTypeFallbackAndKeys(t *testing.T) {
	c := NewCreditPropagationService()
	prereqs := []models.NodePrerequisite{
		prereq(20, "meta_exercise", 10, "meta_definition", 1.0),
		prereq(10, "meta_definition", 5, "meta_definition", 1.0),
	}
	graph := c.BuildGraph(prereqs)

	// Node type "exercise" falls back to "meta_exercise".
	credits := c.PropagateCredit(20, "exercise", true, graph)
	if len(credits) != 3 {
		t.Fatalf("expected 3 credits (explicit + 2 implicit), got %+v", credits)
	}
	byNode := creditByNode(credits)
	if got := byNode[10]; got.NodeType != "meta_definition" || math.Abs(got.Credit-0.5) > 1e-9 {
		t.Errorf("node 10: expected meta_definition 0.5, got %+v", got)
	}
	if got := byNode[5]; got.NodeType != "meta_definition" || math.Abs(got.Credit-1.0/3.0) > 1e-9 {
		t.Errorf("node 5: expected meta_definition 1/3, got %+v", got)
	}
}

// Review ordering: nodes whose successful review boosts more due nodes come
// first; ties (impact within 0.1) are broken by longest prerequisite chain.
func TestOptimizeReviewOrderImpactAndDepth(t *testing.T) {
	r := NewReviewOptimizationService()
	c := r.creditService

	// 1 <- 2 <- 3 (chain), plus isolated node 4.
	prereqs := []models.NodePrerequisite{
		prereq(2, "definition", 1, "definition", 1.0),
		prereq(3, "definition", 2, "definition", 1.0),
	}
	graph := c.BuildGraph(prereqs)

	due := []models.NodeProgress{
		{NodeID: 1, NodeType: "definition"},
		{NodeID: 3, NodeType: "definition"},
		{NodeID: 4, NodeType: "definition"},
	}
	ordered := r.OptimizeReviewOrder(due, graph)
	if len(ordered) != 3 {
		t.Fatalf("expected 3 ordered nodes, got %d", len(ordered))
	}
	// Reviewing 3 pushes credit to 1 (due) → impact ≈ 1/3. Nodes 1 and 4 have
	// impact 0. Within the tie, 1 and 4 both have depth 0... node 3 has depth 2.
	if ordered[0].NodeID != 3 {
		t.Errorf("expected node 3 first (highest impact), got %d", ordered[0].NodeID)
	}
}

func TestCalculateDistanceFromRootDAG(t *testing.T) {
	r := NewReviewOptimizationService()
	c := r.creditService

	// Diamond with a tail: 5 <- 4 <- {2,3} <- 1  (edges: node depends on prereq)
	// distances (longest path following prerequisites):
	// node 1: 0; nodes 2,3: 1; node 4: 2; node 5: 3.
	prereqs := []models.NodePrerequisite{
		prereq(2, "definition", 1, "definition", 1.0),
		prereq(3, "definition", 1, "definition", 1.0),
		prereq(4, "definition", 2, "definition", 1.0),
		prereq(4, "definition", 3, "definition", 1.0),
		prereq(5, "definition", 4, "definition", 1.0),
	}
	graph := c.BuildGraph(prereqs)

	cases := map[uint]int{1: 0, 2: 1, 3: 1, 4: 2, 5: 3}
	for nodeID, want := range cases {
		got := r.calculateDistanceFromRoot(nodeID, "definition", graph)
		if got != want {
			t.Errorf("distance(node %d): want %d, got %d", nodeID, want, got)
		}
	}
}

func TestCalculateDistanceFromRootUnevenPaths(t *testing.T) {
	r := NewReviewOptimizationService()
	c := r.creditService

	// node 4 depends on 3 (which depends on 2, which depends on 1) and also
	// directly on 1: longest path from 4 is 3.
	prereqs := []models.NodePrerequisite{
		prereq(2, "definition", 1, "definition", 1.0),
		prereq(3, "definition", 2, "definition", 1.0),
		prereq(4, "definition", 3, "definition", 1.0),
		prereq(4, "definition", 1, "definition", 1.0),
	}
	graph := c.BuildGraph(prereqs)
	if got := r.calculateDistanceFromRoot(4, "definition", graph); got != 3 {
		t.Errorf("distance(node 4): want 3, got %d", got)
	}
}

func TestCalculateDistanceFromRootCycleTerminates(t *testing.T) {
	r := NewReviewOptimizationService()
	c := r.creditService

	prereqs := []models.NodePrerequisite{
		prereq(1, "definition", 2, "definition", 1.0),
		prereq(2, "definition", 1, "definition", 1.0),
		prereq(3, "definition", 1, "definition", 1.0),
	}
	graph := c.BuildGraph(prereqs)
	// Just require termination and a sane non-negative depth.
	if got := r.calculateDistanceFromRoot(3, "definition", graph); got < 1 {
		t.Errorf("distance(node 3) in cyclic graph: want >= 1, got %d", got)
	}
}

func TestApplyPartialCredit(t *testing.T) {
	s := NewSpacedRepetitionService()
	p := &models.UserNodeProgress{AccumulatedCredit: 0.8}
	remaining, completed := s.ApplyPartialCredit(p, 0.5)
	if completed != 1 || math.Abs(remaining-0.3) > 1e-9 {
		t.Errorf("expected 1 completed, 0.3 remaining; got %d, %f", completed, remaining)
	}

	p = &models.UserNodeProgress{AccumulatedCredit: -0.8}
	remaining, completed = s.ApplyPartialCredit(p, -0.5)
	if completed != 1 || math.Abs(remaining+0.3) > 1e-9 {
		t.Errorf("expected 1 completed, -0.3 remaining; got %d, %f", completed, remaining)
	}
}
