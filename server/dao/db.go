package dao

import (
	"fmt"
	"log"
	"os"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"ankidemy/server/models"
)

var DB *gorm.DB

// InitDB initializes the database connection and returns the db instance
func InitDB() (*gorm.DB, error) {
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=UTC",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_PORT"),
	)

	// Configure logger based on environment
	logLevel := logger.Silent
	if os.Getenv("APP_ENV") != "production" {
		logLevel = logger.Warn
	}

	config := &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	}

	db, err := gorm.Open(postgres.Open(dsn), config)
	if err != nil {
		return nil, err
	}

	// Store in package variable for global access if needed
	DB = db

	// Define the models to automigrate
	models := []interface{}{
		&models.User{},
		&models.Domain{},
		&models.DomainPermission{},
		&models.DomainInvite{},
		&models.DomainComment{},
		&models.NodeGroup{},
		&models.NodeGroupSeed{},
		&models.NodeGroupMember{},
		&models.UserGroupState{},
		&models.Definition{},
		&models.Reference{},
		&models.MetaDefinition{},
		&models.MetaExercise{},
		&models.Exercise{},
		&models.UserDomainProgress{},
		&models.NodePrerequisite{},
		&models.UserNodeProgress{},
		&models.StudySession{},
		&models.SessionReview{},
		&models.ReviewHistory{},
		&models.DomainLink{},
		&models.UserMetaExerciseStats{},
		&models.UserExerciseVersionStats{},
		&models.UserMetaDefinitionStats{},
		&models.UserDefinitionVersionStats{},
		&models.ExternalPrerequisite{},
		&models.Source{},
		&models.MetaQuest{},
		&models.QuestVersion{},
		&models.UserMetaQuestState{},
		&models.QuestEvent{},
		&models.NodeRelation{},
		&models.DomainNodeCode{},
		&models.UserDomainSettings{},
		&models.UserDailyQuestDraw{},
		&models.ReadModelEvent{},
		&models.UserDomainDueProjection{},
	}

	// AutoMigrate all models - note that in production you might want more controlled migrations
	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			log.Printf("Warning: AutoMigrate for %T had issues: %v", model, err)
		}
	}

	// Migrate legacy data to the standardized schema, then (re)apply the
	// canonical CHECK constraints.
	ensureModernSchema(db)
	ensureSRSConstraints(db)
	ensureSRSDueIndexes(db)
	ensurePGStatStatements(db)

	// Ensure domain_node_codes are populated for existing nodes
	if err := ensureDomainNodeCodes(db); err != nil {
		return nil, err
	}

	// Backfill quest names when missing (use first version title)
	ensureQuestNames(db)

	return db, nil
}

// ensureSRSConstraints enforces the canonical node-type vocabulary.
func ensureSRSConstraints(db *gorm.DB) {
	stmts := []string{
		// node_prerequisites
		"ALTER TABLE node_prerequisites DROP CONSTRAINT IF EXISTS node_prerequisites_node_type_check;",
		"ALTER TABLE node_prerequisites ADD CONSTRAINT node_prerequisites_node_type_check CHECK (node_type IN ('definition','exercise'));",
		"ALTER TABLE node_prerequisites DROP CONSTRAINT IF EXISTS node_prerequisites_prerequisite_type_check;",
		"ALTER TABLE node_prerequisites ADD CONSTRAINT node_prerequisites_prerequisite_type_check CHECK (prerequisite_type IN ('definition','exercise'));",
		// user_node_progress
		"ALTER TABLE user_node_progress DROP CONSTRAINT IF EXISTS user_node_progress_node_type_check;",
		"ALTER TABLE user_node_progress ADD CONSTRAINT user_node_progress_node_type_check CHECK (node_type IN ('definition','exercise'));",
		// session_reviews
		"ALTER TABLE session_reviews DROP CONSTRAINT IF EXISTS session_reviews_node_type_check;",
		"ALTER TABLE session_reviews ADD CONSTRAINT session_reviews_node_type_check CHECK (node_type IN ('definition','exercise'));",
		// review_history
		"ALTER TABLE review_history DROP CONSTRAINT IF EXISTS review_history_node_type_check;",
		"ALTER TABLE review_history ADD CONSTRAINT review_history_node_type_check CHECK (node_type IN ('definition','exercise'));",
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			log.Printf("Constraint update note: %v (stmt: %s)", err, s)
		}
	}
}

