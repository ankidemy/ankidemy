package main

import (
	"flag"
	"log"
	"net/http"
	_ "net/http/pprof"
	"os"
	"strings"
	"time"

	"ankidemy/server/dao"
	"ankidemy/server/handlers"
	"ankidemy/server/middleware"
	"ankidemy/server/models"
	"ankidemy/server/services"

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

	// Optional Go profiling endpoint (CPU/heap/goroutine/etc). Enable by
	// setting PPROF_ADDR, e.g. PPROF_ADDR=localhost:6060 — then inspect with
	//   go tool pprof http://localhost:6060/debug/pprof/profile?seconds=15
	// Bind to localhost (or keep the port unpublished in Docker) so profiles
	// are never exposed publicly.
	if pprofAddr := strings.TrimSpace(os.Getenv("PPROF_ADDR")); pprofAddr != "" {
		go func() {
			log.Printf("pprof listening on http://%s/debug/pprof/", pprofAddr)
			if err := http.ListenAndServe(pprofAddr, nil); err != nil {
				log.Printf("pprof server stopped: %v", err)
			}
		}()
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
	domainNetworkDAO := dao.NewDomainNetworkDAO(db)
	permissionDAO := dao.NewDomainPermissionDAO(db)
	inviteDAO := dao.NewDomainInviteDAO(db)
	metaExerciseDAO := dao.NewMetaExerciseDAO(db)
	metaSvc := services.NewMetaExerciseService(db)
	metaDefinitionDAO := dao.NewMetaDefinitionDAO(db)
	metaDefSvc := services.NewMetaDefinitionService(db)
	externalPrerequisiteDAO := dao.NewExternalPrerequisiteDAO(db)
	groupDAO := dao.NewGroupDAO(db)
	sourceDAO := dao.NewSourceDAO(db)
	metaQuestDAO := dao.NewMetaQuestDAO(db)
	relationDAO := dao.NewNodeRelationDAO(db)
	codeRegistryDAO := dao.NewCodeRegistryDAO(db)
	surveyService := services.NewSurveyService(db)
	userDomainSettingsDAO := dao.NewUserDomainSettingsDAO(db)
	pgStatStatementsDAO := dao.NewPGStatStatementsDAO(db)
	queryCache := services.NewQueryCacheServiceFromEnv()
	notificationReadModelService := services.NewNotificationReadModelService(db, queryCache)
	notificationReadModelService.StartWorker()

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
	domainHandler := handlers.NewDomainHandler(domainDAO, progressDAO, importService, permissionDAO, notificationReadModelService) // Added ImportService
	definitionHandler := handlers.NewDefinitionHandler(definitionDAO, domainDAO, metaDefinitionDAO, permissionDAO)
	exerciseHandler := handlers.NewExerciseHandler(exerciseDAO, domainDAO, permissionDAO)
	progressHandler := handlers.NewProgressHandler(progressDAO, domainDAO, permissionDAO)
	graphHandler := handlers.NewGraphHandler(graphDAO, domainDAO, permissionDAO, sourceDAO, metaQuestDAO)
	domainNetworkHandler := handlers.NewDomainNetworkHandler(domainNetworkDAO, domainDAO, permissionDAO)
	srsHandler := handlers.NewSRSHandler(db, permissionDAO, notificationReadModelService, queryCache)
	metaExerciseHandler := handlers.NewMetaExerciseHandler(metaExerciseDAO, domainDAO, metaSvc, permissionDAO)
	metaDefinitionHandler := handlers.NewMetaDefinitionHandler(metaDefinitionDAO, domainDAO, metaDefSvc, permissionDAO)
	mediaHandler := handlers.NewMediaHandler(domainDAO, progressDAO, permissionDAO)
	domainAccessHandler := handlers.NewDomainAccessHandler(domainDAO, permissionDAO, inviteDAO, userDAO, progressDAO, notificationReadModelService)
	externalPrerequisiteHandler := handlers.NewExternalPrerequisiteHandler(domainDAO, permissionDAO, externalPrerequisiteDAO, metaDefinitionDAO, metaExerciseDAO)
	groupHandler := handlers.NewGroupHandler(groupDAO, domainDAO, permissionDAO, metaDefinitionDAO, metaExerciseDAO)
	sourceHandler := handlers.NewSourceHandler(sourceDAO, domainDAO, permissionDAO, codeRegistryDAO)
	questHandler := handlers.NewQuestHandler(metaQuestDAO, domainDAO, permissionDAO, codeRegistryDAO, relationDAO, surveyService)
	relationHandler := handlers.NewRelationHandler(relationDAO, domainDAO, permissionDAO, metaDefinitionDAO, metaExerciseDAO, sourceDAO, metaQuestDAO)
	surveyHandler := handlers.NewSurveyHandler(domainDAO, permissionDAO, metaQuestDAO, surveyService)
	userDomainSettingsHandler := handlers.NewUserDomainSettingsHandler(domainDAO, permissionDAO, userDomainSettingsDAO, queryCache)
	adminObservabilityHandler := handlers.NewAdminObservabilityHandler(pgStatStatementsDAO)

	// Initialize router
	router := gin.Default()
	router.Use(middleware.RequestObservability())
	abuseLimiter := middleware.NewAbuseLimiter()

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
	config.AllowHeaders = []string{
		"Origin",
		"Content-Length",
		"Content-Type",
		"Authorization",
		"X-Client-Component",
		"X-Client-Action",
		"X-Request-ID",
	}
	config.ExposeHeaders = []string{"X-Request-ID"}
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
			auth.POST("/login", middleware.AbuseThrottle(abuseLimiter, middleware.RateLimitPolicy{
				Scope:       "auth.login",
				MaxRequests: 10,
				Window:      time.Minute,
			}), authHandler.Login)
			auth.POST("/register", middleware.AbuseThrottle(abuseLimiter, middleware.RateLimitPolicy{
				Scope:       "auth.register",
				MaxRequests: 5,
				Window:      10 * time.Minute,
			}), authHandler.Register)
			auth.POST("/refresh", middleware.AbuseThrottle(abuseLimiter, middleware.RateLimitPolicy{
				Scope:       "auth.refresh",
				MaxRequests: 20,
				Window:      time.Minute,
			}), authHandler.RefreshToken)
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
				domains.GET("/accessible", domainAccessHandler.GetAccessibleDomains)
				domains.GET("/my", domainHandler.GetMyDomains)
				domains.GET("/archived/my", domainHandler.GetMyArchivedDomains)
				domains.GET("/shared", domainAccessHandler.GetSharedDomains)
				domains.GET("/enrolled", domainHandler.GetEnrolledDomains)
				domains.GET("/:id", domainHandler.GetDomain)
				domains.PUT("/:id", domainHandler.UpdateDomain)
				domains.DELETE("/:id", domainHandler.DeleteDomain)
				domains.POST("/:id/restore", domainHandler.RestoreDomain)
				domains.DELETE("/:id/purge", domainHandler.PurgeDomain)
				domains.POST("/:id/enroll", domainHandler.EnrollInDomain)
				domains.POST("/:id/copy", domainHandler.CopyDomain)
				domains.POST("/:id/import", domainHandler.ImportToDomain) // NEW: Import to existing domain
				domains.POST("/:id/invites", domainAccessHandler.CreateInvite)
				domains.GET("/:id/permissions", domainAccessHandler.ListPermissions)
				domains.DELETE("/:id/permissions/:userId", domainAccessHandler.RemovePermission)

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
				// Meta Exercises (pools)
				domains.GET("/:id/meta-exercises", metaExerciseHandler.GetDomainMetaExercises)
				domains.POST("/:id/meta-exercises", metaExerciseHandler.CreateMetaExercise)

				// Meta Definitions (pools)
				domains.GET("/:id/meta-definitions", metaDefinitionHandler.GetDomainMetaDefinitions)
				domains.POST("/:id/meta-definitions", metaDefinitionHandler.CreateMetaDefinition)

				// Sources
				domains.GET("/:id/sources", sourceHandler.ListVisibleSources)
				domains.POST("/:id/sources", sourceHandler.CreateSource)

				// Quests
				domains.GET("/:id/quests", questHandler.ListVisibleQuests)
				domains.POST("/:id/quests", questHandler.CreateQuest)

				// Relations
				domains.GET("/:id/relations", relationHandler.ListVisibleRelations)
				domains.POST("/:id/relations", relationHandler.CreateRelation)

				// External prerequisites
				domains.GET("/:id/external-prerequisites", externalPrerequisiteHandler.ListByDomain)
				domains.POST("/:id/external-prerequisites", externalPrerequisiteHandler.Create)
				domains.DELETE("/:id/external-prerequisites/:linkId", externalPrerequisiteHandler.Delete)
				domains.PUT("/:id/external-prerequisites/positions", externalPrerequisiteHandler.UpdatePositions)

				// Node groups
				domains.GET("/:id/groups", groupHandler.ListByDomain)
				domains.POST("/:id/groups", groupHandler.Create)
				domains.PUT("/:id/groups/positions", groupHandler.UpdatePositions)

				// User domain settings
				domains.GET("/:id/user-settings", userDomainSettingsHandler.Get)
				domains.PUT("/:id/user-settings", userDomainSettingsHandler.Update)

				// Graph operations (graph export and positions)
				domains.GET("/:id/graph", graphHandler.GetVisualGraph)
				domains.PUT("/:id/graph/positions", graphHandler.UpdatePositions)
				domains.GET("/:id/export", graphHandler.ExportDomain)
				// Optional: import GraphData (graph-only format) via a dedicated route
				domains.POST("/:id/import-graph", graphHandler.ImportDomain)
				// ImportService import/export (round-trip compatible format)
				domains.GET("/:id/export-data", domainHandler.ExportImportData)
				// Full backup import/export (zip)
				domains.GET("/:id/backup", domainHandler.ExportBackup)
				domains.POST("/:id/import-backup", domainHandler.ImportBackup)
				// Import is handled by domainHandler.ImportToDomain above
			}

			// Group routes
			groups := authorized.Group("/groups")
			{
				groups.PATCH("/:id", groupHandler.Update)
				groups.DELETE("/:id", groupHandler.Delete)
				groups.PUT("/:id/state", groupHandler.UpdateState)
			}

			// Domain network routes (user-defined links between domains)
			network := authorized.Group("/network")
			{
				network.GET("/links", domainNetworkHandler.GetLinks)
				network.POST("/links", domainNetworkHandler.CreateLink)
				network.DELETE("/links/:id", domainNetworkHandler.DeleteLink)
			}

			// Domain invite routes
			authorized.GET("/domain-invites", domainAccessHandler.ListMyInvites)
			authorized.POST("/domain-invites/:id/accept", domainAccessHandler.AcceptInvite)
			authorized.POST("/domain-invites/:id/decline", domainAccessHandler.DeclineInvite)

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
				exercises.POST("/:id/verify", middleware.AbuseThrottle(abuseLimiter, middleware.RateLimitPolicy{
					Scope:       "exercise.verify",
					MaxRequests: 30,
					Window:      time.Minute,
				}), exerciseHandler.VerifyAnswer)
			}

			// Meta-exercise routes
			metas := authorized.Group("/meta-exercises")
			{
				metas.GET("/:id", metaExerciseHandler.GetMetaExercise)
				metas.PUT("/:id", metaExerciseHandler.UpdateMetaExercise)
				metas.DELETE("/:id", metaExerciseHandler.DeleteMetaExercise)
				metas.GET("/:id/next-version", metaExerciseHandler.GetNextVersion)
				metas.POST("/:id/record-outcome", metaExerciseHandler.RecordOutcome)
				metas.POST("/:id/versions", metaExerciseHandler.AddVersion)
				metas.PUT("/:id/versions/:versionId", metaExerciseHandler.UpdateVersion)
				metas.DELETE("/:id/versions/:versionId", metaExerciseHandler.DeleteVersion)
			}

			// Meta-definition routes
			metaDefs := authorized.Group("/meta-definitions")
			{
				metaDefs.GET("/:id", metaDefinitionHandler.GetMetaDefinition)
				metaDefs.PUT("/:id", metaDefinitionHandler.UpdateMetaDefinition)
				metaDefs.DELETE("/:id", metaDefinitionHandler.DeleteMetaDefinition)
				metaDefs.GET("/:id/next-version", metaDefinitionHandler.GetNextVersion)
				metaDefs.GET("/:id/next-exercise", metaDefinitionHandler.GetNextExercise)
				metaDefs.POST("/:id/versions", metaDefinitionHandler.AddVersion)
				metaDefs.PUT("/:id/versions/:versionId", metaDefinitionHandler.UpdateVersion)
				metaDefs.DELETE("/:id/versions/:versionId", metaDefinitionHandler.DeleteVersion)
			}

			// Source routes
			sources := authorized.Group("/sources")
			{
				sources.GET("/:id", sourceHandler.GetSource)
				sources.PATCH("/:id", sourceHandler.UpdateSource)
				sources.DELETE("/:id", sourceHandler.DeleteSource)
			}

			// Quest routes
			quests := authorized.Group("/quests")
			{
				quests.GET("/:id", questHandler.GetQuest)
				quests.PATCH("/:id", questHandler.UpdateQuest)
				quests.DELETE("/:id", questHandler.DeleteQuest)
				quests.POST("/:id/versions", questHandler.AddVersion)
				quests.PATCH("/:id/versions/:versionId", questHandler.UpdateVersion)
				quests.DELETE("/:id/versions/:versionId", questHandler.DeleteVersion)
				quests.PUT("/:id/versions/:versionId/relevant", questHandler.UpdateRelevantLinks)
			}

			// Relation routes
			authorized.DELETE("/relations/:id", relationHandler.DeleteRelation)

			// Progress routes (domain enrollment overview)
			progress := authorized.Group("/progress")
			{
				progress.GET("/domains", progressHandler.GetDomainProgress)
			}

			// SRS ROUTES
			srs := authorized.Group("/srs")
			{
				// Review endpoints
				srs.POST("/reviews", srsHandler.SubmitReview)
				srs.GET("/domains/:domainId/due", srsHandler.GetDueReviews)
				srs.GET("/domains/:domainId/review-queue", srsHandler.GetReviewQueue)
				srs.GET("/reviews/history", srsHandler.GetReviewHistory)

				// Progress endpoints
				srs.GET("/domains/:domainId/progress", srsHandler.GetDomainProgress)
				srs.GET("/domains/:domainId/stats", srsHandler.GetDomainStats)
				srs.GET("/notifications/summary", srsHandler.GetNotificationSummary)
				srs.PUT("/nodes/status", srsHandler.UpdateNodeStatus)

				// Session endpoints (server-driven session engine)
				srs.POST("/sessions", srsHandler.StartSession)
				srs.GET("/sessions/:sessionId/item", srsHandler.GetSessionItem)
				srs.POST("/sessions/:sessionId/grade", srsHandler.GradeSession)
				srs.PUT("/sessions/:sessionId/end", srsHandler.EndSession)
				srs.GET("/sessions", srsHandler.GetUserSessions)

				// Prerequisites endpoints
				srs.POST("/prerequisites", srsHandler.CreatePrerequisite)
				srs.GET("/domains/:domainId/prerequisites", srsHandler.GetPrerequisites)
				srs.PUT("/prerequisites/:prerequisiteId", srsHandler.UpdatePrerequisite)
				srs.DELETE("/prerequisites/:prerequisiteId", srsHandler.DeletePrerequisite)

				// Test/Debug endpoints
				srs.POST("/test/credit-propagation", middleware.AdminRequired(), srsHandler.TestCreditPropagation)
			}

			// Survey routes
			survey := authorized.Group("/survey")
			{
				survey.GET("/domains/:id/queue", surveyHandler.GetQueue)
				survey.GET("/domains/:id/stats", surveyHandler.GetStats)
				survey.POST("/events", middleware.AbuseThrottle(abuseLimiter, middleware.RateLimitPolicy{
					Scope:       "survey.events",
					MaxRequests: 60,
					Window:      time.Minute,
				}), surveyHandler.PostEvent)
			}

			// Media routes
			authorized.POST("/media/upload", mediaHandler.UploadImage)
			authorized.GET("/media/:userId/:visibility/:domain/:filename", mediaHandler.GetImage)

			// Admin routes
			admin := authorized.Group("/admin")
			admin.Use(middleware.AdminRequired())
			{
				admin.GET("/users", userHandler.GetAllUsers)
				admin.GET("/db/query-stats", adminObservabilityHandler.GetDBQueryStats)
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

	// Report definitions, meta-exercises and total versions for clarity
	metaCount := 0
	versionCount := 0
	if importData.MetaExercises != nil {
		metaCount = len(importData.MetaExercises)
		for _, me := range importData.MetaExercises {
			versionCount += len(me.Versions)
		}
	}
	log.Printf("Successfully read import data: definitions=%d, metaExercises=%d, versions=%d, legacyExercises=%d",
		len(importData.Definitions), metaCount, versionCount, len(importData.Exercises))

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
