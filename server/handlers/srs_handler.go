package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	//"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"myapp/server/dao"
	"myapp/server/middleware"
	"myapp/server/models"
	"myapp/server/services"
)

// SRSHandler handles SRS-related HTTP requests
type SRSHandler struct {
	db                    *gorm.DB
	srsService            *services.SRSService
	srsDao                *dao.SRSDao
	permissionDAO         *dao.DomainPermissionDAO
	notificationReadModel *services.NotificationReadModelService
}

// NewSRSHandler creates a new SRSHandler
func NewSRSHandler(
	db *gorm.DB,
	permissionDAO *dao.DomainPermissionDAO,
	notificationReadModel *services.NotificationReadModelService,
	queryCache *services.QueryCacheService,
) *SRSHandler {
	return &SRSHandler{
		db:                    db,
		srsService:            services.NewSRSService(db, notificationReadModel, queryCache),
		srsDao:                dao.NewSRSDao(db),
		permissionDAO:         permissionDAO,
		notificationReadModel: notificationReadModel,
	}
}

func (h *SRSHandler) getMetaDomainInfo(nodeType string, nodeID uint) (uint, uint, error) {
	switch nodeType {
	case "meta_definition":
		var meta models.MetaDefinition
		if err := h.db.Select("owner_id", "domain_id").First(&meta, nodeID).Error; err != nil {
			return 0, 0, err
		}
		return meta.DomainID, meta.OwnerID, nil
	case "meta_exercise":
		var meta models.MetaExercise
		if err := h.db.Select("owner_id", "domain_id").First(&meta, nodeID).Error; err != nil {
			return 0, 0, err
		}
		return meta.DomainID, meta.OwnerID, nil
	default:
		return 0, 0, fmt.Errorf("unsupported node type: %s", nodeType)
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
	if request.NodeType != "definition" && request.NodeType != "exercise" && request.NodeType != "meta_exercise" && request.NodeType != "meta_definition" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Node type must be 'definition', 'exercise', 'meta_exercise', or 'meta_definition'"})
		return
	}

	// Validate quality range
	if request.Quality < 0 || request.Quality > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Quality must be between 0 and 5"})
		return
	}

	// Normalize meta types to base types for SRS storage compatibility
	if request.NodeType == "meta_exercise" {
		request.NodeType = "exercise"
	}
	if request.NodeType == "meta_definition" {
		request.NodeType = "definition"
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

	if nodeType != "definition" && nodeType != "exercise" && nodeType != "meta_exercise" && nodeType != "meta_definition" && nodeType != "mixed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Type must be 'definition', 'exercise', 'meta_exercise', 'meta_definition', or 'mixed'"})
		return
	}

	view := c.Query("view")
	if view == "" {
		view = "full"
	}
	if view != "full" && view != "compact" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "View must be 'full' or 'compact'"})
		return
	}

	// Normalize meta types to base types for due selection
	if nodeType == "meta_exercise" {
		nodeType = "exercise"
	}
	if nodeType == "meta_definition" {
		nodeType = "definition"
	}

	requestID := middleware.GetRequestID(c)
	if view == "compact" {
		dueNodes, err := h.srsService.GetDueReviewsCompact(userID.(uint), uint(domainID), nodeType, requestID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"dueNodes": dueNodes})
		return
	}

	dueNodes, err := h.srsService.GetDueReviews(userID.(uint), uint(domainID), nodeType, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"dueNodes": dueNodes})
}

