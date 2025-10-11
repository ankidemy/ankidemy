package services

import (
    "math"
    "testing"
    "myapp/server/models"
)

// helper to find a credit update by node id/type and return its index and value
func findCredit(credits []models.CreditUpdate, id uint, t string) (int, models.CreditUpdate, bool) {
    for i, c := range credits {
        if c.NodeID == id && c.NodeType == t {
            return i, c, true
        }
    }
    return -1, models.CreditUpdate{}, false
}

// Test that BFS propagation gives only a single contribution per node (no multi-parent aggregation)
// and emits credits in breadth-first order (nearer nodes before farther ones).
func TestBFSPropagateSingleContributionPerNode(t *testing.T) {
    // Graph structure (all weights = 1.0), node type = "definition":
    //   A -> B, A -> C, B -> D, C -> D
    // Success=true should propagate to prerequisites: A's prerequisites are B and C; their prerequisite is D.
    // Distances from A: B=1, C=1, D=2 (via two shortest paths A-B-D and A-C-D)
    A, B, C, D := uint(1), uint(2), uint(3), uint(4)
    prereqs := []models.NodePrerequisite{
        {NodeID: A, NodeType: "definition", PrerequisiteID: B, PrerequisiteType: "definition", Weight: 1.0},
        {NodeID: A, NodeType: "definition", PrerequisiteID: C, PrerequisiteType: "definition", Weight: 1.0},
        {NodeID: B, NodeType: "definition", PrerequisiteID: D, PrerequisiteType: "definition", Weight: 1.0},
        {NodeID: C, NodeType: "definition", PrerequisiteID: D, PrerequisiteType: "definition", Weight: 1.0},
    }

    svc := NewCreditPropagationService()
    graph := svc.BuildGraph(prereqs)

    credits := svc.PropagateCredit(A, "definition", true, graph)

    // Expect explicit credit for A
    if _, c, ok := findCredit(credits, A, "definition"); !ok || c.Type != "explicit" || math.Abs(c.Credit-1.0) > 1e-9 {
        t.Fatalf("expected explicit credit=1.0 for A; got credit=%v type=%s ok=%v", c.Credit, c.Type, ok)
    }

    // Expect implicit credits for B and C at distance 1: amount = 1/(1+1) = 0.5
    _, b, okB := findCredit(credits, B, "definition")
    _, c, okC := findCredit(credits, C, "definition")
    if !okB || b.Type != "implicit" || math.Abs(b.Credit-0.5) > 1e-9 {
        t.Fatalf("expected implicit credit 0.5 for B, got %+v", b)
    }
    if !okC || c.Type != "implicit" || math.Abs(c.Credit-0.5) > 1e-9 {
        t.Fatalf("expected implicit credit 0.5 for C, got %+v", c)
    }

    // Expect D to receive ONLY ONE contribution despite two shortest paths at distance 2:
    // contribution = 1/(1+2) = 1/3.
    idxD, d, okD := findCredit(credits, D, "definition")
    if !okD || d.Type != "implicit" || math.Abs(d.Credit-(1.0/3.0)) > 1e-9 {
        t.Fatalf("expected implicit single-path credit 1/3 for D, got %+v", d)
    }

    // BFS ordering: D should appear after B and C in the credits slice
    idxB, _, _ := findCredit(credits, B, "definition")
    idxC, _, _ := findCredit(credits, C, "definition")
    if !(idxB > 0 && idxC > 0 && idxD > 0) || !(idxD > idxB && idxD > idxC) {
        t.Fatalf("expected BFS order with D after B and C; got indices B=%d, C=%d, D=%d", idxB, idxC, idxD)
    }
}

// Ensure cycles do not give implicit credit to the explicitly reviewed node
// and that each node is credited at most once per propagation.
func TestBFSPropagateSkipsStartNodeAndHandlesCycles(t *testing.T) {
    // Cycle: A -> B -> C -> A (weights 1.0)
    A, B, C := uint(10), uint(11), uint(12)
    prereqs := []models.NodePrerequisite{
        {NodeID: A, NodeType: "definition", PrerequisiteID: B, PrerequisiteType: "definition", Weight: 1.0},
        {NodeID: B, NodeType: "definition", PrerequisiteID: C, PrerequisiteType: "definition", Weight: 1.0},
        {NodeID: C, NodeType: "definition", PrerequisiteID: A, PrerequisiteType: "definition", Weight: 1.0},
    }

    svc := NewCreditPropagationService()
    graph := svc.BuildGraph(prereqs)

    credits := svc.PropagateCredit(A, "definition", true, graph)

    // Start node A should have only explicit credit
    countA := 0
    for _, c := range credits {
        if c.NodeID == A && c.NodeType == "definition" {
            if c.Type == "explicit" { countA++ }
            if c.Type == "implicit" { t.Fatalf("start node should not receive implicit credit") }
        }
    }
    if countA != 1 {
        t.Fatalf("expected exactly one explicit credit for A; got %d occurrences", countA)
    }

    // B should appear once with credit = 1/2
    _, b, okB := findCredit(credits, B, "definition")
    if !okB || b.Type != "implicit" || math.Abs(b.Credit-0.5) > 1e-9 {
        t.Fatalf("expected implicit credit 0.5 for B in cycle, got %+v", b)
    }

    // C should appear once with credit = 1/3 (distance denominator d=3)
    _, cc, okC := findCredit(credits, C, "definition")
    if !okC || cc.Type != "implicit" || math.Abs(cc.Credit-(1.0/3.0)) > 1e-9 {
        t.Fatalf("expected implicit credit 1/3 for C in cycle, got %+v", cc)
    }
}

// Ensure edge weights scale implicit credit amounts.
func TestBFSPropagateRespectsEdgeWeights(t *testing.T) {
    // A -> B (w=0.75), A -> C (w=0.5)
    A, B, C := uint(20), uint(21), uint(22)
    prereqs := []models.NodePrerequisite{
        {NodeID: A, NodeType: "definition", PrerequisiteID: B, PrerequisiteType: "definition", Weight: 0.75},
        {NodeID: A, NodeType: "definition", PrerequisiteID: C, PrerequisiteType: "definition", Weight: 0.5},
    }

    svc := NewCreditPropagationService()
    graph := svc.BuildGraph(prereqs)
    credits := svc.PropagateCredit(A, "definition", true, graph)

    // B should receive 0.75 * 1/2 = 0.375
    _, b, okB := findCredit(credits, B, "definition")
    if !okB || b.Type != "implicit" || math.Abs(b.Credit-0.375) > 1e-9 {
        t.Fatalf("expected implicit credit 0.375 for B, got %+v", b)
    }

    // C should receive 0.5 * 1/2 = 0.25
    _, c, okC := findCredit(credits, C, "definition")
    if !okC || c.Type != "implicit" || math.Abs(c.Credit-0.25) > 1e-9 {
        t.Fatalf("expected implicit credit 0.25 for C, got %+v", c)
    }
}
