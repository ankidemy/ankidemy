package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"github.com/gin-gonic/gin"
)

type DomainNetworkHandler struct {
	dao           *dao.DomainNetworkDAO
	domainDAO     *dao.DomainDAO
	permissionDAO *dao.DomainPermissionDAO
}

func NewDomainNetworkHandler(d *dao.DomainNetworkDAO, domainDAO *dao.DomainDAO, permissionDAO *dao.DomainPermissionDAO) *DomainNetworkHandler {
	return &DomainNetworkHandler{
		dao:           d,
		domainDAO:     domainDAO,
		permissionDAO: permissionDAO,
	}
}

// GET /api/network/links?domainIds=1,2,3
func (h *DomainNetworkHandler) GetLinks(c *gin.Context) {
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Parse optional domainIds query param
	var ids []uint
	if qs := c.Query("domainIds"); qs != "" {
		parts := strings.Split(qs, ",")
		for _, p := range parts {
			if p == "" {
				continue
			}
			if v, err := strconv.ParseUint(strings.TrimSpace(p), 10, 32); err == nil {
				ids = append(ids, uint(v))
			}
		}
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, []models.DomainLink{})
		return
	}

	filtered := make([]uint, 0, len(ids))
	seenIDs := make(map[uint]struct{}, len(ids))
	domains, err := h.domainDAO.GetByIDs(ids)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	for _, domain := range domains {
		canView, err := canViewDomain(&domain, userID, isAdmin, h.permissionDAO)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
			return
		}
		if !canView {
			continue
		}
		if _, exists := seenIDs[domain.ID]; exists {
			continue
		}
		seenIDs[domain.ID] = struct{}{}
		filtered = append(filtered, domain.ID)
	}
	if len(filtered) == 0 {
		c.JSON(http.StatusOK, []models.DomainLink{})
		return
	}

	type row struct {
		DomainID         uint `gorm:"column:domain_id"`
		ExternalDomainID uint `gorm:"column:external_domain_id"`
	}
	var rows []row
	query := `
		SELECT DISTINCT ep.domain_id AS domain_id, d.id AS external_domain_id
		FROM external_prerequisites ep
		JOIN domains d ON d.domain_uid = ep.external_domain_uid
		WHERE ep.domain_id IN ? AND d.id IN ? AND ep.domain_id <> d.id
	`
	if err := h.dao.DB().Raw(query, filtered, filtered).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch links"})
		return
	}

	seen := make(map[string]struct{})
	links := make([]models.DomainLink, 0, len(rows))
	for _, r := range rows {
		a := r.DomainID
		b := r.ExternalDomainID
		if a > b {
			a, b = b, a
		}
		key := strconv.FormatUint(uint64(a), 10) + "-" + strconv.FormatUint(uint64(b), 10)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		links = append(links, models.DomainLink{
			ID:        uint(len(links) + 1),
			DomainAID: a,
			DomainBID: b,
		})
	}

	c.JSON(http.StatusOK, links)
}

// POST /api/network/links { domainId1, domainId2 }
func (h *DomainNetworkHandler) CreateLink(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	var payload struct {
		DomainId1 uint `json:"domainId1" binding:"required"`
		DomainId2 uint `json:"domainId2" binding:"required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	link, err := h.dao.CreateLink(userID.(uint), payload.DomainId1, payload.DomainId2)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, link)
}

// DELETE /api/network/links/:id
func (h *DomainNetworkHandler) DeleteLink(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	linkID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid link ID"})
		return
	}
	if err := h.dao.DeleteLink(userID.(uint), uint(linkID)); err != nil {
		if err.Error() == "record not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Link not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete link"})
		return
	}
	c.Status(http.StatusNoContent)
}
