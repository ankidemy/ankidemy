package services

import (
	"math/rand"
	"testing"

	"ankidemy/server/models"
)

// Synthetic graph generators for profiling. Node IDs are 1-based.

// layeredDAG builds a DAG of `layers` layers with `width` nodes per layer.
// Each node depends on `fanout` random nodes from the previous layer.
// This mirrors real knowledge graphs (concept hierarchies with cross links).
func layeredDAG(layers, width, fanout int, nodeType string) []models.NodePrerequisite {
	rng := rand.New(rand.NewSource(42))
	var prereqs []models.NodePrerequisite
	for layer := 1; layer < layers; layer++ {
		for w := 0; w < width; w++ {
			nodeID := uint(layer*width + w + 1)
			seen := map[uint]bool{}
			for f := 0; f < fanout; f++ {
				prereqID := uint((layer-1)*width + rng.Intn(width) + 1)
				if seen[prereqID] {
					continue
				}
				seen[prereqID] = true
				prereqs = append(prereqs, models.NodePrerequisite{
					NodeID:           nodeID,
					NodeType:         nodeType,
					PrerequisiteID:   prereqID,
					PrerequisiteType: nodeType,
					Weight:           0.5 + rng.Float64()*0.5,
				})
			}
		}
	}
	return prereqs
}

// denseLayeredDAG connects EVERY node to EVERY node in the previous layer.
// The number of distinct paths from the top layer to the bottom grows as
// width^layers, which is the worst case for path-enumerating algorithms.
func denseLayeredDAG(layers, width int) []models.NodePrerequisite {
	var prereqs []models.NodePrerequisite
	for layer := 1; layer < layers; layer++ {
		for w := 0; w < width; w++ {
			nodeID := uint(layer*width + w + 1)
			for p := 0; p < width; p++ {
				prereqs = append(prereqs, models.NodePrerequisite{
					NodeID:           nodeID,
					NodeType:         "definition",
					PrerequisiteID:   uint((layer-1)*width + p + 1),
					PrerequisiteType: "definition",
					Weight:           1.0,
				})
			}
		}
	}
	return prereqs
}

func dueNodesForGraph(layers, width int, everyNth int) []models.NodeProgress {
	var due []models.NodeProgress
	total := layers * width
	for i := 1; i <= total; i += everyNth {
		due = append(due, models.NodeProgress{NodeID: uint(i), NodeType: "definition"})
	}
	return due
}

func BenchmarkBuildGraph(b *testing.B) {
	sizes := []struct {
		name                  string
		layers, width, fanout int
	}{
		{"500n", 10, 50, 3},
		{"2000n", 20, 100, 3},
		{"10000n", 50, 200, 3},
	}
	for _, size := range sizes {
		prereqs := layeredDAG(size.layers, size.width, size.fanout, "definition")
		c := NewCreditPropagationService()
		b.Run(size.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				g := c.BuildGraph(prereqs)
				if len(g) == 0 {
					b.Fatal("empty graph")
				}
			}
		})
	}
}

func BenchmarkPropagateCredit(b *testing.B) {
	sizes := []struct {
		name                  string
		layers, width, fanout int
	}{
		{"2000n", 20, 100, 3},
		{"10000n", 50, 200, 3},
	}
	for _, size := range sizes {
		prereqs := layeredDAG(size.layers, size.width, size.fanout, "definition")
		c := NewCreditPropagationService()
		graph := c.BuildGraph(prereqs)
		// Review a node in the last layer so propagation has depth to work with.
		reviewed := uint(size.layers * size.width)
		b.Run(size.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				credits := c.PropagateCredit(reviewed, "definition", true, graph)
				if len(credits) == 0 {
					b.Fatal("no credits")
				}
			}
		})
	}
}

func BenchmarkOptimizeReviewOrder(b *testing.B) {
	cases := []struct {
		name                  string
		layers, width, fanout int
		everyNth              int
	}{
		{"500n_50due", 10, 50, 3, 10},
		{"2000n_200due", 20, 100, 3, 10},
		{"10000n_500due", 50, 200, 3, 20},
	}
	for _, tc := range cases {
		prereqs := layeredDAG(tc.layers, tc.width, tc.fanout, "definition")
		r := NewReviewOptimizationService()
		graph := r.creditService.BuildGraph(prereqs)
		due := dueNodesForGraph(tc.layers, tc.width, tc.everyNth)
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				ordered := r.OptimizeReviewOrder(due, graph)
				if len(ordered) != len(due) {
					b.Fatalf("expected %d, got %d", len(due), len(ordered))
				}
			}
		})
	}
}

// BenchmarkOptimizeReviewOrderDense exposes exponential blowups in
// longest-path computation: a dense layered DAG has width^layers paths.
// Keep sizes tiny; a path-enumerating implementation will explode anyway.
func BenchmarkOptimizeReviewOrderDense(b *testing.B) {
	cases := []struct {
		name          string
		layers, width int
	}{
		{"dense_6x4", 6, 4},   // 4^6 ≈ 4k paths
		{"dense_8x4", 8, 4},   // 4^8 ≈ 65k paths
		{"dense_10x5", 10, 5}, // 5^10 ≈ 9.7M paths
	}
	for _, tc := range cases {
		prereqs := denseLayeredDAG(tc.layers, tc.width)
		r := NewReviewOptimizationService()
		graph := r.creditService.BuildGraph(prereqs)
		due := dueNodesForGraph(tc.layers, tc.width, 1)
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				ordered := r.OptimizeReviewOrder(due, graph)
				if len(ordered) != len(due) {
					b.Fatalf("expected %d, got %d", len(due), len(ordered))
				}
			}
		})
	}
}

func BenchmarkCalculateDistanceFromRootDense(b *testing.B) {
	cases := []struct {
		name          string
		layers, width int
	}{
		{"dense_6x4", 6, 4},
		{"dense_8x4", 8, 4},
		{"dense_10x5", 10, 5},
	}
	for _, tc := range cases {
		prereqs := denseLayeredDAG(tc.layers, tc.width)
		r := NewReviewOptimizationService()
		graph := r.creditService.BuildGraph(prereqs)
		// The deepest node has the largest search space.
		deepest := uint(tc.layers * tc.width)
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				d := r.calculateDistanceFromRoot(deepest, "definition", graph)
				if d != tc.layers-1 {
					b.Fatalf("expected depth %d, got %d", tc.layers-1, d)
				}
			}
		})
	}
}
