package middleware

import (
	"net/http"
	"strings"
	"time"
	"os"
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// JWTSecret is the secret key used to sign JWT tokens
var JWTSecret = []byte(getJWTSecret())

// getJWTSecret returns the JWT secret from environment or a default
func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// For development only - in production, always set this environment variable
		return "your-default-jwt-secret-for-dev"
	}
	return secret
}

// Claims represents the JWT claims
type Claims struct {
	UserID  uint   `json:"userId"`
	IsAdmin bool   `json:"isAdmin"`
	jwt.RegisteredClaims
}

// GenerateToken generates a new JWT token for a user
func GenerateToken(userID uint, isAdmin bool) (string, error) {
	// Create the claims
	claims := &Claims{
		UserID:  userID,
		IsAdmin: isAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)), // 24 hours
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "ankidemy",
			Subject:   fmt.Sprintf("%d", userID),
		},
	}

	// Create the token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign the token with the secret key
	tokenString, err := token.SignedString(JWTSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// AuthMiddleware validates JWT tokens and sets the user in the context
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract token from header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Format should be "Bearer {token}"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		// Validate token
		token, err := jwt.ParseWithClaims(parts[1], &Claims{}, func(token *jwt.Token) (interface{}, error) {
			return JWTSecret, nil
		})

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Extract claims
		if claims, ok := token.Claims.(*Claims); ok && token.Valid {
			// Set user ID in context
			c.Set("userID", claims.UserID)
			c.Set("isAdmin", claims.IsAdmin)
			c.Next()
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}
	}
}

// AdminRequired ensures the user is an admin
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		isAdmin, exists := c.Get("isAdmin")
		if !exists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin privileges required"})
			c.Abort()
			return
		}
		c.Next()
	}
}