// ensureSRSDueIndexes creates targeted indexes used by /srs due and queue routes.
func ensureSRSDueIndexes(db *gorm.DB) {
	stmts := []string{
		"CREATE INDEX IF NOT EXISTS idx_unp_due_definition ON user_node_progress (user_id, next_review, node_id) WHERE node_type = 'definition' AND status = 'grasped';",
		"CREATE INDEX IF NOT EXISTS idx_unp_due_exercise ON user_node_progress (user_id, next_review, node_id) WHERE node_type = 'exercise' AND status = 'grasped';",
		"CREATE INDEX IF NOT EXISTS idx_meta_definitions_domain_id ON meta_definitions (domain_id, id);",
		"CREATE INDEX IF NOT EXISTS idx_meta_exercises_domain_id ON meta_exercises (domain_id, id);",
	}
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			log.Printf("SRS index ensure note: %v (stmt: %s)", err, stmt)
		}
	}
}

func ensureQuestNames(db *gorm.DB) {
	var quests []models.MetaQuest
	if err := db.Where("name = '' OR name IS NULL").Find(&quests).Error; err != nil {
		return
	}
	for _, quest := range quests {
		var version models.QuestVersion
		if err := db.Where("meta_quest_id = ?", quest.ID).Order("id ASC").First(&version).Error; err != nil {
			continue
		}
		if strings.TrimSpace(version.Title) == "" {
			continue
		}
		_ = db.Model(&models.MetaQuest{}).Where("id = ?", quest.ID).Update("name", strings.TrimSpace(version.Title)).Error
	}
}

// ensureDomainNodeCodes backfills domain_node_codes for existing meta nodes.
// It fails loudly on duplicate codes within a domain.
func ensureDomainNodeCodes(db *gorm.DB) error {
	var count int64
	if err := db.Model(&models.DomainNodeCode{}).Count(&count).Error; err != nil {
		return err
	}
	// If entries exist, assume backfill already happened.
	if count > 0 {
		return nil
	}

	type codeRow struct {
		ID       uint
		DomainID uint
		Code     string
		NodeType string
	}

	rows := make([]codeRow, 0)

	var metaDefs []models.MetaDefinition
	if err := db.Select("id", "domain_id", "code").Find(&metaDefs).Error; err != nil {
		return err
	}
	for _, md := range metaDefs {
		rows = append(rows, codeRow{ID: md.ID, DomainID: md.DomainID, Code: md.Code, NodeType: "definition"})
	}

	var metaExs []models.MetaExercise
	if err := db.Select("id", "domain_id", "code").Find(&metaExs).Error; err != nil {
		return err
	}
	for _, me := range metaExs {
		rows = append(rows, codeRow{ID: me.ID, DomainID: me.DomainID, Code: me.Code, NodeType: "exercise"})
	}

	seen := make(map[string]bool)
	for _, r := range rows {
		key := fmt.Sprintf("%d:%s", r.DomainID, r.Code)
		if r.Code == "" {
			return fmt.Errorf("domain_node_codes backfill: empty code for %s id=%d", r.NodeType, r.ID)
		}
		if seen[key] {
			return fmt.Errorf("domain_node_codes backfill: duplicate code '%s' in domain %d", r.Code, r.DomainID)
		}
		seen[key] = true
	}

	return db.Transaction(func(tx *gorm.DB) error {
		for _, r := range rows {
			entry := &models.DomainNodeCode{
				DomainID: r.DomainID,
				Code:     r.Code,
				NodeType: r.NodeType,
				NodeID:   r.ID,
			}
			if err := tx.Create(entry).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
