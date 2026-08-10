package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"ankidemy/server/middleware"
	"ankidemy/server/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// RegisterRequest represents the registration request data
type RegisterRequest struct {
	Username  string `json:"username" binding:"required"`
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=8"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}

type authUserStore interface {
	AuthenticateUserByIdentifier(identifier, password string) (*models.User, error)
	FindUserByEmail(email string) (*models.User, error)
	FindUserByUsername(username string) (*models.User, error)
	FindUserByID(id uint) (*models.User, error)
	CreateUser(user *models.User) error
}

// AuthHandler handles authentication-related requests
type AuthHandler struct {
	userDAO authUserStore
}

// NewAuthHandler creates a new AuthHandler
func NewAuthHandler(userDAO authUserStore) *AuthHandler {
	return &AuthHandler{userDAO: userDAO}
}

// LoginRequest represents the login request body
// Changed from email-specific to generic identifier
type LoginRequest struct {
	Identifier string `json:"identifier" binding:"required"` // Can be email or username
	Password   string `json:"password" binding:"required"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Token     string      `json:"token"`
	User      models.User `json:"user"`
	ExpiresAt time.Time   `json:"expiresAt"`
}

// RefreshRequest represents the token refresh request
type RefreshRequest struct {
	Token string `json:"token" binding:"required"`
}

// Login handles user login and token generation
// Now supports login with either email or username
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Determine if identifier is email or username and authenticate
	user, err := h.userDAO.AuthenticateUserByIdentifier(req.Identifier, req.Password)
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
		Token:     token,
		User:      *user,
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

	existingUser, err := h.userDAO.FindUserByEmail(req.Email)
	if err == nil && existingUser != nil {
		respondRegistrationConflict(c)
		return
	}
	if err != nil && !isUserNotFoundError(err) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error checking email"})
		return
	}

	existingUser, err = h.userDAO.FindUserByUsername(req.Username)
	if err == nil && existingUser != nil {
		respondRegistrationConflict(c)
		return
	}
	if err != nil && !isUserNotFoundError(err) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error checking username"})
		return
	}

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

	if err := h.userDAO.CreateUser(&user); err != nil {
		if isRegistrationConflictError(err) {
			respondRegistrationConflict(c)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	token, err := middleware.GenerateToken(user.ID, user.IsAdmin)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

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
		return middleware.JWTSecret(), nil
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
			Token:     newToken,
			User:      *user,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
	}
}

func respondRegistrationConflict(c *gin.Context) {
	c.JSON(http.StatusConflict, gin.H{"error": "Registration could not be completed"})
}

func isUserNotFoundError(err error) bool {
	return err != nil && strings.EqualFold(strings.TrimSpace(err.Error()), "user not found")
}

func isRegistrationConflictError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "duplicate key value") || strings.Contains(message, "unique constraint")
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
