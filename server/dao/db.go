package dao

import (
	"fmt"
	"log"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"myapp/server/models"
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
		&models.UserDefinitionProgress{},
		&models.UserExerciseProgress{},
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
	}

	// AutoMigrate all models - note that in production you might want more controlled migrations
	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			log.Printf("Warning: AutoMigrate for %T had issues: %v", model, err)
		}
	}

	// Ensure DB check constraints support the new 'meta_exercise' node type
	ensureSRSConstraints(db)

	// Ensure domain_node_codes are populated for existing nodes
	if err := ensureDomainNodeCodes(db); err != nil {
		return nil, err
	}

	return db, nil
}

// ensureSRSConstraints updates or creates CHECK constraints to include 'meta_exercise' and 'meta_definition'
func ensureSRSConstraints(db *gorm.DB) {
	stmts := []string{
		// node_prerequisites
		"ALTER TABLE node_prerequisites DROP CONSTRAINT IF EXISTS node_prerequisites_node_type_check;",
		"ALTER TABLE node_prerequisites ADD CONSTRAINT node_prerequisites_node_type_check CHECK (node_type IN ('definition','exercise','meta_exercise','meta_definition'));",
		"ALTER TABLE node_prerequisites DROP CONSTRAINT IF EXISTS node_prerequisites_prerequisite_type_check;",
		"ALTER TABLE node_prerequisites ADD CONSTRAINT node_prerequisites_prerequisite_type_check CHECK (prerequisite_type IN ('definition','exercise','meta_exercise','meta_definition'));",
		// user_node_progress
		"ALTER TABLE user_node_progress DROP CONSTRAINT IF EXISTS user_node_progress_node_type_check;",
		"ALTER TABLE user_node_progress ADD CONSTRAINT user_node_progress_node_type_check CHECK (node_type IN ('definition','exercise','meta_exercise','meta_definition'));",
		// session_reviews
		"ALTER TABLE session_reviews DROP CONSTRAINT IF EXISTS session_reviews_node_type_check;",
		"ALTER TABLE session_reviews ADD CONSTRAINT session_reviews_node_type_check CHECK (node_type IN ('definition','exercise','meta_exercise','meta_definition'));",
		// review_history
		"ALTER TABLE review_history DROP CONSTRAINT IF EXISTS review_history_node_type_check;",
		"ALTER TABLE review_history ADD CONSTRAINT review_history_node_type_check CHECK (node_type IN ('definition','exercise','meta_exercise','meta_definition'));",
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			log.Printf("Constraint update note: %v (stmt: %s)", err, s)
		}
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
		rows = append(rows, codeRow{ID: md.ID, DomainID: md.DomainID, Code: md.Code, NodeType: "meta_definition"})
	}

	var metaExs []models.MetaExercise
	if err := db.Select("id", "domain_id", "code").Find(&metaExs).Error; err != nil {
		return err
	}
	for _, me := range metaExs {
		rows = append(rows, codeRow{ID: me.ID, DomainID: me.DomainID, Code: me.Code, NodeType: "meta_exercise"})
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
