package dao

import (
	"fmt"
	"log"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
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

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	// Store in package variable for global access if needed
	DB = db
	
	// Ensure our models match the schema or handle migrations as needed
	// Note: This is just for development; in production you might want more
	// controlled migrations
	if err := db.AutoMigrate(&models.User{}); err != nil {
		log.Printf("Warning: AutoMigrate had issues: %v", err)
	}

	return db, nil
}
