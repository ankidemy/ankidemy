package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/models"
)

// DefinitionHandler handles definition-related HTTP requests
type DefinitionHandler struct {
	definitionDAO *dao.DefinitionDAO
	domainDAO     *dao.DomainDAO
}

// NewDefinitionHandler creates a new DefinitionHandler
func NewDefinitionHandler(definitionDAO *dao.DefinitionDAO, domainDAO *dao.DomainDAO) *DefinitionHandler {
	return &DefinitionHandler{
		definitionDAO: definitionDAO,
		domainDAO:     domainDAO,
	}
}

// GetDomainDefinitions returns all definitions for a domain
func (h *DefinitionHandler) GetDomainDefinitions(c *gin.Context) {
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

	definitions, err := h.definitionDAO.GetByDomainID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve definitions"})
		return
	}

	// Convert to response format
	responses := make([]models.DefinitionResponse, 0, len(definitions))
	for _, def := range definitions {
		responses = append(responses, h.definitionDAO.ConvertToResponse(&def))
	}

	c.JSON(http.StatusOK, responses)
}

// CreateDefinition creates a new definition
func (h *DefinitionHandler) CreateDefinition(c *gin.Context) {
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
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to add definitions to this domain"})
			return
		}
	}

	// Bind request data
	var req models.DefinitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create definition
	definition := &models.Definition{
		Code:        req.Code,
		Name:        req.Name,
		Description: req.Description,
		Notes:       req.Notes,
		DomainID:    uint(domainID),
		OwnerID:     userID.(uint),
		XPosition:   req.XPosition,
		YPosition:   req.YPosition,
	}

	if err := h.definitionDAO.Create(definition, req.References, req.PrerequisiteIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create definition"})
		return
	}

	c.JSON(http.StatusCreated, h.definitionDAO.ConvertToResponse(definition))
}

// GetDefinition returns a definition by ID
func (h *DefinitionHandler) GetDefinition(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid definition ID"})
		return
	}

	definition, err := h.definitionDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Definition not found"})
		return
	}

	// Check access to the domain
	domain, err := h.domainDAO.FindByID(definition.DomainID)
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
				c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this definition"})
				return
			}
		}
	}

	c.JSON(http.StatusOK, h.definitionDAO.ConvertToResponse(definition))
}

// UpdateDefinition updates a definition
func (h *DefinitionHandler) UpdateDefinition(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid definition ID"})
		return
	}

	// Get existing definition
	definition, err := h.definitionDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Definition not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != definition.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this definition"})
			return
		}
	}

	// Bind update data
	var req models.DefinitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields if provided
	if req.Name != "" {
		definition.Name = req.Name
	}
	if req.Description != "" {
		definition.Description = req.Description
	}
	if req.Notes != "" {
		definition.Notes = req.Notes
	}
	if req.XPosition != 0 {
		definition.XPosition = req.XPosition
	}
	if req.YPosition != 0 {
		definition.YPosition = req.YPosition
	}
	if req.Code != "" {
		definition.Code = req.Code
	}

	// Update definition
	if err := h.definitionDAO.Update(definition, req.References, req.PrerequisiteIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update definition"})
		return
	}

	c.JSON(http.StatusOK, h.definitionDAO.ConvertToResponse(definition))
}

// DeleteDefinition deletes a definition
func (h *DefinitionHandler) DeleteDefinition(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid definition ID"})
		return
	}

	// Get existing definition
	definition, err := h.definitionDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Definition not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != definition.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to delete this definition"})
			return
		}
	}

	// Delete definition
	if err := h.definitionDAO.Delete(definition.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete definition"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Definition deleted successfully"})
}

// GetDefinitionByCode returns definitions by code
func (h *DefinitionHandler) GetDefinitionByCode(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid definition code"})
		return
	}

	// Get domain ID from query parameter
	domainID, _ := strconv.ParseUint(c.Query("domainId"), 10, 32)

	var definitions []*models.Definition
	var err error

	// If domain ID is provided, get specific definition by code and domain
	if domainID > 0 {
		var definition *models.Definition
		definition, err = h.definitionDAO.FindByCodeAndDomain(code, uint(domainID))
		if err == nil {
			definitions = []*models.Definition{definition}
		}
	} else {
		// Otherwise get all definitions with the given code
		definitions, err = h.definitionDAO.FindByCode(code)
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Definition not found"})
		return
	}

	// Filter by access permissions
	var accessibleDefinitions []*models.Definition
	for _, definition := range definitions {
		// Check domain access
		domain, err := h.domainDAO.FindByID(definition.DomainID)
		if err != nil {
			continue
		}

		// Add to response if domain is public or user has access
		if domain.Privacy == "public" {
			accessibleDefinitions = append(accessibleDefinitions, definition)
			continue
		}

		userID, exists := c.Get("userID")
		if exists && userID.(uint) == domain.OwnerID {
			accessibleDefinitions = append(accessibleDefinitions, definition)
			continue
		}

		isAdmin, adminExists := c.Get("isAdmin")
		if adminExists && isAdmin.(bool) {
			accessibleDefinitions = append(accessibleDefinitions, definition)
		}
	}

	if len(accessibleDefinitions) == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to any definitions with this code"})
		return
	}

	// Convert to response format
	responses := make([]models.DefinitionResponse, 0, len(accessibleDefinitions))
	for _, def := range accessibleDefinitions {
		responses = append(responses, h.definitionDAO.ConvertToResponse(def))
	}

	c.JSON(http.StatusOK, responses)
}

// RegisterRoutes registers the definition routes
func (h *DefinitionHandler) RegisterRoutes(router *gin.RouterGroup) {
	definitions := router.Group("/definitions")
	{
		definitions.GET("/:id", h.GetDefinition)
		definitions.PUT("/:id", h.UpdateDefinition)
		definitions.DELETE("/:id", h.DeleteDefinition)
		definitions.GET("/code/:code", h.GetDefinitionByCode)
	}
}
