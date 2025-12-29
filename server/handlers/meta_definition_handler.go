package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/models"
	"myapp/server/services"
)

type MetaDefinitionHandler struct {
	metaDAO   *dao.MetaDefinitionDAO
	domainDAO *dao.DomainDAO
	service   *services.MetaDefinitionService
}

func NewMetaDefinitionHandler(dbDao *dao.MetaDefinitionDAO, domainDAO *dao.DomainDAO, svc *services.MetaDefinitionService) *MetaDefinitionHandler {
	return &MetaDefinitionHandler{metaDAO: dbDao, domainDAO: domainDAO, service: svc}
}

// POST /api/domains/:id/meta-definitions
func (h *MetaDefinitionHandler) CreateMetaDefinition(c *gin.Context) {
	domainID64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}
	domain, err := h.domainDAO.FindByID(uint(domainID64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userIDv, ok := c.Get("userID")
	if !ok || userIDv.(uint) != domain.OwnerID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	var req models.MetaDefinitionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check for cross-type code uniqueness (meta_definitions + meta_exercises in the same domain)
	codeExists, err := h.metaDAO.CheckCodeExistsInDomain(req.Code, uint(domainID64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for duplicate code"})
		return
	}

	if codeExists {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", req.Code)})
		return
	}

	meta := &models.MetaDefinition{
		Code:      req.Code,
		Name:      req.Name,
		DomainID:  uint(domainID64),
		OwnerID:   userIDv.(uint),
		XPosition: req.XPosition,
		YPosition: req.YPosition,
	}

	if err := h.metaDAO.Create(meta, req.PrerequisiteIDs, req.PrerequisiteWeights); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create meta definition"})
		return
	}

	// Optional initial version
	if req.InitialVersion != nil {
		_, _ = h.metaDAO.AddVersion(meta.ID, &models.DefinitionVersionRequest{
			Prompt:      req.InitialVersion.Prompt,
			Type:        req.InitialVersion.Type,
			Description: req.InitialVersion.Description,
			Notes:       req.InitialVersion.Notes,
			References:  req.InitialVersion.References,
			PromptImagePath:      req.InitialVersion.PromptImagePath,
			DescriptionImagePath: req.InitialVersion.DescriptionImagePath,
		})
	}

	_, versions, _ := h.metaDAO.FindByID(meta.ID)
	resp, _ := h.metaDAO.ConvertToResponse(meta, versions, true)
	c.JSON(http.StatusCreated, resp)
}

// GET /api/meta-definitions/:id
func (h *MetaDefinitionHandler) GetMetaDefinition(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	meta, versions, err := h.metaDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
		return
	}
	resp, _ := h.metaDAO.ConvertToResponse(meta, versions, true)
	c.JSON(http.StatusOK, resp)
}

// GET /api/domains/:id/meta-definitions
func (h *MetaDefinitionHandler) GetDomainMetaDefinitions(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}
	metas, err := h.metaDAO.GetByDomainID(uint(id64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed"})
		return
	}
	// return without versions for lightweight mapping
	resps := make([]models.MetaDefinitionResponse, 0, len(metas))
	for i := range metas {
		r, _ := h.metaDAO.ConvertToResponse(&metas[i], nil, false)
		resps = append(resps, r)
	}
	c.JSON(http.StatusOK, resps)
}

// POST /api/meta-definitions/:id/versions
func (h *MetaDefinitionHandler) AddVersion(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	var req models.DefinitionVersionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	v, err := h.metaDAO.AddVersion(uint(id64), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add version"})
		return
	}

	// Load references for response
	var refs []models.Reference
	h.metaDAO.DB.Where("definition_id = ?", v.ID).Find(&refs)
	refStrings := make([]string, 0, len(refs))
	for _, r := range refs {
		refStrings = append(refStrings, r.Reference)
	}

	c.JSON(http.StatusCreated, models.DefinitionResponse{
		ID:               v.ID,
		Code:             v.Code,
		Name:             v.Name,
		Prompt:           v.Prompt,
		PromptImagePath:  v.PromptImagePath,
		DescriptionImagePath: v.DescriptionImagePath,
		Type:             v.Type,
		Description:      v.Description,
		Notes:            v.Notes,
		References:       refStrings,
		DomainID:         v.DomainID,
		OwnerID:          v.OwnerID,
		MetaDefinitionID: v.MetaDefinitionID,
		XPosition:        v.XPosition,
		YPosition:        v.YPosition,
		CreatedAt:        v.CreatedAt,
		UpdatedAt:        v.UpdatedAt,
	})
}

