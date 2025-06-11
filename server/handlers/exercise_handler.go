package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/models"
)

// handlers/exercise_handler.go - Fixed type issues

// ExerciseHandler handles exercise-related HTTP requests
type ExerciseHandler struct {
	exerciseDAO *dao.ExerciseDAO
	domainDAO   *dao.DomainDAO
}

// NewExerciseHandler creates a new ExerciseHandler
func NewExerciseHandler(exerciseDAO *dao.ExerciseDAO, domainDAO *dao.DomainDAO) *ExerciseHandler {
	return &ExerciseHandler{
		exerciseDAO: exerciseDAO,
		domainDAO:   domainDAO,
	}
}

// GetDomainExercises returns all exercises for a domain
func (h *ExerciseHandler) GetDomainExercises(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Verify domain exists and check access
	domain, err := h.domainDAO.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the domain is public or the user is the owner
	if domain.Privacy != "public" {
		userID, exists := c.Get("userID")
		if !exists || userID.(uint) != domain.OwnerID {
			isAdmin, adminExists := c.Get("isAdmin")
			if !adminExists || !isAdmin.(bool) {
				c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
				return
			}
		}
	}

	exercises, err := h.exerciseDAO.GetByDomainID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve exercises"})
		return
	}

	// Convert to response format
	responses := make([]models.ExerciseResponse, 0, len(exercises))
	for _, ex := range exercises {
		responses = append(responses, h.exerciseDAO.ConvertToResponse(&ex))
	}

	c.JSON(http.StatusOK, responses)
}

// CreateExercise creates a new exercise
func (h *ExerciseHandler) CreateExercise(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Verify domain exists and check access
	domain, err := h.domainDAO.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to add exercises to this domain"})
			return
		}
	}

	// Bind request data
	var req models.ExerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate difficulty (1-7)
	if req.Difficulty < 1 || req.Difficulty > 7 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Difficulty must be between 1 and 7"})
		return
	}

	// Create exercise
	exercise := &models.Exercise{
		Code:        req.Code,
		Name:        req.Name,
		Statement:   req.Statement,
		Description: req.Description,
		Hints:       req.Hints,
		DomainID:    uint(domainID),
		OwnerID:     userID.(uint),
		Verifiable:  req.Verifiable,
		Result:      req.Result,
		Difficulty:  req.Difficulty,
		XPosition:   req.XPosition,
		YPosition:   req.YPosition,
	}

	if err := h.exerciseDAO.Create(exercise, req.PrerequisiteIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create exercise"})
		return
	}

	// Get the created exercise with prerequisites
	createdEx, err := h.exerciseDAO.FindByIDWithPrerequisites(exercise.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve created exercise"})
		return
	}

	c.JSON(http.StatusCreated, h.exerciseDAO.ConvertToResponse(createdEx))
}

// GetExercise returns an exercise by ID
func (h *ExerciseHandler) GetExercise(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exercise ID"})
		return
	}

	exercise, err := h.exerciseDAO.FindByIDWithPrerequisites(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exercise not found"})
		return
	}

	// Check access to the domain
	domain, err := h.domainDAO.FindByID(exercise.DomainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain information"})
		return
	}

	// Check if the domain is public or the user is the owner
	if domain.Privacy != "public" {
		userID, exists := c.Get("userID")
		if !exists || userID.(uint) != domain.OwnerID {
			isAdmin, adminExists := c.Get("isAdmin")
			if !adminExists || !isAdmin.(bool) {
				c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this exercise"})
				return
			}
		}
	}

	c.JSON(http.StatusOK, h.exerciseDAO.ConvertToResponse(exercise))
}

