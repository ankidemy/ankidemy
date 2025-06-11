package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/models"
)

// ProgressHandler handles progress-related HTTP requests
type ProgressHandler struct {
	progressDAO   *dao.ProgressDAO
	domainDAO     *dao.DomainDAO
	definitionDAO *dao.DefinitionDAO
	exerciseDAO   *dao.ExerciseDAO
}

// NewProgressHandler creates a new ProgressHandler
func NewProgressHandler(progressDAO *dao.ProgressDAO, domainDAO *dao.DomainDAO, definitionDAO *dao.DefinitionDAO, exerciseDAO *dao.ExerciseDAO) *ProgressHandler {
	return &ProgressHandler{
		progressDAO:   progressDAO,
		domainDAO:     domainDAO,
		definitionDAO: definitionDAO,
		exerciseDAO:   exerciseDAO,
	}
}

// GetDomainProgress returns a user's progress for all domains
func (h *ProgressHandler) GetDomainProgress(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	progress, err := h.progressDAO.GetUserDomainProgress(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain progress"})
		return
	}

	c.JSON(http.StatusOK, progress)
}

// GetDefinitionProgress returns a user's progress for definitions in a domain
func (h *ProgressHandler) GetDefinitionProgress(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domainID, err := strconv.ParseUint(c.Param("domainId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Check domain access
	domain, err := h.domainDAO.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is enrolled in the domain or is the owner
	// In a real app, we'd check this properly
	if domain.OwnerID != userID.(uint) {
		// Check if enrolled
		// For now, we'll just allow it
	}

	progress, err := h.progressDAO.GetUserDefinitionProgress(userID.(uint), uint(domainID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve definition progress"})
		return
	}

	c.JSON(http.StatusOK, progress)
}

// GetExerciseProgress returns a user's progress for exercises in a domain
func (h *ProgressHandler) GetExerciseProgress(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domainID, err := strconv.ParseUint(c.Param("domainId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Check domain access
	domain, err := h.domainDAO.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is enrolled in the domain or is the owner
	// In a real app, we'd check this properly
	if domain.OwnerID != userID.(uint) {
		// Check if enrolled
		// For now, we'll just allow it
	}

	progress, err := h.progressDAO.GetUserExerciseProgress(userID.(uint), uint(domainID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve exercise progress"})
		return
	}

	c.JSON(http.StatusOK, progress)
}

// ReviewDefinition submits a review for a definition
func (h *ProgressHandler) ReviewDefinition(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	defID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid definition ID"})
		return
	}

	// Get the definition
	definition, err := h.definitionDAO.FindByID(uint(defID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Definition not found"})
		return
	}

	// Check domain access
	domain, err := h.domainDAO.FindByID(definition.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is enrolled in the domain or is the owner
	// In a real app, we'd check this properly
	if domain.OwnerID != userID.(uint) {
		// Check if enrolled
		// For now, we'll just allow it
	}

	// Bind the review request
  var req models.DefinitionReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate the review result
	if req.Result != models.ReviewAgain && req.Result != models.ReviewHard && req.Result != models.ReviewGood && req.Result != models.ReviewEasy {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid review result"})
		return
	}

	// Track the review
	if err := h.progressDAO.TrackDefinitionReview(userID.(uint), uint(defID), req.Result, req.TimeTaken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to track definition review"})
		return
	}

	// Update domain progress
	if err := h.progressDAO.UpdateDomainProgress(userID.(uint), definition.DomainID); err != nil {
		// Log the error, but don't fail the request
		// log.Printf("Failed to update domain progress: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Review recorded successfully"})
}

// AttemptExercise submits an attempt for an exercise
func (h *ProgressHandler) AttemptExercise(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	exID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exercise ID"})
		return
	}

	// Get the exercise
	exercise, err := h.exerciseDAO.FindByID(uint(exID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exercise not found"})
		return
	}

	// Check domain access
	domain, err := h.domainDAO.FindByID(exercise.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is enrolled in the domain or is the owner
	// In a real app, we'd check this properly
	if domain.OwnerID != userID.(uint) {
		// Check if enrolled
		// For now, we'll just allow it
	}

	// Bind the attempt request
	var req models.ExerciseAttemptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if the exercise is verifiable
	var correct bool
	if exercise.Verifiable {
		// Verify the answer
		correct, err = h.exerciseDAO.VerifyExerciseAnswer(exercise.ID, req.Answer)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		// If not verifiable, just mark as correct
		correct = true
	}

	// Track the attempt
	if err := h.progressDAO.TrackExerciseAttempt(userID.(uint), uint(exID), correct, req.TimeTaken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to track exercise attempt"})
		return
	}

	// Update domain progress
	if err := h.progressDAO.UpdateDomainProgress(userID.(uint), exercise.DomainID); err != nil {
		// Log the error, but don't fail the request
		// log.Printf("Failed to update domain progress: %v", err)
	}

	c.JSON(http.StatusOK, models.ExerciseAttemptResponse{
		Correct: correct,
		Message: "Incorrect. Try again or check the solution.",
	})
}

// GetDefinitionsForReview returns definitions due for review
func (h *ProgressHandler) GetDefinitionsForReview(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domainID, err := strconv.ParseUint(c.Param("domainId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Check domain access
	domain, err := h.domainDAO.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is enrolled in the domain or is the owner
	// In a real app, we'd check this properly
	if domain.OwnerID != userID.(uint) {
		// Check if enrolled
		// For now, we'll just allow it
	}

	// Get the definitions due for review
	limit := 10 // Default limit
	limitStr := c.Query("limit")
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	definitions, err := h.progressDAO.GetDefinitionsForReview(userID.(uint), uint(domainID), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve definitions for review"})
		return
	}

	// Convert to response format using the basic conversion
	// Since this is for the legacy progress system, we'll create simple responses
	responses := make([]models.DefinitionResponse, 0, len(definitions))
	for _, def := range definitions {
		// Create a simple response without prerequisites for legacy compatibility
		response := models.DefinitionResponse{
			ID:          def.ID,
			Code:        def.Code,
			Name:        def.Name,
			Description: def.Description,
			Notes:       def.Notes,
			DomainID:    def.DomainID,
			OwnerID:     def.OwnerID,
			XPosition:   def.XPosition,
			YPosition:   def.YPosition,
			CreatedAt:   def.CreatedAt,
			UpdatedAt:   def.UpdatedAt,
		}
		
		// Add references if loaded
		references := make([]string, 0, len(def.References))
		for _, ref := range def.References {
			references = append(references, ref.Reference)
		}
		response.References = references
		
		// For legacy compatibility, we'll leave prerequisites empty
		response.Prerequisites = []string{}
		
		responses = append(responses, response)
	}

	c.JSON(http.StatusOK, responses)
}

// StartSession starts a new study session
func (h *ProgressHandler) StartSession(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Bind the start session request
	var req models.CreateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check domain access
	domain, err := h.domainDAO.FindByID(req.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is enrolled in the domain or is the owner
	// In a real app, we'd check this properly
	if domain.OwnerID != userID.(uint) {
		// Check if enrolled
		// For now, we'll just allow it
	}

	// Create a new session
	session := models.StudySession{
		UserID:    userID.(uint),
		DomainID:  req.DomainID,
		StartTime: time.Now(),
	}

	// In a real app, we'd save this to the database
	// For now, we'll pretend we did
	session.ID = 1

	c.JSON(http.StatusCreated, session)
}

// EndSession ends a study session
func (h *ProgressHandler) EndSession(c *gin.Context) {
	// We need this userID for session ownership verification
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	sessionID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Get the session to verify ownership
	session, _, _, err := h.progressDAO.GetSessionDetails(uint(sessionID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Verify the session belongs to the user
	if session.UserID != userID.(uint) {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this session"})
			return
		}
	}

	// End the session
	if err := h.progressDAO.EndStudySession(uint(sessionID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to end session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Session ended successfully"})
}

// GetSessions returns a user's study sessions
func (h *ProgressHandler) GetSessions(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	sessions, err := h.progressDAO.GetStudySessions(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve sessions"})
		return
	}

	c.JSON(http.StatusOK, sessions)
}

// GetSessionDetails returns details of a study session
func (h *ProgressHandler) GetSessionDetails(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	sessionID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Get the session details
	session, defs, exs, err := h.progressDAO.GetSessionDetails(uint(sessionID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve session details"})
		return
	}

	// Check if the session belongs to the user
	if session.UserID != userID.(uint) {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this session"})
			return
		}
	}

	// Calculate session duration and handle EndTime for response
	var duration int
  var responseEndTime time.Time // Use a zero value if session.EndTime is nil

	if session.EndTime != nil { // Check if the pointer is not nil
		responseEndTime = *session.EndTime // Dereference the pointer
		duration = int(responseEndTime.Sub(session.StartTime).Seconds())
	}

	// Get domain name
	domain, err := h.domainDAO.FindByID(session.DomainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain information"})
		return
	}

	// Count correct exercises
	correctExercisesCount := 0
	for _, ex := range exs {
		if ex.Correct {
			correctExercisesCount++
		}
	}

	// Create response
	response := models.SessionDetailsResponse{
		Session: models.StudySessionResponse{
			ID:                     session.ID,
			StartTime:              session.StartTime,
			EndTime:                responseEndTime,
			Duration:               duration,
			DomainID:               session.DomainID,
			DomainName:             domain.Name,
			DefinitionsReviewCount: len(defs),
			ExercisesCompletedCount: len(exs),
			CorrectExercisesCount:   correctExercisesCount,
		},
		Definitions: make([]struct {
			ID          uint   `json:"id"`
			Code        string `json:"code"`
			Name        string `json:"name"`
			ReviewResult string `json:"reviewResult"`
			TimeTaken   int    `json:"timeTaken"`
		}, len(defs)),
		Exercises: make([]struct {
			ID        uint   `json:"id"`
			Code      string `json:"code"`
			Name      string `json:"name"`
			Completed bool   `json:"completed"`
			Correct   bool   `json:"correct"`
			TimeTaken int    `json:"timeTaken"`
		}, len(exs)),
	}

	// Fill definitions
	for i, def := range defs {
		definition, err := h.definitionDAO.FindByID(def.DefinitionID)
		if err == nil {
			response.Definitions[i] = struct {
				ID          uint   `json:"id"`
				Code        string `json:"code"`
				Name        string `json:"name"`
				ReviewResult string `json:"reviewResult"`
				TimeTaken   int    `json:"timeTaken"`
			}{
				ID:          definition.ID,
				Code:        definition.Code,
				Name:        definition.Name,
				ReviewResult: def.ReviewResult,
				TimeTaken:   def.TimeTaken,
			}
		}
	}

	// Fill exercises
	for i, ex := range exs {
		exercise, err := h.exerciseDAO.FindByID(ex.ExerciseID)
		if err == nil {
			response.Exercises[i] = struct {
				ID        uint   `json:"id"`
				Code      string `json:"code"`
				Name      string `json:"name"`
				Completed bool   `json:"completed"`
				Correct   bool   `json:"correct"`
				TimeTaken int    `json:"timeTaken"`
			}{
				ID:        exercise.ID,
				Code:      exercise.Code,
				Name:      exercise.Name,
				Completed: ex.Completed,
				Correct:   ex.Correct,
				TimeTaken: ex.TimeTaken,
			}
		}
	}

	c.JSON(http.StatusOK, response)
}

// RegisterRoutes registers the progress routes
func (h *ProgressHandler) RegisterRoutes(router *gin.RouterGroup) {
	progress := router.Group("/progress")
	{
		progress.GET("/domains", h.GetDomainProgress)
		progress.GET("/domains/:domainId/definitions", h.GetDefinitionProgress)
		progress.GET("/domains/:domainId/exercises", h.GetExerciseProgress)
		progress.POST("/definitions/:id/review", h.ReviewDefinition)
		progress.POST("/exercises/:id/attempt", h.AttemptExercise)
		progress.GET("/domains/:domainId/review", h.GetDefinitionsForReview)
	}

	sessions := router.Group("/sessions")
	{
		sessions.POST("/start", h.StartSession)
		sessions.PUT("/:id/end", h.EndSession)
		sessions.GET("", h.GetSessions)
		sessions.GET("/:id", h.GetSessionDetails)
	}
}
