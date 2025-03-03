package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// User model
type User struct {
	gorm.Model
	Username string `gorm:"unique;not null" json:"username"` // Use "unique" instead of "uniqueIndex"
	Email    string `gorm:"unique;not null" json:"email"`    // Use "unique" instead of "uniqueIndex"
	Password string `gorm:"not null" json:"-"`
}

// Item model
type Item struct {
	gorm.Model
	Name        string `json:"name"`
	Description string `json:"description"`
	UserID      uint   `json:"user_id"`
	User        User   `gorm:"foreignKey:UserID" json:"-"`
}

// LoginRequest struct
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse struct
type LoginResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	// Add other fields as needed (e.g., token, user data)
}

func main() {
	// Load env variables, handle missing .env gracefully
	if err := godotenv.Load(); err != nil {
		log.Printf("Info: .env file not found, relying on environment variables: %v", err)
	}

	// Set Gin mode
	if os.Getenv("APP_ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Connect to database
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=UTC",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_PORT"),
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Auto migrate the schema
	db.AutoMigrate(&User{}, &Item{})

	// Initialize router
	router := gin.Default()

	// Configure CORS for direct client-server communication
	config := cors.DefaultConfig()
	
	// Define allowed origins - get from env or use defaults
	allowedOrigins := []string{"*"}
	if corsOrigin := os.Getenv("CORS_ALLOWED_ORIGIN"); corsOrigin != "" {
		// Split in case multiple origins are provided
		origins := strings.Split(corsOrigin, ",")
		for _, origin := range origins {
			allowedOrigins = append(allowedOrigins, strings.TrimSpace(origin))
		}
	}
	
	config.AllowOrigins = allowedOrigins
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	router.Use(cors.New(config))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
		})
	})

	// API routes
	api := router.Group("/api")
	{
		api.GET("/", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"message": "API is running. Use /api/users, /api/items, etc.",
			})
		})

		api.GET("/users", func(c *gin.Context) {
			var users []User
			db.Find(&users)
			c.JSON(200, users)
		})

		api.GET("/items", func(c *gin.Context) {
			var items []Item
			db.Find(&items)
			c.JSON(200, items)
		})

		api.POST("/items", func(c *gin.Context) {
			var item Item
			if err := c.ShouldBindJSON(&item); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			db.Create(&item)
			c.JSON(201, item)
		})

		// Login endpoint
		api.POST("/login", func(c *gin.Context) {
			var loginReq LoginRequest
			if err := c.ShouldBindJSON(&loginReq); err != nil {
				c.JSON(400, LoginResponse{Success: false, Message: "Invalid request body"})
				return
			}

			// Find the user by email
			var user User
			result := db.Where("email = ?", loginReq.Email).First(&user)
			if result.Error != nil {
				// User not found or other DB error
				c.JSON(401, LoginResponse{Success: false, Message: "Invalid credentials"})
				return
			}

			// IMPORTANT: In a real app, use bcrypt to compare passwords
			if loginReq.Password != user.Password {
				c.JSON(401, LoginResponse{Success: false, Message: "Invalid credentials"})
				return
			}

			// Successful login
			c.JSON(200, LoginResponse{Success: true, Message: "Login successful"})
		})
	}

	// Start server
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on port %s", port)
	
	// Only trust localhost and loopback address (no more need for nginx in trusted proxies)
	router.SetTrustedProxies([]string{"127.0.0.1", "localhost"})
	
	router.Run(":" + port)
}
