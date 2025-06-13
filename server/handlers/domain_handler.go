package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/models"
)

// DomainHandler handles domain-related HTTP requests
type DomainHandler struct {
	domainDAO   *dao.DomainDAO
	progressDAO *dao.ProgressDAO
}

// NewDomainHandler creates a new DomainHandler
func NewDomainHandler(domainDAO *dao.DomainDAO, progressDAO *dao.ProgressDAO) *DomainHandler {
	return &DomainHandler{
		domainDAO:   domainDAO,
		progressDAO: progressDAO,
	}
}

// GetDomains returns all domains (without stats)
func (h *DomainHandler) GetDomains(c *gin.Context) {
	domains, err := h.domainDAO.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domains"})
		return
	}
	c.JSON(http.StatusOK, domains)
}

// GetPublicDomains returns all public domains with stats
func (h *DomainHandler) GetPublicDomains(c *gin.Context) {
	domains, err := h.domainDAO.GetPublicDomainsWithStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve public domains"})
		return
	}
	c.JSON(http.StatusOK, domains)
}

// GetMyDomains returns domains owned by the current user with stats
func (h *DomainHandler) GetMyDomains(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domains, err := h.domainDAO.GetByOwnerIDWithStats(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve your domains"})
		return
	}
	c.JSON(http.StatusOK, domains)
}

// GetEnrolledDomains returns domains the user is enrolled in, with stats
func (h *DomainHandler) GetEnrolledDomains(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Get the progress records
	progress, err := h.progressDAO.GetUserDomainProgress(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve enrolled domains"})
		return
	}

	// Collect domain IDs from progress
	domainIDs := make([]uint, 0, len(progress))
	for _, p := range progress {
		domainIDs = append(domainIDs, p.DomainID)
	}

	// Get the actual domain objects with their stats
	domains, err := h.domainDAO.GetByIDsWithStats(domainIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain details"})
		return
	}

	c.JSON(http.StatusOK, domains)
}

// GetDomain returns a domain by ID with stats
func (h *DomainHandler) GetDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	domainWithStats, err := h.domainDAO.FindByIDWithStats(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the domain is public or the user is the owner
	if domainWithStats.Privacy != "public" {
		userID, exists := c.Get("userID")
		if !exists || userID.(uint) != domainWithStats.OwnerID {
			isAdmin, adminExists := c.Get("isAdmin")
			if !adminExists || !isAdmin.(bool) {
				c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
				return
			}
		}
	}

	c.JSON(http.StatusOK, domainWithStats)
}

// CreateDomain creates a new domain and returns it with stats
func (h *DomainHandler) CreateDomain(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	var domain models.Domain
	if err := c.ShouldBindJSON(&domain); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set owner
	domain.OwnerID = userID.(uint)

	// Create domain
	if err := h.domainDAO.Create(&domain); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create domain"})
		return
	}

	// Enroll the owner in the domain
	if err := h.progressDAO.EnrollUserInDomain(userID.(uint), domain.ID); err != nil {
		// Just log the error, don't fail the request
	}

	// Return the newly created domain with its initial stats
	domainWithStats, err := h.domainDAO.FindByIDWithStats(domain.ID)
	if err != nil {
		c.JSON(http.StatusCreated, domain) // Fallback to returning without stats
		return
	}

	c.JSON(http.StatusCreated, domainWithStats)
}

// UpdateDomain updates a domain and returns it with stats
func (h *DomainHandler) UpdateDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get existing domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this domain"})
			return
		}
	}

	// Bind update data
	var updateData struct {
		Name        string `json:"name"`
		Privacy     string `json:"privacy"`
		Description string `json:"description"`
	}

	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields if provided
	if updateData.Name != "" {
		domain.Name = updateData.Name
	}
	if updateData.Privacy != "" {
		domain.Privacy = updateData.Privacy
	}
	if updateData.Description != "" {
		domain.Description = updateData.Description
	}

	// Update domain
	if err := h.domainDAO.Update(domain); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update domain"})
		return
	}

	// Return the updated domain with its stats
	domainWithStats, err := h.domainDAO.FindByIDWithStats(domain.ID)
	if err != nil {
		c.JSON(http.StatusOK, domain) // Fallback to returning without stats
		return
	}

	c.JSON(http.StatusOK, domainWithStats)
}

// DeleteDomain deletes a domain
func (h *DomainHandler) DeleteDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get existing domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to delete this domain"})
			return
		}
	}

	// Delete domain
	if err := h.domainDAO.Delete(domain.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete domain"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Domain deleted successfully"})
}

// EnrollInDomain enrolls the current user in a domain
func (h *DomainHandler) EnrollInDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the domain is public or the user is the owner
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	if domain.Privacy != "public" && userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
			return
		}
	}

	// Enroll user
	if err := h.progressDAO.EnrollUserInDomain(userID.(uint), domain.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enroll in domain"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Enrolled in domain successfully"})
}

// GetComments returns comments for a domain
func (h *DomainHandler) GetComments(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the domain is public or the user is the owner or enrolled
	if domain.Privacy != "public" {
		userID, exists := c.Get("userID")
		if !exists || userID.(uint) != domain.OwnerID {
			isAdmin, adminExists := c.Get("isAdmin")
			if !adminExists || !isAdmin.(bool) {
				// We should check enrollment here
				c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
				return
			}
		}
	}

	// Get comments
	comments, err := h.domainDAO.GetComments(domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve comments"})
		return
	}

	c.JSON(http.StatusOK, comments)
}

// AddComment adds a comment to a domain
func (h *DomainHandler) AddComment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Get user ID
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Check if the domain is public or the user is the owner or enrolled
	if domain.Privacy != "public" && userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			// We should check enrollment here
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
			return
		}
	}

	// Bind comment data
	var commentData struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&commentData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create comment
	comment := &models.DomainComment{
		Content:  commentData.Content,
		DomainID: domain.ID,
		UserID:   userID.(uint),
	}

	if err := h.domainDAO.AddComment(comment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add comment"})
		return
	}

	c.JSON(http.StatusCreated, comment)
}

// DeleteComment deletes a comment
func (h *DomainHandler) DeleteComment(c *gin.Context) {
	// Parse domain ID but we don't need to use it directly as the commentID is unique
	_, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	commentID, err := strconv.ParseUint(c.Param("commentId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	// Get user ID
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Delete comment (the DAO will check permissions)
	if err := h.domainDAO.DeleteComment(uint(commentID), userID.(uint)); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted successfully"})
}

// RegisterRoutes registers the domain routes
func (h *DomainHandler) RegisterRoutes(router *gin.RouterGroup) {
	// Public routes
	router.GET("/domains/public", h.GetPublicDomains)

	// Auth required routes
	authorized := router.Group("/")
	{
		domains := authorized.Group("/domains")
		{
			domains.GET("", h.GetDomains)
			domains.POST("", h.CreateDomain)
			domains.GET("/my", h.GetMyDomains)
			domains.GET("/enrolled", h.GetEnrolledDomains)
			domains.GET("/:id", h.GetDomain)
			domains.PUT("/:id", h.UpdateDomain)
			domains.DELETE("/:id", h.DeleteDomain)
			domains.POST("/:id/enroll", h.EnrollInDomain)
			
			// Domain comments
			domains.GET("/:id/comments", h.GetComments)
			domains.POST("/:id/comments", h.AddComment)
			domains.DELETE("/:id/comments/:commentId", h.DeleteComment)
		}
	}
}
