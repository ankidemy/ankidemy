package handlers

import (
	"net/http"
	"strconv"
	//"time"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/models"
	"myapp/server/services"
	"gorm.io/gorm"
)

// SRSHandler handles SRS-related HTTP requests
type SRSHandler struct {
	db         *gorm.DB
	srsService *services.SRSService
	srsDao     *dao.SRSDao
}

// NewSRSHandler creates a new SRSHandler
func NewSRSHandler(db *gorm.DB) *SRSHandler {
	return &SRSHandler{
		db:         db,
		srsService: services.NewSRSService(db),
		srsDao:     dao.NewSRSDao(db),
	}
}

// === Review Endpoints ===

// SubmitReview handles review submission
func (h *SRSHandler) SubmitReview(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	var request models.ReviewRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate node type
	if request.NodeType != "definition" && request.NodeType != "exercise" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Node type must be 'definition' or 'exercise'"})
		return
	}

	// Validate quality range
	if request.Quality < 0 || request.Quality > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Quality must be between 0 and 5"})
		return
	}

	response, err := h.srsService.SubmitReview(userID.(uint), &request)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetDueReviews gets nodes due for review
func (h *SRSHandler) GetDueReviews(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domainID, err := strconv.ParseUint(c.Param("domainId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	nodeType := c.Query("type")
	if nodeType == "" {
		nodeType = "mixed"
	}

	if nodeType != "definition" && nodeType != "exercise" && nodeType != "mixed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Type must be 'definition', 'exercise', or 'mixed'"})
		return
	}

	dueNodes, err := h.srsService.GetDueReviews(userID.(uint), uint(domainID), nodeType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"dueNodes": dueNodes})
}

// GetReviewHistory gets review history for a user
func (h *SRSHandler) GetReviewHistory(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Optional filters
	var nodeID *uint
	var nodeType *string

	if nodeIDStr := c.Query("nodeId"); nodeIDStr != "" {
		if id, err := strconv.ParseUint(nodeIDStr, 10, 32); err == nil {
			nodeIDVal := uint(id)
			nodeID = &nodeIDVal
		}
	}

	if nodeTypeStr := c.Query("nodeType"); nodeTypeStr != "" {
		nodeType = &nodeTypeStr
	}

	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	history, err := h.srsDao.GetReviewHistory(userID.(uint), nodeID, nodeType, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve review history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"history": history})
}

// === Progress Endpoints ===

// GetDomainProgress gets progress for all nodes in a domain
func (h *SRSHandler) GetDomainProgress(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domainID, err := strconv.ParseUint(c.Param("domainId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	progress, err := h.srsDao.GetDomainProgress(userID.(uint), uint(domainID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain progress"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"progress": progress})
}

