package services

// Shared Postgres-backed benchmark harness. These benchmarks are skipped
// unless BENCH_DATABASE_DSN is set, e.g.:
//
//	docker run --name ankidemy-bench-pg --rm -d \
//	  -e POSTGRES_USER=bench -e POSTGRES_PASSWORD=bench -e POSTGRES_DB=bench \
//	  -p 55432:5432 postgres:17-alpine
//	BENCH_DATABASE_DSN="host=localhost user=bench password=bench dbname=bench port=55432 sslmode=disable" \
//	  go test ./services/ -run '^$' -bench BenchmarkDB -benchtime=3x
//
// Each benchmark reports queries/op (SQL statements per operation) alongside
// the usual ns/op, which is the primary signal for N+1 regressions.

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"ankidemy/server/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type countingLogger struct {
	inner logger.Interface
	count atomic.Int64
}

func (l *countingLogger) LogMode(level logger.LogLevel) logger.Interface { return l }
func (l *countingLogger) Info(ctx context.Context, msg string, args ...interface{}) {
	l.inner.Info(ctx, msg, args...)
}
func (l *countingLogger) Warn(ctx context.Context, msg string, args ...interface{}) {
	l.inner.Warn(ctx, msg, args...)
}
func (l *countingLogger) Error(ctx context.Context, msg string, args ...interface{}) {
	l.inner.Error(ctx, msg, args...)
}
func (l *countingLogger) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	l.count.Add(1)
}

func openBenchDB(b *testing.B) (*gorm.DB, *countingLogger) {
	b.Helper()
	dsn := os.Getenv("BENCH_DATABASE_DSN")
	if dsn == "" {
		b.Skip("BENCH_DATABASE_DSN not set; skipping DB benchmark")
	}

	counter := &countingLogger{inner: logger.Default.LogMode(logger.Silent)}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: counter})
	if err != nil {
		b.Fatalf("open bench db: %v", err)
	}

	migrations := []interface{}{
		&models.User{},
		&models.Domain{},
		&models.DomainPermission{},
		&models.NodeGroup{},
		&models.NodeGroupSeed{},
		&models.NodeGroupMember{},
		&models.Definition{},
		&models.Reference{},
		&models.MetaDefinition{},
		&models.MetaExercise{},
		&models.Exercise{},
		&models.NodePrerequisite{},
		&models.UserNodeProgress{},
		&models.StudySession{},
		&models.SessionReview{},
		&models.ReviewHistory{},
		&models.UserMetaExerciseStats{},
		&models.UserExerciseVersionStats{},
		&models.UserMetaDefinitionStats{},
		&models.UserDefinitionVersionStats{},
		&models.Source{},
		&models.MetaQuest{},
		&models.QuestVersion{},
		&models.UserMetaQuestState{},
		&models.QuestEvent{},
		&models.NodeRelation{},
		&models.DomainNodeCode{},
		&models.UserDomainSettings{},
	}
	for _, model := range migrations {
		if err := db.AutoMigrate(model); err != nil {
			b.Fatalf("automigrate %T: %v", model, err)
		}
	}
	// Match the production indexes that matter for the benchmarked paths.
	indexStmts := []string{
		"CREATE INDEX IF NOT EXISTS idx_node_prerequisites_node ON node_prerequisites(node_id, node_type)",
		"CREATE INDEX IF NOT EXISTS idx_node_prerequisites_prereq ON node_prerequisites(prerequisite_id, prerequisite_type)",
		"CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_node_progress(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_user_progress_node ON user_node_progress(node_id, node_type)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uidx_user_progress_key ON user_node_progress(user_id, node_id, node_type)",
		"CREATE INDEX IF NOT EXISTS idx_meta_definitions_domain_id ON meta_definitions (domain_id, id)",
		"CREATE INDEX IF NOT EXISTS idx_meta_exercises_domain_id ON meta_exercises (domain_id, id)",
	}
	for _, stmt := range indexStmts {
		if err := db.Exec(stmt).Error; err != nil {
			b.Fatalf("create index: %v", err)
		}
	}

	return db, counter
}

// benchDomain seeds a domain shaped like a real knowledge graph:
// defCount meta_definitions (one version + one reference each),
// exCount meta_exercises (one version each), layered prerequisites with
// the given fanout, and per-user grasped/due progress rows.
type benchDomain struct {
	Domain  *models.Domain
	User    *models.User
	DefIDs  []uint
	ExIDs   []uint
	LayerSz int
}

