package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"github.com/gin-gonic/gin"
)

type SourceHandler struct {
	sourceDAO     *dao.SourceDAO
	domainDAO     *dao.DomainDAO
	permissionDAO *dao.DomainPermissionDAO
	codeRegistry  *dao.CodeRegistryDAO
}

func NewSourceHandler(sourceDAO *dao.SourceDAO, domainDAO *dao.DomainDAO, permissionDAO *dao.DomainPermissionDAO, registry *dao.CodeRegistryDAO) *SourceHandler {
	return &SourceHandler{
		sourceDAO:     sourceDAO,
		domainDAO:     domainDAO,
		permissionDAO: permissionDAO,
		codeRegistry:  registry,
	}
}

// GET /api/domains/:id/sources?scope=visible
func (h *SourceHandler) ListVisibleSources(c *gin.Context) {
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "id")
	if !ok {
		return
	}

	sources, err := h.sourceDAO.ListVisible(access.Domain.ID, access.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load sources"})
		return
	}

	responses := make([]models.SourceResponse, 0, len(sources))
	for _, s := range sources {
		responses = append(responses, models.SourceResponse{
			ID:         s.ID,
			DomainID:   s.DomainID,
			OwnerID:    s.OwnerID,
			Code:       s.Code,
			Title:      s.Title,
			ContentMd:  s.ContentMd,
			BibtexKey:  s.BibtexKey,
			FilePath:   s.FilePath,
			XPosition:  s.XPosition,
			YPosition:  s.YPosition,
			Visibility: s.Visibility,
			CreatedAt:  s.CreatedAt,
			UpdatedAt:  s.UpdatedAt,
		})
	}

	c.JSON(http.StatusOK, responses)
}

// POST /api/domains/:id/sources
func (h *SourceHandler) CreateSource(c *gin.Context) {
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "id")
	if !ok {
		return
	}

	var req models.SourceCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
		return
	}
	visibility := strings.TrimSpace(req.Visibility)
	if visibility == "" {
		visibility = "private"
	}
	if visibility != "private" && visibility != "domain" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visibility"})
		return
	}
	allowed, err := canCreateVisibilityScopedNode(access.Domain, visibility, access.UserID, access.IsAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visibility"})
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	code := strings.TrimSpace(req.Code)
	if code == "" {
		code = generateUniqueCode(h.codeRegistry, access.Domain.ID, title, "source")
	} else {
		exists, err := h.codeRegistry.CodeExists(access.Domain.ID, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check code"})
			return
		}
		if exists {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", code)})
			return
		}
	}

	source := &models.Source{
		DomainID:   access.Domain.ID,
		OwnerID:    access.UserID,
		Code:       code,
		Title:      title,
		ContentMd:  req.ContentMd,
		BibtexKey:  req.BibtexKey,
		FilePath:   req.FilePath,
		XPosition:  req.XPosition,
		YPosition:  req.YPosition,
		Visibility: visibility,
	}

	if err := h.sourceDAO.Create(source); err != nil {
		if errors.Is(err, dao.ErrCodeConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", code)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create source"})
		return
	}

	resp := models.SourceResponse{
		ID:         source.ID,
		DomainID:   source.DomainID,
		OwnerID:    source.OwnerID,
		Code:       source.Code,
		Title:      source.Title,
		ContentMd:  source.ContentMd,
		BibtexKey:  source.BibtexKey,
		FilePath:   source.FilePath,
		XPosition:  source.XPosition,
		YPosition:  source.YPosition,
		Visibility: source.Visibility,
		CreatedAt:  source.CreatedAt,
		UpdatedAt:  source.UpdatedAt,
	}
	c.JSON(http.StatusCreated, resp)
}

// GET /api/sources/:id
func (h *SourceHandler) GetSource(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	source, err := h.sourceDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Source not found"})
		return
	}
	domain, err := h.domainDAO.FindByID(source.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}
	if source.Visibility == "private" && source.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	resp := models.SourceResponse{
		ID:         source.ID,
		DomainID:   source.DomainID,
		OwnerID:    source.OwnerID,
		Code:       source.Code,
		Title:      source.Title,
		ContentMd:  source.ContentMd,
		BibtexKey:  source.BibtexKey,
		FilePath:   source.FilePath,
		XPosition:  source.XPosition,
		YPosition:  source.YPosition,
		Visibility: source.Visibility,
		CreatedAt:  source.CreatedAt,
		UpdatedAt:  source.UpdatedAt,
	}
	c.JSON(http.StatusOK, resp)
}

