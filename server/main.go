package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"strings"

	"myapp/server/dao"
	"myapp/server/handlers"
	"myapp/server/middleware"
	"myapp/server/models"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/gorm"
)

// GraphData represents the JSON structure for imports
type GraphData struct {
	Definitions map[string]DefinitionNode `json:"definitions"`
	Exercises   map[string]ExerciseNode   `json:"exercises"`
}

// DefinitionNode represents a definition in the JSON
type DefinitionNode struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Description   []string `json:"description"`
	Notes         string   `json:"notes,omitempty"`
	References    []string `json:"references,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
}

// ExerciseNode represents an exercise in the JSON
type ExerciseNode struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Statement     string   `json:"statement"`
	Description   string   `json:"description,omitempty"`
	Hints         string   `json:"hints,omitempty"`
	Difficulty    string   `json:"difficulty,omitempty"`
	Verifiable    bool     `json:"verifiable,omitempty"`
	Result        string   `json:"result,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	XPosition     float64  `json:"xPosition,omitempty"`
	YPosition     float64  `json:"yPosition,omitempty"`
}

func main() {
	// Define command-line flags
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

	// Run test import if flag is set
	if *testImportFlag {
		runTestImport(db, *jsonFilePath, *domainName, *domainDesc)
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

	// Initialize handlers
	userHandler := handlers.NewUserHandler(userDAO)
	authHandler := handlers.NewAuthHandler(userDAO)
	domainHandler := handlers.NewDomainHandler(domainDAO, progressDAO)
	definitionHandler := handlers.NewDefinitionHandler(definitionDAO, domainDAO)
	exerciseHandler := handlers.NewExerciseHandler(exerciseDAO, domainDAO)
	progressHandler := handlers.NewProgressHandler(progressDAO, domainDAO, definitionDAO, exerciseDAO)
	graphHandler := handlers.NewGraphHandler(graphDAO, domainDAO)

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

			// Domain routes
			domains := authorized.Group("/domains")
			{
				domains.GET("", domainHandler.GetDomains)
				domains.POST("", domainHandler.CreateDomain)
				domains.GET("/my", domainHandler.GetMyDomains)
				domains.GET("/enrolled", domainHandler.GetEnrolledDomains)
				domains.GET("/:id", domainHandler.GetDomain)
				domains.PUT("/:id", domainHandler.UpdateDomain)
				domains.DELETE("/:id", domainHandler.DeleteDomain)
				domains.POST("/:id/enroll", domainHandler.EnrollInDomain)
				
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

				// Graph operations
				domains.GET("/:id/graph", graphHandler.GetVisualGraph)
				domains.PUT("/:id/graph/positions", graphHandler.UpdatePositions)
				domains.GET("/:id/export", graphHandler.ExportDomain)
				domains.POST("/:id/import", graphHandler.ImportDomain)
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

// runTestImport imports the test JSON data into the database
func runTestImport(db *gorm.DB, jsonFilePath, domainName, domainDesc string) {
	fmt.Println("Starting test import...")

	// Read and parse the JSON file
	jsonFile, err := os.Open(jsonFilePath)
	if err != nil {
		log.Fatalf("Failed to open JSON file: %v", err)
	}
	defer jsonFile.Close()

	byteValue, err := ioutil.ReadAll(jsonFile)
	if err != nil {
		log.Fatalf("Failed to read JSON file: %v", err)
	}

	var graphData GraphData
	if err := json.Unmarshal(byteValue, &graphData); err != nil {
		log.Fatalf("Failed to parse JSON: %v", err)
	}

	// Create DAOs
	userDAO := dao.NewUserDAO(db)
	domainDAO := dao.NewDomainDAO(db)
	definitionDAO := dao.NewDefinitionDAO(db)
	exerciseDAO := dao.NewExerciseDAO(db)

	// Get admin user or create one if it doesn't exist
	adminUser := &models.User{
		Username:  "admin",
		Email:     "admin@example.com",
		Password:  "admin_password",
		Level:     "admin",
		FirstName: "Admin",
		LastName:  "User",
		IsAdmin:   true,
	}
	if err := userDAO.CreateAdminUser(adminUser); err != nil {
		log.Printf("Warning: Failed to create admin user: %v", err)
	}

	// Find the admin user
	adminUser, err = userDAO.FindUserByEmail("admin@example.com")
	if err != nil {
		log.Fatalf("Failed to find admin user: %v", err)
	}

	// Create a new domain
	domain := &models.Domain{
		Name:        domainName,
		Privacy:     "public",
		OwnerID:     adminUser.ID,
		Description: domainDesc,
	}
	if err := domainDAO.Create(domain); err != nil {
		log.Fatalf("Failed to create domain: %v", err)
	}

	fmt.Printf("Created domain: %s (ID: %d)\n", domain.Name, domain.ID)

	// Create definitions
	definitions := make(map[string]*models.Definition)
	for code, def := range graphData.Definitions {
		// Process multiple descriptions - join with a delimiter for storing
		descriptionStr := strings.Join(def.Description, "|||")

		definition := &models.Definition{
			Code:        code,
			Name:        def.Name,
			Description: descriptionStr,
			Notes:       def.Notes,
			DomainID:    domain.ID,
			OwnerID:     adminUser.ID,
			XPosition:   def.XPosition,
			YPosition:   def.YPosition,
		}
		
		// Create the definition (with references but no prerequisites yet)
		if err := definitionDAO.Create(definition, def.References, nil); err != nil {
			log.Fatalf("Failed to create definition %s: %v", code, err)
		}
		
		definitions[code] = definition
		fmt.Printf("Created definition: %s (ID: %d)\n", definition.Name, definition.ID)
	}

	// Now add prerequisites for definitions
	for code, def := range graphData.Definitions {
		if len(def.Prerequisites) > 0 {
			definition := definitions[code]
			var prerequisiteIDs []uint
			
			for _, prereqCode := range def.Prerequisites {
				if prereqDef, exists := definitions[prereqCode]; exists {
					prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
				} else {
					log.Printf("Warning: Prerequisite %s not found for definition %s", prereqCode, code)
				}
			}
			
			if len(prerequisiteIDs) > 0 {
				// Get references
				var references []string
				for _, ref := range definition.References {
					references = append(references, ref.Reference)
				}
				
				if err := definitionDAO.Update(definition, references, prerequisiteIDs); err != nil {
					log.Fatalf("Failed to update definition %s with prerequisites: %v", code, err)
				}
			}
		}
	}

	// Create exercises
	exercises := make(map[string]*models.Exercise)
	for code, ex := range graphData.Exercises {
		difficulty := ex.Difficulty
		if difficulty == "" {
			difficulty = "3" // Default medium difficulty
		}

		exercise := &models.Exercise{
			Code:        code,
			Name:        ex.Name,
			Statement:   ex.Statement,
			Description: ex.Description,
			Hints:       ex.Hints,
			DomainID:    domain.ID,
			OwnerID:     adminUser.ID,
			Verifiable:  ex.Verifiable,
			Result:      ex.Result,
			Difficulty:  difficulty,
			XPosition:   ex.XPosition,
			YPosition:   ex.YPosition,
		}
		
		// Create the exercise with prerequisites
		var prerequisiteIDs []uint
		for _, prereqCode := range ex.Prerequisites {
			if prereqDef, exists := definitions[prereqCode]; exists {
				prerequisiteIDs = append(prerequisiteIDs, prereqDef.ID)
			} else {
				log.Printf("Warning: Prerequisite %s not found for exercise %s", prereqCode, code)
			}
		}
		
		if err := exerciseDAO.Create(exercise, prerequisiteIDs); err != nil {
			log.Fatalf("Failed to create exercise %s: %v", code, err)
		}
		
		exercises[code] = exercise
		fmt.Printf("Created exercise: %s (ID: %d)\n", exercise.Name, exercise.ID)
	}

	fmt.Println("Import completed successfully!")
	os.Exit(0) // Exit after importing
}
