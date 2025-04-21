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
		logLevel = logger.Info
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
		&models.DomainComment{},
		&models.Definition{},
		&models.Reference{},
		&models.Exercise{},
		&models.UserDomainProgress{},
		&models.UserDefinitionProgress{},
		&models.UserExerciseProgress{},
	}
	
	// AutoMigrate all models - note that in production you might want more controlled migrations
	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			log.Printf("Warning: AutoMigrate for %T had issues: %v", model, err)
		}
	}

	return db, nil
}