// UpdateExercise updates an exercise
func (h *ExerciseHandler) UpdateExercise(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exercise ID"})
		return
	}

	// Get existing exercise
	exercise, err := h.exerciseDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exercise not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != exercise.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this exercise"})
			return
		}
	}

	// Bind update data
	var req models.ExerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields if provided
	if req.Name != "" {
		exercise.Name = req.Name
	}
	if req.Statement != "" {
		exercise.Statement = req.Statement
	}
	if req.Description != "" {
		exercise.Description = req.Description
	}
	if req.Hints != "" {
		exercise.Hints = req.Hints
	}
	if req.Result != "" {
		exercise.Result = req.Result
	}
	if req.Difficulty >= 1 && req.Difficulty <= 7 {
		exercise.Difficulty = req.Difficulty
	}
	if req.XPosition != 0 {
		exercise.XPosition = req.XPosition
	}
	if req.YPosition != 0 {
		exercise.YPosition = req.YPosition
	}
	if req.Code != "" {
		exercise.Code = req.Code
	}
	exercise.Verifiable = req.Verifiable

	// Update exercise
	if err := h.exerciseDAO.Update(exercise, req.PrerequisiteIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update exercise"})
		return
	}

	// Get the updated exercise with prerequisites
	updatedEx, err := h.exerciseDAO.FindByIDWithPrerequisites(exercise.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve updated exercise"})
		return
	}

	c.JSON(http.StatusOK, h.exerciseDAO.ConvertToResponse(updatedEx))
}

// DeleteExercise deletes an exercise
func (h *ExerciseHandler) DeleteExercise(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exercise ID"})
		return
	}

	// Get existing exercise
	exercise, err := h.exerciseDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exercise not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != exercise.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to delete this exercise"})
			return
		}
	}

	// Delete exercise
	if err := h.exerciseDAO.Delete(exercise.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete exercise"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Exercise deleted successfully"})
}

// GetExerciseByCode returns exercises by code
func (h *ExerciseHandler) GetExerciseByCode(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exercise code"})
		return
	}

	// Get domain ID from query parameter
	domainID, _ := strconv.ParseUint(c.Query("domainId"), 10, 32)

	var exercises []*models.ExerciseWithPrerequisites
	var err error

	// If domain ID is provided, get specific exercise by code and domain
	if domainID > 0 {
		var exercise *models.ExerciseWithPrerequisites
		exercise, err = h.exerciseDAO.FindByCodeAndDomain(code, uint(domainID))
		if err == nil {
			exercises = []*models.ExerciseWithPrerequisites{exercise}
		}
	} else {
		// Otherwise get all exercises with the given code
		exercises, err = h.exerciseDAO.FindByCode(code)
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exercise not found"})
		return
	}

	// Filter by access permissions and convert to response format
	var responses []models.ExerciseResponse
	for _, exercise := range exercises {
		// Check domain access
		domain, err := h.domainDAO.FindByID(exercise.DomainID)
		if err != nil {
			continue
		}

		// Add to response if domain is public or user has access
		if domain.Privacy == "public" {
			responses = append(responses, h.exerciseDAO.ConvertToResponse(exercise))
			continue
		}

		userID, exists := c.Get("userID")
		if exists && userID.(uint) == domain.OwnerID {
			responses = append(responses, h.exerciseDAO.ConvertToResponse(exercise))
			continue
		}

		isAdmin, adminExists := c.Get("isAdmin")
		if adminExists && isAdmin.(bool) {
			responses = append(responses, h.exerciseDAO.ConvertToResponse(exercise))
		}
	}

	if len(responses) == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to any exercises with this code"})
		return
	}

	c.JSON(http.StatusOK, responses)
}

// VerifyAnswer verifies an exercise answer
func (h *ExerciseHandler) VerifyAnswer(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exercise ID"})
		return
	}

	// Get the exercise
	exercise, err := h.exerciseDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exercise not found"})
		return
	}

	// Check if the exercise is verifiable
	if !exercise.Verifiable {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This exercise is not automatically verifiable"})
		return
	}

	// Bind the answer
	var req struct {
		Answer string `json:"answer" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify the answer
	correct, err := h.exerciseDAO.VerifyExerciseAnswer(exercise.ID, req.Answer)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Return the result
	c.JSON(http.StatusOK, gin.H{
		"correct": correct,
		"message": correct,
	})
}
