package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"myapp/server/dao"
	"myapp/server/middleware"
	"myapp/server/models"
)

// RegisterRequest represents the registration request data
type RegisterRequest struct {
    Username  string `json:"username" binding:"required"`
    Email     string `json:"email" binding:"required,email"`
    Password  string `json:"password" binding:"required,min=8"` // Now password will be bound
    FirstName string `json:"firstName"`
    LastName  string `json:"lastName"`
}

// AuthHandler handles authentication-related requests
type AuthHandler struct {
	userDAO *dao.UserDAO
}

// NewAuthHandler creates a new AuthHandler
func NewAuthHandler(userDAO *dao.UserDAO) *AuthHandler {
	return &AuthHandler{userDAO: userDAO}
}

// LoginRequest represents the login request body
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Token    string       `json:"token"`
	User     models.User `json:"user"`
	ExpiresAt time.Time   `json:"expiresAt"`
}

// RefreshRequest represents the token refresh request
type RefreshRequest struct {
	Token string `json:"token" binding:"required"`
}

// Login handles user login and token generation
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Authenticate user
	user, err := h.userDAO.AuthenticateUser(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Generate token
	token, err := middleware.GenerateToken(user.ID, user.IsAdmin)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Return response
	c.JSON(http.StatusOK, LoginResponse{
		Token:    token,
		User:     *user,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	})
}

// Register handles user registration
func (h *AuthHandler) Register(c *gin.Context) {
    var req RegisterRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Check if email already exists
    existingUser, err := h.userDAO.FindUserByEmail(req.Email)
    // If no error and user exists = conflict
    if err == nil && existingUser != nil {
        c.JSON(http.StatusConflict, gin.H{"error": "Email already in use"})
        return
    }
    // If error but not "not found" error = server error
    if err != nil && err.Error() != "user not found" {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error checking email"})
        return
    }

    // Check if username already exists
    existingUser, err = h.userDAO.FindUserByUsername(req.Username)
    // If no error and user exists = conflict
    if err == nil && existingUser != nil {
        c.JSON(http.StatusConflict, gin.H{"error": "Username already in use"})
        return
    }
    // If error but not "not found" error = server error
    if err != nil && err.Error() != "user not found" {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Error checking username"})
        return
    }

    // Create user from request data
    user := models.User{
        Username:  req.Username,
        Email:     req.Email,
        Password:  req.Password,
        FirstName: req.FirstName,
        LastName:  req.LastName,
        Level:     "user",
        IsActive:  true,
        IsAdmin:   false,
    }

    // Create user
    if err := h.userDAO.CreateUser(&user); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
        return
    }

    // Generate token
    token, err := middleware.GenerateToken(user.ID, user.IsAdmin)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
        return
    }

    // Return response
    c.JSON(http.StatusCreated, LoginResponse{
        Token:     token,
        User:      user,
        ExpiresAt: time.Now().Add(24 * time.Hour),
    })
}

// RefreshToken handles token refresh
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse token
	token, err := jwt.ParseWithClaims(req.Token, &middleware.Claims{}, func(token *jwt.Token) (interface{}, error) {
		return middleware.JWTSecret, nil
	})

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	// Extract claims
	if claims, ok := token.Claims.(*middleware.Claims); ok && token.Valid {
		// Get user
		user, err := h.userDAO.FindUserByID(claims.UserID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		// Generate new token
		newToken, err := middleware.GenerateToken(user.ID, user.IsAdmin)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}

		// Return response
		c.JSON(http.StatusOK, LoginResponse{
			Token:    newToken,
			User:     *user,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
	}
}

// RegisterRoutes registers the auth routes
func (h *AuthHandler) RegisterRoutes(router *gin.RouterGroup) {
	auth := router.Group("/auth")
	{
		auth.POST("/login", h.Login)
		auth.POST("/register", h.Register)
		auth.POST("/refresh", h.RefreshToken)
	}
}
