package services

import (
	"io"
	"log"
	"testing"

	"ankidemy/server/dao"
	"ankidemy/server/models"
)

// Benchmarks for the DB-bound knowledge-graph operations. All report
// queries/op next to ns/op. Sized at 1000 definitions + 500 exercises,
// fanout 3 (≈3350 prerequisite edges) unless noted.

const (
	benchDefs   = 1000
	benchExs    = 500
	benchFanout = 3
)

func silenceLogs(b *testing.B) {
	b.Helper()
	log.SetOutput(io.Discard)
	b.Cleanup(func() { log.SetOutput(io.Discard) })
}

func BenchmarkDBVisualGraph(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	graphDAO := dao.NewGraphDAO(db)

	runCounted(b, counter, func(i int) {
		graph, err := graphDAO.GetVisualGraph(seed.Domain.ID, seed.User.ID)
		if err != nil {
			b.Fatalf("GetVisualGraph: %v", err)
		}
		if len(graph.Nodes) < benchDefs {
			b.Fatalf("unexpected node count %d", len(graph.Nodes))
		}
	})
}

func BenchmarkDBGraphExport(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	graphDAO := dao.NewGraphDAO(db)

	runCounted(b, counter, func(i int) {
		data, err := graphDAO.ExportDomain(seed.Domain.ID)
		if err != nil {
			b.Fatalf("ExportDomain: %v", err)
		}
		if len(data.Definitions) != benchDefs {
			b.Fatalf("unexpected def count %d", len(data.Definitions))
		}
	})
}

func BenchmarkDBImportExportData(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	svc := NewImportService(db)

	runCounted(b, counter, func(i int) {
		data, err := svc.ExportDomain(seed.Domain.ID)
		if err != nil {
			b.Fatalf("ExportDomain: %v", err)
		}
		if len(data.MetaDefinitions) != benchDefs {
			b.Fatalf("unexpected def count %d", len(data.MetaDefinitions))
		}
	})
}

func BenchmarkDBExportBackup(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	svc := NewImportService(db)

	runCounted(b, counter, func(i int) {
		backup, err := svc.ExportDomainBackup(seed.Domain.ID, seed.User.ID)
		if err != nil {
			b.Fatalf("ExportDomainBackup: %v", err)
		}
		if backup.UserState == nil {
			b.Fatal("expected user state in backup")
		}
	})
}

// Re-import of a full export into the same domain (duplicate strategy
// "update") — the flow behind restoring a backup / syncing a domain.
func BenchmarkDBImportToDomainUpdate(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, 300, 150, benchFanout)
	svc := NewImportService(db)
	data, err := svc.ExportDomain(seed.Domain.ID)
	if err != nil {
		b.Fatalf("ExportDomain: %v", err)
	}

	runCounted(b, counter, func(i int) {
		if err := svc.ImportToDomain(seed.Domain.ID, data, DuplicateStrategyUpdate); err != nil {
			b.Fatalf("ImportToDomain: %v", err)
		}
	})
}

func BenchmarkDBGetPrerequisitesByDomain(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	srsDao := dao.NewSRSDao(db)

	runCounted(b, counter, func(i int) {
		prereqs, err := srsDao.GetPrerequisitesByDomain(seed.Domain.ID)
		if err != nil {
			b.Fatalf("GetPrerequisitesByDomain: %v", err)
		}
		if len(prereqs) == 0 {
			b.Fatal("no prerequisites")
		}
	})
}

// Full due-review service path: fetch due rows, load prerequisites, build
// graph, optimize order. Cache disabled so every op pays full cost.
func BenchmarkDBGetDueReviewsService(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	svc := NewSRSService(db, nil, nil)

	runCounted(b, counter, func(i int) {
		due, err := svc.GetDueReviews(seed.User.ID, seed.Domain.ID, "definition", "bench")
		if err != nil {
			b.Fatalf("GetDueReviews: %v", err)
		}
		if len(due) == 0 {
			b.Fatal("expected due reviews")
		}
	})
}

// Full explicit-review transaction: credit propagation + progress updates +
// review history. The reviewed node sits above a deep prerequisite chain.
func BenchmarkDBSubmitReview(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	svc := NewSRSService(db, nil, nil)
	reviewed := seed.DefIDs[len(seed.DefIDs)-1] // deepest layer

	runCounted(b, counter, func(i int) {
		resp, err := svc.SubmitReview(seed.User.ID, &models.ReviewRequest{
			NodeID:   reviewed,
			NodeType: "definition",
			Success:  true,
			Quality:  4,
		})
		if err != nil {
			b.Fatalf("SubmitReview: %v", err)
		}
		if !resp.Success {
			b.Fatal("review failed")
		}
	})
}

// Status change with propagation: marking a deep node grasped cascades
// through every transitive prerequisite.
func BenchmarkDBUpdateNodeStatusGrasped(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	svc := NewSRSService(db, nil, nil)
	deepest := seed.DefIDs[len(seed.DefIDs)-1]

	runCounted(b, counter, func(i int) {
		if err := svc.UpdateNodeStatus(seed.User.ID, deepest, "meta_definition", "grasped"); err != nil {
			b.Fatalf("UpdateNodeStatus: %v", err)
		}
	})
}

// Concurrent read path: parallel due-review requests against one domain,
// approximating several users hitting the same knowledge graph at once.
func BenchmarkDBConcurrentDueReviews(b *testing.B) {
	silenceLogs(b)
	db, counter := openBenchDB(b)
	seed := seedBenchDomain(b, db, benchDefs, benchExs, benchFanout)
	svc := NewSRSService(db, nil, nil)

	counter.count.Store(0)
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			due, err := svc.GetDueReviews(seed.User.ID, seed.Domain.ID, "definition", "bench")
			if err != nil {
				b.Fatalf("GetDueReviews: %v", err)
			}
			if len(due) == 0 {
				b.Fatal("expected due reviews")
			}
		}
	})
	b.StopTimer()
	b.ReportMetric(float64(counter.count.Load())/float64(b.N), "queries/op")
}
