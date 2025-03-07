package handlers

import (
	"myapp/server/dao"
	"myapp/server/models"

	"github.com/gin-gonic/gin"
)

// UserHandler handles user-related HTTP requests
type UserHandler struct {
	userDAO *dao.UserDAO
}

// NewUserHandler creates a new UserHandler
func NewUserHandler(userDAO *dao.UserDAO) *UserHandler {
	return &UserHandler{userDAO: userDAO}
}

// Login handles the user login process
func (h *UserHandler) Login(c *gin.Context) {
	var loginReq models.LoginRequest
	if err := c.ShouldBindJSON(&loginReq); err != nil {
		c.JSON(400, models.LoginResponse{Success: false, Message: "Invalid request body"})
		return
	}

	// Find the user by email
	user, err := h.userDAO.FindUserByEmail(loginReq.Email)
	if err != nil {
		c.JSON(401, models.LoginResponse{Success: false, Message: "Invalid credentials"})
		return
	}

	// IMPORTANT: In a real app, use bcrypt to compare passwords
	// For now, we're doing a direct comparison as in the original code
	if loginReq.Password != user.Password {
		c.JSON(401, models.LoginResponse{Success: false, Message: "Invalid credentials"})
		return
	}

	// Successful login
	c.JSON(200, models.LoginResponse{
		Success: true, 
		Message: "Login successful",
		UserID:  user.ID,
		Level:   user.Level,
	})
}

// GetUsers handles retrieving all users
func (h *UserHandler) GetUsers(c *gin.Context) {
	users, err := h.userDAO.GetAllUsers()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to retrieve users"})
		return
	}
	c.JSON(200, users)
}

// RegisterRoutes registers all user-related routes
func (h *UserHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.POST("/login", h.Login)
	router.GET("/users", h.GetUsers)
}
