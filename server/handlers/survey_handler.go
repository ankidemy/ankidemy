package handlers

import (
	"net/http"
	"strconv"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"ankidemy/server/services"
	"github.com/gin-gonic/gin"
)

type SurveyHandler struct {
	domainDAO     *dao.DomainDAO
	permissionDAO *dao.DomainPermissionDAO
	questDAO      *dao.QuestDAO
	service       *services.SurveyService
}

func NewSurveyHandler(domainDAO *dao.DomainDAO, permissionDAO *dao.DomainPermissionDAO, questDAO *dao.QuestDAO, service *services.SurveyService) *SurveyHandler {
	return &SurveyHandler{
		domainDAO:     domainDAO,
		permissionDAO: permissionDAO,
		questDAO:      questDAO,
		service:       service,
	}
}

// GET /api/survey/domains/:id/queue
func (h *SurveyHandler) GetQueue(c *gin.Context) {
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

	queue, err := h.service.GetQueue(uint(domainID64), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load survey queue"})
		return
	}
	c.JSON(http.StatusOK, queue)
}

// POST /api/survey/events
func (h *SurveyHandler) PostEvent(c *gin.Context) {
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var req models.QuestEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	meta, _, err := h.questDAO.FindByID(req.QuestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quest not found"})
		return
	}
	domain, err := h.domainDAO.FindByID(meta.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
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
	if meta.Visibility == "private" && meta.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}
	if req.QuestVersionID != nil {
		version, err := h.questDAO.FindVersionByID(*req.QuestVersionID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid questVersionId"})
			return
		}
		if version.QuestID != meta.ID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "questVersionId does not belong to the requested quest"})
			return
		}
	}

	if err := h.service.ApplyEvent(userID, &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to log event"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Event logged"})
}

// GET /api/survey/domains/:id/stats
func (h *SurveyHandler) GetStats(c *gin.Context) {
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

	queue, err := h.service.GetQueue(uint(domainID64), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load survey stats"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"dueQuests": len(queue)})
}