// PUT /api/meta-definitions/:id/versions/:versionId
func (h *MetaDefinitionHandler) UpdateVersion(c *gin.Context) {
	vid, err := strconv.ParseUint(c.Param("versionId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid version ID"})
		return
	}
	var existing models.Definition
	if err := h.metaDAO.DB.First(&existing, uint(vid)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Version not found"})
		return
	}
	var req models.DefinitionVersionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	v, err := h.metaDAO.UpdateVersion(uint(vid), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update version"})
		return
	}
	if existing.PromptImagePath != "" && req.PromptImagePath != existing.PromptImagePath {
		_ = services.DeleteMediaFile(existing.PromptImagePath)
	}
	if existing.DescriptionImagePath != "" && req.DescriptionImagePath != existing.DescriptionImagePath {
		_ = services.DeleteMediaFile(existing.DescriptionImagePath)
	}

	// Load references for response
	var refs []models.Reference
	h.metaDAO.DB.Where("definition_id = ?", v.ID).Find(&refs)
	refStrings := make([]string, 0, len(refs))
	for _, r := range refs {
		refStrings = append(refStrings, r.Reference)
	}

	c.JSON(http.StatusOK, models.DefinitionResponse{
		ID:               v.ID,
		Code:             v.Code,
		Name:             v.Name,
		Prompt:           v.Prompt,
		PromptImagePath:  v.PromptImagePath,
		DescriptionImagePath: v.DescriptionImagePath,
		Type:             v.Type,
		Description:      v.Description,
		Notes:            v.Notes,
		References:       refStrings,
		DomainID:         v.DomainID,
		OwnerID:          v.OwnerID,
		MetaDefinitionID: v.MetaDefinitionID,
		XPosition:        v.XPosition,
		YPosition:        v.YPosition,
		CreatedAt:        v.CreatedAt,
		UpdatedAt:        v.UpdatedAt,
	})
}

// DELETE /api/meta-definitions/:id/versions/:versionId
func (h *MetaDefinitionHandler) DeleteVersion(c *gin.Context) {
	vid, err := strconv.ParseUint(c.Param("versionId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid version ID"})
		return
	}
	if err := h.metaDAO.DeleteVersion(uint(vid)); err != nil {
		// If attempting to delete the last version, return a 400 with helpful message
		if err.Error() == "cannot delete the last version; a meta-definition must have at least one version" {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Version deleted"})
}

// GET /api/meta-definitions/:id/next-version
func (h *MetaDefinitionHandler) GetNextVersion(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	uid, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	v, err := h.service.SuggestVersion(uid.(uint), uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Load references for response
	var refs []models.Reference
	h.metaDAO.DB.Where("definition_id = ?", v.ID).Find(&refs)
	refStrings := make([]string, 0, len(refs))
	for _, r := range refs {
		refStrings = append(refStrings, r.Reference)
	}

	c.JSON(http.StatusOK, models.DefinitionResponse{
		ID:               v.ID,
		Code:             v.Code,
		Name:             v.Name,
		Prompt:           v.Prompt,
		PromptImagePath:  v.PromptImagePath,
		DescriptionImagePath: v.DescriptionImagePath,
		Type:             v.Type,
		Description:      v.Description,
		Notes:            v.Notes,
		References:       refStrings,
		DomainID:         v.DomainID,
		OwnerID:          v.OwnerID,
		MetaDefinitionID: v.MetaDefinitionID,
		XPosition:        v.XPosition,
		YPosition:        v.YPosition,
		CreatedAt:        v.CreatedAt,
		UpdatedAt:        v.UpdatedAt,
	})
}

// PUT /api/meta-definitions/:id
func (h *MetaDefinitionHandler) UpdateMetaDefinition(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	// Load existing meta-definition
	meta, _, err := h.metaDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Meta definition not found"})
		return
	}

	// Check ownership
	userIDv, ok := c.Get("userID")
	if !ok || userIDv.(uint) != meta.OwnerID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	// Parse request
	var req struct {
		Name      *string  `json:"name"`
		Code      *string  `json:"code"`
		XPosition *float64 `json:"xPosition"`
		YPosition *float64 `json:"yPosition"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Apply updates
	changedName := false
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Name cannot be empty"})
			return
		}
		if name != meta.Name {
			meta.Name = name
			changedName = true
		}
	}

	changedCode := false
	if req.Code != nil {
		newCode := strings.TrimSpace(*req.Code)
		if newCode == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Code cannot be empty"})
			return
		}
		if newCode != meta.Code {
			// Check for code uniqueness in domain
			codeExists, err := h.metaDAO.CheckCodeExistsInDomain(newCode, meta.DomainID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for duplicate code"})
				return
			}

			if codeExists {
				c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", newCode)})
				return
			}
			meta.Code = newCode
			changedCode = true
		}
	}

	if req.XPosition != nil {
		meta.XPosition = *req.XPosition
	}

	if req.YPosition != nil {
		meta.YPosition = *req.YPosition
	}

	// Save and cascade code/name changes atomically
	if err := h.metaDAO.UpdateFieldsAndCascade(meta, changedCode, changedName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update meta definition"})
		return
	}

	// Return updated response (without versions for lightweight response)
	resp, _ := h.metaDAO.ConvertToResponse(meta, nil, false)
	c.JSON(http.StatusOK, resp)
}

// DELETE /api/meta-definitions/:id
func (h *MetaDefinitionHandler) DeleteMetaDefinition(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	meta, _, err := h.metaDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Meta definition not found"})
		return
	}

	userIDv, ok := c.Get("userID")
	if !ok || userIDv.(uint) != meta.OwnerID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	if err := h.metaDAO.Delete(uint(id64)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete meta definition"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Meta definition deleted"})
}