func seedBenchDomain(b *testing.B, db *gorm.DB, defCount, exCount, fanout int) *benchDomain {
	b.Helper()

	suffix := time.Now().UnixNano()
	user := &models.User{
		Username: fmt.Sprintf("bench_user_%d", suffix),
		Email:    fmt.Sprintf("bench_%d@example.com", suffix),
		Password: "benchpass123",
	}
	if err := db.Create(user).Error; err != nil {
		b.Fatalf("create user: %v", err)
	}

	domain := &models.Domain{
		Name:    fmt.Sprintf("Bench Domain %d", suffix),
		Privacy: "private",
		OwnerID: user.ID,
	}
	if err := db.Create(domain).Error; err != nil {
		b.Fatalf("create domain: %v", err)
	}

	// Meta definitions
	metaDefs := make([]models.MetaDefinition, defCount)
	for i := 0; i < defCount; i++ {
		metaDefs[i] = models.MetaDefinition{
			Code:      fmt.Sprintf("D%d_%d", suffix, i),
			Name:      fmt.Sprintf("Definition %d", i),
			DomainID:  domain.ID,
			OwnerID:   user.ID,
			XPosition: float64(i % 100),
			YPosition: float64(i / 100),
		}
	}
	if err := db.CreateInBatches(&metaDefs, 500).Error; err != nil {
		b.Fatalf("create meta definitions: %v", err)
	}

	defIDs := make([]uint, defCount)
	versions := make([]models.Definition, defCount)
	codes := make([]models.DomainNodeCode, 0, defCount+exCount)
	for i := range metaDefs {
		defIDs[i] = metaDefs[i].ID
		versions[i] = models.Definition{
			Code:             metaDefs[i].Code,
			Name:             metaDefs[i].Name,
			Description:      fmt.Sprintf("Description for definition %d with some realistic text length to it.", i),
			Notes:            "Some notes",
			DomainID:         domain.ID,
			OwnerID:          user.ID,
			MetaDefinitionID: metaDefs[i].ID,
			Prompt:           fmt.Sprintf("Define concept %d", i),
			Type:             "open_ended",
		}
		codes = append(codes, models.DomainNodeCode{
			DomainID: domain.ID, Code: metaDefs[i].Code, NodeType: "definition", NodeID: metaDefs[i].ID,
		})
	}
	if err := db.CreateInBatches(&versions, 500).Error; err != nil {
		b.Fatalf("create definition versions: %v", err)
	}
	refs := make([]models.Reference, len(versions))
	for i := range versions {
		refs[i] = models.Reference{DefinitionID: versions[i].ID, Reference: fmt.Sprintf("Book %d, ch. %d", i%7, i%13)}
	}
	if err := db.CreateInBatches(&refs, 500).Error; err != nil {
		b.Fatalf("create references: %v", err)
	}

	// Meta exercises
	metaExs := make([]models.MetaExercise, exCount)
	for i := 0; i < exCount; i++ {
		metaExs[i] = models.MetaExercise{
			Code:     fmt.Sprintf("E%d_%d", suffix, i),
			Name:     fmt.Sprintf("Exercise %d", i),
			DomainID: domain.ID,
			OwnerID:  user.ID,
		}
	}
	if err := db.CreateInBatches(&metaExs, 500).Error; err != nil {
		b.Fatalf("create meta exercises: %v", err)
	}
	exIDs := make([]uint, exCount)
	exVersions := make([]models.Exercise, exCount)
	for i := range metaExs {
		exIDs[i] = metaExs[i].ID
		exVersions[i] = models.Exercise{
			Code:           metaExs[i].Code,
			Name:           metaExs[i].Name,
			Statement:      fmt.Sprintf("Solve problem %d using the concepts you learned.", i),
			DomainID:       domain.ID,
			OwnerID:        user.ID,
			MetaExerciseID: metaExs[i].ID,
			Difficulty:     (i % 7) + 1,
		}
		codes = append(codes, models.DomainNodeCode{
			DomainID: domain.ID, Code: metaExs[i].Code, NodeType: "exercise", NodeID: metaExs[i].ID,
		})
	}
	if err := db.CreateInBatches(&exVersions, 500).Error; err != nil {
		b.Fatalf("create exercise versions: %v", err)
	}
	if err := db.CreateInBatches(&codes, 500).Error; err != nil {
		b.Fatalf("create domain node codes: %v", err)
	}

	// Layered prerequisites among definitions (def i depends on defs in the
	// previous "layer" of 50), plus each exercise depends on 1-2 definitions.
	layerSize := 50
	var prereqs []models.NodePrerequisite
	for i := layerSize; i < defCount; i++ {
		for f := 0; f < fanout; f++ {
			target := i - layerSize + ((i + f*17) % layerSize)
			prereqs = append(prereqs, models.NodePrerequisite{
				NodeID:           defIDs[i],
				NodeType:         "definition",
				PrerequisiteID:   defIDs[target],
				PrerequisiteType: "definition",
				Weight:           1.0,
			})
		}
	}
	for i := 0; i < exCount; i++ {
		prereqs = append(prereqs, models.NodePrerequisite{
			NodeID:           exIDs[i],
			NodeType:         "exercise",
			PrerequisiteID:   defIDs[i%defCount],
			PrerequisiteType: "definition",
			Weight:           1.0,
		})
	}
	if err := db.CreateInBatches(&prereqs, 500).Error; err != nil {
		b.Fatalf("create prerequisites: %v", err)
	}

	// Progress: all definitions grasped; every 4th definition due now.
	past := time.Now().Add(-24 * time.Hour)
	future := time.Now().Add(14 * 24 * time.Hour)
	progress := make([]models.UserNodeProgress, 0, defCount)
	for i := 0; i < defCount; i++ {
		next := future
		if i%4 == 0 {
			next = past
		}
		progress = append(progress, models.UserNodeProgress{
			UserID:         user.ID,
			NodeID:         defIDs[i],
			NodeType:       "definition",
			Status:         "grasped",
			EasinessFactor: 2.5,
			IntervalDays:   6,
			Repetitions:    2,
			NextReview:     &next,
			TotalReviews:   3, SuccessfulReviews: 2,
		})
	}
	if err := db.CreateInBatches(&progress, 500).Error; err != nil {
		b.Fatalf("create progress: %v", err)
	}

	return &benchDomain{Domain: domain, User: user, DefIDs: defIDs, ExIDs: exIDs, LayerSz: layerSize}
}

func runCounted(b *testing.B, counter *countingLogger, fn func(i int)) {
	b.Helper()
	counter.count.Store(0)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fn(i)
	}
	b.StopTimer()
	b.ReportMetric(float64(counter.count.Load())/float64(b.N), "queries/op")
}