// GetDomainStats gets statistics for a domain
func (h *SRSHandler) GetDomainStats(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domainID, err := strconv.ParseUint(c.Param("domainId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	stats, err := h.srsDao.GetDomainStats(userID.(uint), uint(domainID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain statistics"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// UpdateNodeStatus updates the status of a node
func (h *SRSHandler) UpdateNodeStatus(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	var request models.StatusUpdateRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate status
	validStatuses := []string{"fresh", "tackling", "grasped", "learned"}
	isValidStatus := false
	for _, status := range validStatuses {
		if request.Status == status {
			isValidStatus = true
			break
		}
	}

	if !isValidStatus {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status. Must be one of: fresh, tackling, grasped, learned"})
		return
	}

	// Validate node type
	if request.NodeType != "definition" && request.NodeType != "exercise" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Node type must be 'definition' or 'exercise'"})
		return
	}

	err := h.srsService.UpdateNodeStatus(userID.(uint), request.NodeID, request.NodeType, request.Status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Node status updated successfully"})
}

// === Session Endpoints ===

// StartSession starts a new study session
func (h *SRSHandler) StartSession(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	var request models.SessionRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate session type
	validTypes := []string{"definition", "exercise", "mixed"}
	isValidType := false
	for _, sessionType := range validTypes {
		if request.SessionType == sessionType {
			isValidType = true
			break
		}
	}

	if !isValidType {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session type. Must be one of: definition, exercise, mixed"})
		return
	}

	session := &models.StudySession{
		UserID:            userID.(uint),
		DomainID:          request.DomainID,
		SessionType:       request.SessionType,
		TotalReviews:      0,
		SuccessfulReviews: 0,
	}

	if err := h.srsDao.CreateSession(session); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	response := &models.SessionResponse{
		ID:                session.ID,
		DomainID:          session.DomainID,
		SessionType:       session.SessionType,
		StartTime:         session.StartTime,
		TotalReviews:      session.TotalReviews,
		SuccessfulReviews: session.SuccessfulReviews,
	}

	c.JSON(http.StatusCreated, response)
}

// EndSession ends a study session
func (h *SRSHandler) EndSession(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	sessionID, err := strconv.ParseUint(c.Param("sessionId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Verify session ownership
	session, err := h.srsDao.GetSession(uint(sessionID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	if session.UserID != userID.(uint) {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this session"})
			return
		}
	}

	if err := h.srsDao.EndSession(uint(sessionID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to end session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Session ended successfully"})
}

// GetUserSessions gets user's study sessions
func (h *SRSHandler) GetUserSessions(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	limit := 20
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	sessions, err := h.srsDao.GetUserSessions(userID.(uint), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve sessions"})
		return
	}

	// Convert to response format
	responses := make([]models.SessionResponse, 0, len(sessions))
	for _, session := range sessions {
		var duration *int
		if session.EndTime != nil {
			d := int(session.EndTime.Sub(session.StartTime).Seconds())
			duration = &d
		}

		responses = append(responses, models.SessionResponse{
			ID:                session.ID,
			DomainID:          session.DomainID,
			SessionType:       session.SessionType,
			StartTime:         session.StartTime,
			EndTime:           session.EndTime,
			TotalReviews:      session.TotalReviews,
			SuccessfulReviews: session.SuccessfulReviews,
			Duration:          duration,
		})
	}

	c.JSON(http.StatusOK, gin.H{"sessions": responses})
}

// === Prerequisites Endpoints ===

// CreatePrerequisite creates a prerequisite relationship
func (h *SRSHandler) CreatePrerequisite(c *gin.Context) {
	_, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	var request models.PrerequisiteRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate node types
	if request.NodeType != "definition" && request.NodeType != "exercise" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Node type must be 'definition' or 'exercise'"})
		return
	}

	if request.PrerequisiteType != "definition" && request.PrerequisiteType != "exercise" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Prerequisite type must be 'definition' or 'exercise'"})
		return
	}

	// Validate weight
	if request.Weight <= 0 || request.Weight > 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Weight must be between 0 and 1"})
		return
	}

	// Prevent self-prerequisite
	if request.NodeID == request.PrerequisiteID && request.NodeType == request.PrerequisiteType {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Node cannot be a prerequisite of itself"})
		return
	}

	// Check if user has permission to modify this node
	// This would require checking domain ownership - simplified for now

	prerequisite := &models.NodePrerequisite{
		NodeID:           request.NodeID,
		NodeType:         request.NodeType,
		PrerequisiteID:   request.PrerequisiteID,
		PrerequisiteType: request.PrerequisiteType,
		Weight:           request.Weight,
		IsManual:         request.IsManual,
	}

	if err := h.srsDao.CreatePrerequisite(prerequisite); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create prerequisite"})
		return
	}

	c.JSON(http.StatusCreated, prerequisite)
}

// GetPrerequisites gets prerequisites for a domain
func (h *SRSHandler) GetPrerequisites(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("domainId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	prerequisites, err := h.srsDao.GetPrerequisitesByDomain(uint(domainID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve prerequisites"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"prerequisites": prerequisites})
}

// DeletePrerequisite deletes a prerequisite relationship
func (h *SRSHandler) DeletePrerequisite(c *gin.Context) {
	_, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	prerequisiteID, err := strconv.ParseUint(c.Param("prerequisiteId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid prerequisite ID"})
		return
	}

	// Check if user has permission to modify this prerequisite
	// This would require checking domain ownership - simplified for now

	if err := h.db.Delete(&models.NodePrerequisite{}, prerequisiteID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete prerequisite"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Prerequisite deleted successfully"})
}

// === Test/Debug Endpoints ===

// TestCreditPropagation tests credit propagation for a node
func (h *SRSHandler) TestCreditPropagation(c *gin.Context) {
	var request struct {
		DomainID uint   `json:"domainId" binding:"required"`
		NodeID   uint   `json:"nodeId" binding:"required"`
		NodeType string `json:"nodeType" binding:"required"`
		Success  bool   `json:"success"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	prerequisites, err := h.srsDao.GetPrerequisitesByDomain(request.DomainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get prerequisites"})
		return
	}

	creditService := services.NewCreditPropagationService()
	graph := creditService.BuildGraph(prerequisites)
	credits := creditService.PropagateCredit(request.NodeID, request.NodeType, request.Success, graph)

	c.JSON(http.StatusOK, gin.H{"credits": credits})
}
