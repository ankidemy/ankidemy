package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/middleware"
	"myapp/server/models"
)

// UserHandler handles user-related HTTP requests
type UserHandler struct {
	userDAO *dao.UserDAO
}

// NewUserHandler creates a new UserHandler
func NewUserHandler(userDAO *dao.UserDAO) *UserHandler {
	return &UserHandler{userDAO: userDAO}
}

// GetAllUsers returns all users (admin only)
func (h *UserHandler) GetAllUsers(c *gin.Context) {
	users, err := h.userDAO.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve users"})
		return
	}
	c.JSON(http.StatusOK, users)
}

// GetUserByID returns a user by ID
func (h *UserHandler) GetUserByID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.userDAO.FindUserByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// GetCurrentUser returns the current authenticated user
func (h *UserHandler) GetCurrentUser(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	user, err := h.userDAO.FindUserByID(userID.(uint))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// UpdateUser updates a user's information
func (h *UserHandler) UpdateUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Check if the user is updating their own profile or is an admin
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	isAdmin, _ := c.Get("isAdmin")
	if userID.(uint) != uint(id) && !isAdmin.(bool) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only update your own profile"})
		return
	}

	// Get existing user
	user, err := h.userDAO.FindUserByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Bind update data
	var updateData struct {
		Username  string `json:"username"`
		Email     string `json:"email"`
		Password  string `json:"password"`
		FirstName string `json:"firstName"`
		LastName  string `json:"lastName"`
		IsActive  *bool  `json:"isActive"`
		IsAdmin   *bool  `json:"isAdmin"`
	}

	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields if provided
	if updateData.Username != "" {
		user.Username = updateData.Username
	}
	if updateData.Email != "" {
		user.Email = updateData.Email
	}
	if updateData.Password != "" {
		user.Password = updateData.Password
	}
	if updateData.FirstName != "" {
		user.FirstName = updateData.FirstName
	}
	if updateData.LastName != "" {
		user.LastName = updateData.LastName
	}

	// Only admins can update these fields
	if isAdmin.(bool) {
		if updateData.IsActive != nil {
			user.IsActive = *updateData.IsActive
		}
		if updateData.IsAdmin != nil {
			user.IsAdmin = *updateData.IsAdmin
		}
	}

	// Update user
	if err := h.userDAO.UpdateUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// UpdateCurrentUser updates the current user's information
func (h *UserHandler) UpdateCurrentUser(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Get existing user
	user, err := h.userDAO.FindUserByID(userID.(uint))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Bind update data
	var updateData struct {
		Username  string `json:"username"`
		Email     string `json:"email"`
		Password  string `json:"password"`
		FirstName string `json:"firstName"`
		LastName  string `json:"lastName"`
	}

	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields if provided
	if updateData.Username != "" {
		user.Username = updateData.Username
	}
	if updateData.Email != "" {
		user.Email = updateData.Email
	}
	if updateData.Password != "" {
		user.Password = updateData.Password
	}
	if updateData.FirstName != "" {
		user.FirstName = updateData.FirstName
	}
	if updateData.LastName != "" {
		user.LastName = updateData.LastName
	}

	// Update user
	if err := h.userDAO.UpdateUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// DeleteUser deletes a user (admin only)
func (h *UserHandler) DeleteUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Delete user
	if err := h.userDAO.DeleteUser(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
}

// RegisterRoutes registers all user-related routes
func (h *UserHandler) RegisterRoutes(router *gin.RouterGroup) {
	users := router.Group("/users")
	{
		// Public routes
		users.POST("/", h.CreateUser)

		// Auth required routes
		authRequired := users.Group("/")
		authRequired.Use(middleware.AuthMiddleware())
		{
			authRequired.GET("/me", h.GetCurrentUser)
			authRequired.PUT("/me", h.UpdateCurrentUser)
		}

		// Admin required routes
		adminRequired := users.Group("/")
		adminRequired.Use(middleware.AuthMiddleware(), middleware.AdminRequired())
		{
			adminRequired.GET("/", h.GetAllUsers)
			adminRequired.GET("/:id", h.GetUserByID)
			adminRequired.PUT("/:id", h.UpdateUser)
			adminRequired.DELETE("/:id", h.DeleteUser)
		}
	}
}

// CreateUser creates a new user
func (h *UserHandler) CreateUser(c *gin.Context) {
	var user models.User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if user already exists
	existingUser, _ := h.userDAO.FindUserByEmail(user.Email)
	if existingUser != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already in use"})
		return
	}

	existingUser, _ = h.userDAO.FindUserByUsername(user.Username)
	if existingUser != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Username already in use"})
		return
	}

	// Set default values
	user.Level = "user"
	user.IsActive = true
	user.IsAdmin = false

	// Create user
	if err := h.userDAO.CreateUser(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, user)
}