// GetReviewQueue gets a practice review queue with exercise selections
func (h *SRSHandler) GetReviewQueue(c *gin.Context) {
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

	sessionType := c.Query("sessionType")
	if sessionType == "" {
		sessionType = "mixed"
	}
	if sessionType != "definition" && sessionType != "exercise" && sessionType != "mixed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session type. Must be one of: definition, exercise, mixed"})
		return
	}

	mode := c.Query("mode")
	if mode == "" {
		mode = "normal"
	}
	if mode != "normal" && mode != "frenzy" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid mode. Must be normal or frenzy"})
		return
	}

	exCount := 1
	if val := c.Query("exercisesPerDefinition"); val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			exCount = parsed
		}
	}
	if exCount < 1 {
		exCount = 1
	}

	queue, err := h.srsService.GetReviewQueue(userID.(uint), uint(domainID), sessionType, mode, exCount, middleware.GetRequestID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"queue": queue})
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

	stats, err := h.srsDao.GetDomainStats(userID.(uint), uint(domainID), middleware.GetRequestID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain statistics"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetNotificationSummary returns a single read-model payload used by notification polling.
func (h *SRSHandler) GetNotificationSummary(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	if h.notificationReadModel == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Notification read model is unavailable"})
		return
	}

	summary, err := h.notificationReadModel.GetSummary(userID.(uint), middleware.GetRequestID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve notification summary"})
		return
	}
	c.JSON(http.StatusOK, summary)
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
	if request.NodeType != "definition" && request.NodeType != "exercise" && request.NodeType != "meta_exercise" && request.NodeType != "meta_definition" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Node type must be 'definition', 'exercise', 'meta_exercise', or 'meta_definition'"})
		return
	}

	// Normalize meta types to base types
	nodeType := request.NodeType
	if nodeType == "meta_exercise" {
		nodeType = "exercise"
	}
	if nodeType == "meta_definition" {
		nodeType = "definition"
	}

	err := h.srsService.UpdateNodeStatus(userID.(uint), request.NodeID, nodeType, request.Status)
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
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	var request models.PrerequisiteRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate node types for graph prerequisites (dev: meta graph only)
	// Disallow legacy 'definition'/'exercise' node types to prevent invisible links in UI.
	if request.NodeType != "meta_exercise" && request.NodeType != "meta_definition" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Node type must be 'meta_definition' or 'meta_exercise'"})
		return
	}

	if request.PrerequisiteType != "meta_exercise" && request.PrerequisiteType != "meta_definition" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Prerequisite type must be 'meta_definition' or 'meta_exercise'"})
		return
	}

	// Enforce valid prerequisite pairs for meta graph
	if request.NodeType == "meta_definition" && request.PrerequisiteType != "meta_definition" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "meta_definition nodes can only have meta_definition prerequisites"})
		return
	}
	if request.NodeType == "meta_exercise" && request.PrerequisiteType != "meta_definition" && request.PrerequisiteType != "meta_exercise" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "meta_exercise nodes can only have meta_definition or meta_exercise prerequisites"})
		return
	}

	domainID, ownerID, err := h.getMetaDomainInfo(request.NodeType, request.NodeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}
	isAdmin, adminExists := c.Get("isAdmin")
	if userID.(uint) != ownerID && (!adminExists || !isAdmin.(bool)) {
		role, exists, pErr := h.permissionDAO.GetRole(domainID, userID.(uint))
		if pErr != nil || !exists || role != "editor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
			return
		}
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

	// Upsert to avoid duplicates and improve UX
	var existing models.NodePrerequisite
	tx := h.db.Where("node_id = ? AND node_type = ? AND prerequisite_id = ? AND prerequisite_type = ?",
		request.NodeID, request.NodeType, request.PrerequisiteID, request.PrerequisiteType).
		Limit(1).Find(&existing)
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if tx.RowsAffected > 0 {
		// Update weight / isManual
		updates := map[string]interface{}{"weight": request.Weight, "is_manual": request.IsManual}
		if err := h.db.Model(&models.NodePrerequisite{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		existing.Weight = request.Weight
		existing.IsManual = request.IsManual
		h.srsService.InvalidateDomainReviewCaches(domainID)
		c.JSON(http.StatusOK, existing)
		return
	}

	prerequisite := &models.NodePrerequisite{
		NodeID:           request.NodeID,
		NodeType:         request.NodeType,
		PrerequisiteID:   request.PrerequisiteID,
		PrerequisiteType: request.PrerequisiteType,
		Weight:           request.Weight,
		IsManual:         request.IsManual,
	}

	if err := h.srsDao.CreatePrerequisite(prerequisite); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.srsService.InvalidateDomainReviewCaches(domainID)
	c.JSON(http.StatusCreated, prerequisite)
}

// GetPrerequisites gets prerequisites for a domain
func (h *SRSHandler) GetPrerequisites(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("domainId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	var domain models.Domain
	if err := h.db.First(&domain, uint(domainID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canView, err := canViewDomain(&domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	prerequisites, err := h.srsDao.GetPrerequisitesByDomain(uint(domainID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve prerequisites"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"prerequisites": prerequisites})
}

// UpdatePrerequisite updates weight/isManual for a prerequisite
func (h *SRSHandler) UpdatePrerequisite(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	pid64, err := strconv.ParseUint(c.Param("prerequisiteId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid prerequisite ID"})
		return
	}
	var existing models.NodePrerequisite
	if err := h.db.First(&existing, uint(pid64)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Prerequisite not found"})
		return
	}
	domainID, ownerID, err := h.getMetaDomainInfo(existing.NodeType, existing.NodeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}
	isAdmin, adminExists := c.Get("isAdmin")
	if userID.(uint) != ownerID && (!adminExists || !isAdmin.(bool)) {
		role, exists, pErr := h.permissionDAO.GetRole(domainID, userID.(uint))
		if pErr != nil || !exists || role != "editor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
			return
		}
	}
	var req struct {
		Weight   *float64 `json:"weight"`
		IsManual *bool    `json:"isManual"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if req.Weight != nil {
		w := *req.Weight
		if w <= 0 || w > 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Weight must be between 0 and 1"})
			return
		}
		updates["weight"] = w
	}
	if req.IsManual != nil {
		updates["is_manual"] = *req.IsManual
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}
	if err := h.db.Model(&models.NodePrerequisite{}).Where("id = ?", uint(pid64)).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update prerequisite"})
		return
	}
	h.srsService.InvalidateDomainReviewCaches(domainID)
	c.JSON(http.StatusOK, gin.H{"message": "Prerequisite updated"})
}

// DeletePrerequisite deletes a prerequisite relationship
func (h *SRSHandler) DeletePrerequisite(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	prerequisiteID, err := strconv.ParseUint(c.Param("prerequisiteId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid prerequisite ID"})
		return
	}

	var existing models.NodePrerequisite
	if err := h.db.First(&existing, uint(prerequisiteID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Prerequisite not found"})
		return
	}
	domainID, ownerID, err := h.getMetaDomainInfo(existing.NodeType, existing.NodeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}
	isAdmin, adminExists := c.Get("isAdmin")
	if userID.(uint) != ownerID && (!adminExists || !isAdmin.(bool)) {
		role, exists, pErr := h.permissionDAO.GetRole(domainID, userID.(uint))
		if pErr != nil || !exists || role != "editor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
			return
		}
	}

	if err := h.db.Delete(&models.NodePrerequisite{}, prerequisiteID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete prerequisite"})
		return
	}

	h.srsService.InvalidateDomainReviewCaches(domainID)
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
