package handlers

import (
	"net/http"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"github.com/gin-gonic/gin"
)

type progressStore interface {
	GetUserDomainProgress(userID uint) ([]models.UserDomainProgress, error)
}

// ProgressHandler exposes domain enrollment progress. All per-node review
// flows live in the SRS handler.
type ProgressHandler struct {
	progressDAO   progressStore
	domainDAO     domainFinder
	permissionDAO domainPermissionLookup
}

// NewProgressHandler creates a new ProgressHandler
func NewProgressHandler(progressDAO *dao.ProgressDAO, domainDAO *dao.DomainDAO, permissionDAO *dao.DomainPermissionDAO) *ProgressHandler {
	return &ProgressHandler{
		progressDAO:   progressDAO,
		domainDAO:     domainDAO,
		permissionDAO: permissionDAO,
	}
}

// GetDomainProgress returns a user's progress for all domains
func (h *ProgressHandler) GetDomainProgress(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	progress, err := h.progressDAO.GetUserDomainProgress(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain progress"})
		return
	}

	c.JSON(http.StatusOK, progress)
}