// PATCH /api/sources/:id
func (h *SourceHandler) UpdateSource(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	source, err := h.sourceDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Source not found"})
		return
	}
	domain, err := h.domainDAO.FindByID(source.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}
	allowed, err := canMutateVisibilityScopedNode(domain, &resolvedNodeAccess{
		DomainID:   source.DomainID,
		OwnerID:    source.OwnerID,
		Visibility: source.Visibility,
	}, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visibility"})
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	var req models.SourceUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	codeChanged := false
	if req.Code != nil {
		newCode := strings.TrimSpace(*req.Code)
		if newCode == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Code cannot be empty"})
			return
		}
		if newCode != source.Code {
			exists, err := h.codeRegistry.CodeExists(source.DomainID, newCode)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check code"})
				return
			}
			if exists {
				c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", newCode)})
				return
			}
			source.Code = newCode
			codeChanged = true
		}
	}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Title cannot be empty"})
			return
		}
		source.Title = title
	}
	if req.ContentMd != nil {
		source.ContentMd = *req.ContentMd
	}
	if req.BibtexKey != nil {
		source.BibtexKey = *req.BibtexKey
	}
	if req.FilePath != nil {
		source.FilePath = *req.FilePath
	}
	if req.XPosition != nil {
		source.XPosition = *req.XPosition
	}
	if req.YPosition != nil {
		source.YPosition = *req.YPosition
	}
	if req.Visibility != nil {
		visibility := strings.TrimSpace(*req.Visibility)
		if visibility != "private" && visibility != "domain" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visibility"})
			return
		}
		allowed, err := canCreateVisibilityScopedNode(domain, visibility, userID, isAdmin, h.permissionDAO)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visibility"})
			return
		}
		if !allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
			return
		}
		source.Visibility = visibility
	}

	if err := h.sourceDAO.Update(source, codeChanged); err != nil {
		if errors.Is(err, dao.ErrCodeConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", source.Code)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update source"})
		return
	}

	resp := models.SourceResponse{
		ID:         source.ID,
		DomainID:   source.DomainID,
		OwnerID:    source.OwnerID,
		Code:       source.Code,
		Title:      source.Title,
		ContentMd:  source.ContentMd,
		BibtexKey:  source.BibtexKey,
		FilePath:   source.FilePath,
		XPosition:  source.XPosition,
		YPosition:  source.YPosition,
		Visibility: source.Visibility,
		CreatedAt:  source.CreatedAt,
		UpdatedAt:  source.UpdatedAt,
	}
	c.JSON(http.StatusOK, resp)
}

// DELETE /api/sources/:id
func (h *SourceHandler) DeleteSource(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	source, err := h.sourceDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Source not found"})
		return
	}
	domain, err := h.domainDAO.FindByID(source.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}
	allow, err := canMutateVisibilityScopedNode(domain, &resolvedNodeAccess{
		DomainID:   source.DomainID,
		OwnerID:    source.OwnerID,
		Visibility: source.Visibility,
	}, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visibility"})
		return
	}
	if !allow {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	if err := h.sourceDAO.Delete(source); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete source"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Source deleted"})
}

func generateUniqueCode(registry *dao.CodeRegistryDAO, domainID uint, title string, prefix string) string {
	if prefix == "quest" {
		return generateSequentialCode(registry, domainID, "Q")
	}
	if prefix == "source" {
		return generateSequentialCode(registry, domainID, "S")
	}
	base := strings.TrimSpace(strings.ToLower(title))
	if base == "" {
		base = prefix
	}
	base = strings.ReplaceAll(base, " ", "_")
	code := base
	for i := 1; i < 1000; i++ {
		exists, err := registry.CodeExists(domainID, code)
		if err == nil && !exists {
			return code
		}
		code = fmt.Sprintf("%s.%d", base, i)
	}
	return fmt.Sprintf("%s.%d", base, 1000)
}

func generateSequentialCode(registry *dao.CodeRegistryDAO, domainID uint, prefix string) string {
	for i := 1; i < 10000; i++ {
		code := fmt.Sprintf("%s%d", prefix, i)
		exists, err := registry.CodeExists(domainID, code)
		if err == nil && !exists {
			return code
		}
	}
	return fmt.Sprintf("%s%d", prefix, 10000)
}
