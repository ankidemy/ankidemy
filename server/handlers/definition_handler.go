// handlers/definition_handler.go - Fixed type issues

package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/models"
	"myapp/server/services"
)

// DefinitionHandler handles definition-related HTTP requests
type DefinitionHandler struct {
	definitionDAO     *dao.DefinitionDAO
	domainDAO         *dao.DomainDAO
	metaDefinitionDAO *dao.MetaDefinitionDAO
	permissionDAO     *dao.DomainPermissionDAO
}

// NewDefinitionHandler creates a new DefinitionHandler
func NewDefinitionHandler(definitionDAO *dao.DefinitionDAO, domainDAO *dao.DomainDAO, metaDefinitionDAO *dao.MetaDefinitionDAO, permissionDAO *dao.DomainPermissionDAO) *DefinitionHandler {
	return &DefinitionHandler{
		definitionDAO:     definitionDAO,
		domainDAO:         domainDAO,
		metaDefinitionDAO: metaDefinitionDAO,
		permissionDAO:     permissionDAO,
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

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
		return
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

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canEdit, err := canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canEdit {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to add definitions to this domain"})
		return
	}

	// Bind request data
	var req models.DefinitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Code = strings.TrimSpace(req.Code)
	req.Name = strings.TrimSpace(req.Name)

	// Check if MetaDefinitionID is provided
	var metaDefID uint
	if req.MetaDefinitionID != 0 {
		// Use existing meta_definition
		metaDefID = req.MetaDefinitionID

		// Verify the meta_definition exists and belongs to this domain
		metaDef, _, err := h.metaDefinitionDAO.FindByID(metaDefID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Meta definition not found"})
			return
		}
		if metaDef.DomainID != uint(domainID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Meta definition does not belong to this domain"})
			return
		}
	} else {
		if req.Code == "" || req.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Code and name are required"})
			return
		}
		// Auto-create a meta_definition pool
		// Check for cross-type code uniqueness (meta_definitions + meta_exercises in the same domain)
		codeExists, err := h.definitionDAO.CheckCodeExistsInDomain(req.Code, uint(domainID))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for duplicate code"})
			return
		}

		if codeExists {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", req.Code)})
			return
		}

		// Create the meta_definition pool
		metaDef := &models.MetaDefinition{
			Code:      req.Code,
			Name:      req.Name,
			DomainID:  uint(domainID),
			OwnerID:   userID,
			XPosition: req.XPosition,
			YPosition: req.YPosition,
		}

		// Create with prerequisites if provided
		if err := h.metaDefinitionDAO.Create(metaDef, req.PrerequisiteIDs, req.PrerequisiteWeights); err != nil {
			if errors.Is(err, dao.ErrCodeConflict) {
				c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", req.Code)})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create meta definition pool"})
			return
		}

		metaDefID = metaDef.ID
	}

	// Create the definition version
	versionReq := &models.DefinitionVersionRequest{
		Prompt:               req.Prompt,
		Type:                 req.Type,
		Description:          req.Description,
		Notes:                req.Notes,
		References:           req.References,
		PromptImagePath:      req.PromptImagePath,
		DescriptionImagePath: req.DescriptionImagePath,
	}

	definition, err := h.metaDefinitionDAO.AddVersion(metaDefID, versionReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create definition version"})
		return
	}

	// Get the created definition with prerequisites
	createdDef, err := h.definitionDAO.FindByIDWithPrerequisites(definition.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve created definition"})
		return
	}

	c.JSON(http.StatusCreated, h.definitionDAO.ConvertToResponse(createdDef))
}

// GetDefinition returns a definition by ID
func (h *DefinitionHandler) GetDefinition(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid definition ID"})
		return
	}

	definition, err := h.definitionDAO.FindByIDWithPrerequisites(uint(id))
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

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this definition"})
		return
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

	domain, err := h.domainDAO.FindByID(definition.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canEdit, err := canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canEdit {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this definition"})
		return
	}

	// Bind update data
	var req models.DefinitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	oldPromptImage := definition.PromptImagePath
	oldDescriptionImage := definition.DescriptionImagePath

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
	if req.PromptImagePath != "" {
		definition.PromptImagePath = req.PromptImagePath
	}
	if req.DescriptionImagePath != "" {
		definition.DescriptionImagePath = req.DescriptionImagePath
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
	if err := h.definitionDAO.Update(definition, req.References, req.PrerequisiteIDs, req.PrerequisiteWeights); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update definition"})
		return
	}

	if req.PromptImagePath != "" && req.PromptImagePath != oldPromptImage {
		_ = services.DeleteMediaFile(oldPromptImage)
	}
	if req.DescriptionImagePath != "" && req.DescriptionImagePath != oldDescriptionImage {
		_ = services.DeleteMediaFile(oldDescriptionImage)
	}

	// Get the updated definition with prerequisites
	updatedDef, err := h.definitionDAO.FindByIDWithPrerequisites(definition.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve updated definition"})
		return
	}

	c.JSON(http.StatusOK, h.definitionDAO.ConvertToResponse(updatedDef))
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

	domain, err := h.domainDAO.FindByID(definition.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canEdit, err := canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canEdit {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to delete this definition"})
		return
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

	var definitions []*models.DefinitionWithPrerequisites
	var err error

	// If domain ID is provided, get specific definition by code and domain
	if domainID > 0 {
		var definition *models.DefinitionWithPrerequisites
		definition, err = h.definitionDAO.FindByCodeAndDomain(code, uint(domainID))
		if err == nil {
			domain, dErr := h.domainDAO.FindByID(uint(domainID))
			if dErr != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
				return
			}
			userID, isAdmin, ok := getUserContext(c)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
				return
			}
			canView, vErr := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
			if vErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
				return
			}
			if !canView {
				c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
				return
			}
			definitions = []*models.DefinitionWithPrerequisites{definition}
		}
	} else {
		// Otherwise get all definitions with the given code
		definitions, err = h.definitionDAO.FindByCode(code)
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Definition not found"})
		return
	}

	// Filter by access permissions and convert to response format
	var responses []models.DefinitionResponse
	for _, definition := range definitions {
		// Check domain access
		domain, err := h.domainDAO.FindByID(definition.DomainID)
		if err != nil {
			continue
		}

		// Add to response if domain is public or user has access
		if domain.Privacy == "public" {
			resp := h.definitionDAO.ConvertToResponse(definition)
			responses = append(responses, resp)
			continue
		}

		userID, isAdmin, ok := getUserContext(c)
		if !ok {
			continue
		}
		canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
		if err != nil || !canView {
			continue
		}
		resp := h.definitionDAO.ConvertToResponse(definition)
		responses = append(responses, resp)
	}

	if len(responses) == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to any definitions with this code"})
		return
	}

	c.JSON(http.StatusOK, responses)
}
