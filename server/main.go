package main

import (
	"flag"
	"log"
	"os"
	"strings"

	"myapp/server/dao"
	"myapp/server/handlers"
	"myapp/server/middleware"
	"myapp/server/models"
	"myapp/server/services"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Define command-line flags (kept for backward compatibility but will use ImportService)
	testImportFlag := flag.Bool("test-import", false, "Run test import")
	jsonFilePath := flag.String("file", "./sample.json", "Path to the JSON file")
	domainName := flag.String("domain", "Test Domain", "Name of the domain to create")
	domainDesc := flag.String("desc", "Domain imported from JSON", "Description of the domain")
	
	// Parse command-line flags
	flag.Parse()

	// Load env variables, handle missing .env gracefully
	if err := godotenv.Load(); err != nil {
		log.Printf("Info: .env file not found, relying on environment variables: %v", err)
	}

	// Set Gin mode based on environment
	if os.Getenv("APP_ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize database connection
	db, err := dao.InitDB()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Initialize ImportService
	importService := services.NewImportService(db)

	// Auto-import tutorial using ImportService
	if err := importService.ImportTutorialIfNotExists(); err != nil {
		log.Printf("Warning: Failed to import tutorial: %v", err)
	}

	// Run test import if flag is set (using ImportService)
	if *testImportFlag {
		runTestImportWithService(importService, *jsonFilePath, *domainName, *domainDesc)
		return // Exit after import
	}

	// Initialize DAOs
	userDAO := dao.NewUserDAO(db)
	domainDAO := dao.NewDomainDAO(db)
	definitionDAO := dao.NewDefinitionDAO(db)
	exerciseDAO := dao.NewExerciseDAO(db)
	progressDAO := dao.NewProgressDAO(db)
	graphDAO := dao.NewGraphDAO(db)

	// Create admin user if it doesn't exist
	adminUser := &models.User{
		Username:  "admin",
		Email:     "admin@example.com",
		Password:  "admin_password", // In production, use a strong password and store as environment variable
		Level:     "admin",
		FirstName: "Admin",
		LastName:  "User",
	}
	if err := userDAO.CreateAdminUser(adminUser); err != nil {
		log.Printf("Warning: Failed to create admin user: %v", err)
	} else {
		log.Println("Admin user created or already exists")
	}

	// Initialize handlers with ImportService
	userHandler := handlers.NewUserHandler(userDAO)
	authHandler := handlers.NewAuthHandler(userDAO)
	domainHandler := handlers.NewDomainHandler(domainDAO, progressDAO, importService) // Added ImportService
	definitionHandler := handlers.NewDefinitionHandler(definitionDAO, domainDAO)
	exerciseHandler := handlers.NewExerciseHandler(exerciseDAO, domainDAO)
	progressHandler := handlers.NewProgressHandler(progressDAO, domainDAO, definitionDAO, exerciseDAO)
	graphHandler := handlers.NewGraphHandler(graphDAO, domainDAO)
	srsHandler := handlers.NewSRSHandler(db)

	// Initialize router
	router := gin.Default()

	// Configure CORS for direct client-server communication
	config := cors.DefaultConfig()
	
	// Define allowed origins - get from env or use defaults
	allowedOrigins := []string{"http://localhost:3000"}
	if corsOrigin := os.Getenv("CORS_ALLOWED_ORIGIN"); corsOrigin != "" {
		// Split in case multiple origins are provided
		origins := strings.Split(corsOrigin, ",")
		allowedOrigins = make([]string, len(origins))
		for i, origin := range origins {
			allowedOrigins[i] = strings.TrimSpace(origin)
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
		// Auth routes (no auth required)
		auth := api.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
			auth.POST("/register", authHandler.Register)
			auth.POST("/refresh", authHandler.RefreshToken)
		}

		// Public domain routes
		api.GET("/domains/public", domainHandler.GetPublicDomains)

		// Routes requiring authentication
		authorized := api.Group("/")
		authorized.Use(middleware.AuthMiddleware())
		{
			// User routes
			authorized.GET("/users/me", userHandler.GetCurrentUser)
			authorized.PUT("/users/me", userHandler.UpdateCurrentUser)

			// Domain routes (now with import support)
			domains := authorized.Group("/domains")
			{
				domains.GET("", domainHandler.GetDomains)
				domains.POST("", domainHandler.CreateDomain) // Now supports import data
				domains.GET("/my", domainHandler.GetMyDomains)
				domains.GET("/enrolled", domainHandler.GetEnrolledDomains)
				domains.GET("/:id", domainHandler.GetDomain)
				domains.PUT("/:id", domainHandler.UpdateDomain)
				domains.DELETE("/:id", domainHandler.DeleteDomain)
				domains.POST("/:id/enroll", domainHandler.EnrollInDomain)
				domains.POST("/:id/import", domainHandler.ImportToDomain) // NEW: Import to existing domain
				
				// Domain comments
				domains.GET("/:id/comments", domainHandler.GetComments)
				domains.POST("/:id/comments", domainHandler.AddComment)
				domains.DELETE("/:id/comments/:commentId", domainHandler.DeleteComment)

				// Definitions
				domains.GET("/:id/definitions", definitionHandler.GetDomainDefinitions)
				domains.POST("/:id/definitions", definitionHandler.CreateDefinition)

				// Exercises
				domains.GET("/:id/exercises", exerciseHandler.GetDomainExercises)
				domains.POST("/:id/exercises", exerciseHandler.CreateExercise)

				// Graph operations (export only, import now handled by domain handler)
				domains.GET("/:id/graph", graphHandler.GetVisualGraph)
				domains.PUT("/:id/graph/positions", graphHandler.UpdatePositions)
				domains.GET("/:id/export", graphHandler.ExportDomain)
				// Note: Import is now handled by domainHandler.ImportToDomain above
			}

			// Definition routes
			definitions := authorized.Group("/definitions")
			{
				definitions.GET("/:id", definitionHandler.GetDefinition)
				definitions.PUT("/:id", definitionHandler.UpdateDefinition)
				definitions.DELETE("/:id", definitionHandler.DeleteDefinition)
				definitions.GET("/code/:code", definitionHandler.GetDefinitionByCode)
			}

			// Exercise routes
			exercises := authorized.Group("/exercises")
			{
				exercises.GET("/:id", exerciseHandler.GetExercise)
				exercises.PUT("/:id", exerciseHandler.UpdateExercise)
				exercises.DELETE("/:id", exerciseHandler.DeleteExercise)
				exercises.GET("/code/:code", exerciseHandler.GetExerciseByCode)
				exercises.POST("/:id/verify", exerciseHandler.VerifyAnswer)
			}

			// Progress routes
			progress := authorized.Group("/progress")
			{
				progress.GET("/domains", progressHandler.GetDomainProgress)
				progress.GET("/domains/:domainId/definitions", progressHandler.GetDefinitionProgress)
				progress.GET("/domains/:domainId/exercises", progressHandler.GetExerciseProgress)
				progress.POST("/definitions/:id/review", progressHandler.ReviewDefinition)
				progress.POST("/exercises/:id/attempt", progressHandler.AttemptExercise)
				progress.GET("/domains/:domainId/review", progressHandler.GetDefinitionsForReview)
			}

			// Session routes
			sessions := authorized.Group("/sessions")
			{
				sessions.POST("/start", progressHandler.StartSession)
				sessions.PUT("/:id/end", progressHandler.EndSession)
				sessions.GET("", progressHandler.GetSessions)
				sessions.GET("/:id", progressHandler.GetSessionDetails)
			}

			// SRS ROUTES
			srs := authorized.Group("/srs")
			{
				// Review endpoints
				srs.POST("/reviews", srsHandler.SubmitReview)
				srs.GET("/domains/:domainId/due", srsHandler.GetDueReviews)
				srs.GET("/reviews/history", srsHandler.GetReviewHistory)
				
				// Progress endpoints
				srs.GET("/domains/:domainId/progress", srsHandler.GetDomainProgress)
				srs.GET("/domains/:domainId/stats", srsHandler.GetDomainStats)
				srs.PUT("/nodes/status", srsHandler.UpdateNodeStatus)
				
				// Session endpoints
				srs.POST("/sessions", srsHandler.StartSession)
				srs.PUT("/sessions/:sessionId/end", srsHandler.EndSession)
				srs.GET("/sessions", srsHandler.GetUserSessions)
				
				// Prerequisites endpoints
				srs.POST("/prerequisites", srsHandler.CreatePrerequisite)
				srs.GET("/domains/:domainId/prerequisites", srsHandler.GetPrerequisites)
				srs.DELETE("/prerequisites/:prerequisiteId", srsHandler.DeletePrerequisite)
				
				// Test/Debug endpoints
				srs.POST("/test/credit-propagation", srsHandler.TestCreditPropagation)
			}

			// Admin routes
			admin := authorized.Group("/admin")
			admin.Use(middleware.AdminRequired())
			{
				admin.GET("/users", userHandler.GetAllUsers)
				// Add other admin routes here
			}
		}
	}

	// Start server
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on port %s", port)
	
	// Only trust localhost and loopback address
	router.SetTrustedProxies([]string{"127.0.0.1", "localhost"})
	
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// runTestImportWithService imports test JSON data using ImportService
func runTestImportWithService(importService *services.ImportService, jsonFilePath, domainName, domainDesc string) {
	log.Println("Starting test import with ImportService...")

	// Initialize database connection for admin user lookup
	db, err := dao.InitDB()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Read import data from file
	importData, err := importService.ReadImportFileFromPath(jsonFilePath)
	if err != nil {
		log.Fatalf("Failed to read import file: %v", err)
	}

	log.Printf("Successfully read import data with %d definitions and %d exercises", 
		len(importData.Definitions), len(importData.Exercises))

	// Get admin user
	userDAO := dao.NewUserDAO(db)
	adminUser, err := userDAO.FindUserByEmail("admin@example.com")
	if err != nil {
		log.Fatalf("Failed to find admin user: %v", err)
	}

	// Create domain with import data
	domain, err := importService.CreateDomainWithImport(
		adminUser.ID,
		domainName,
		"public",
		domainDesc,
		importData,
	)
	if err != nil {
		log.Fatalf("Failed to create domain with import: %v", err)
	}

	log.Printf("Successfully created domain: %s (ID: %d)", domain.Name, domain.ID)
	log.Println("Test import completed successfully!")
	os.Exit(0)
}

// Note: The old GraphData types and runTestImport function from the original main.go
// are now deprecated and replaced by the ImportService functionality.
