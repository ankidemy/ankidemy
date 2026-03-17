package handlers

import (
	"errors"
	"net/http"
	"strconv"
	//"time"

	"ankidemy/server/dao"
	"ankidemy/server/middleware"
	"ankidemy/server/models"
	"ankidemy/server/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type srsServiceStore interface {
	SubmitReview(userID uint, request *models.ReviewRequest) (*models.ReviewResponse, error)
	GetDueReviews(userID uint, domainID uint, nodeType string, requestID string) ([]models.NodeProgress, error)
	GetDueReviewsCompact(userID uint, domainID uint, nodeType string, requestID string) ([]models.DueReviewCompact, error)
	GetReviewQueue(userID uint, domainID uint, sessionType string, mode string, exercisesPerDefinition int, requestID string) ([]models.ReviewQueueItem, error)
	UpdateNodeStatus(userID uint, nodeID uint, nodeType string, status string) error
	InvalidateDomainReviewCaches(domainID uint)
}

type srsDAOStore interface {
	GetReviewHistory(userID uint, nodeID *uint, nodeType *string, limit int) ([]models.ReviewHistory, error)
	GetDomainProgress(userID uint, domainID uint) ([]models.NodeProgress, error)
	GetDomainStats(userID uint, domainID uint, requestID string) (*models.DomainProgressSummary, error)
	CreateSession(session *models.StudySession) error
	GetSession(sessionID uint) (*models.StudySession, error)
	EndSession(sessionID uint) error
	GetUserSessions(userID uint, limit int) ([]models.StudySession, error)
	CreatePrerequisite(prerequisite *models.NodePrerequisite) error
	GetPrerequisitesByDomain(domainID uint) ([]models.NodePrerequisite, error)
}

type notificationSummaryReader interface {
	GetSummary(userID uint, requestID string) (*models.NotificationSummary, error)
}

// SRSHandler handles SRS-related HTTP requests
type SRSHandler struct {
	db                    *gorm.DB
	domainDAO             domainFinder
	srsService            srsServiceStore
	srsDao                srsDAOStore
	permissionDAO         domainPermissionLookup
	notificationReadModel notificationSummaryReader
	nodeAccessResolver    nodeAccessResolver
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
		domainDAO:             dao.NewDomainDAO(db),
		srsService:            services.NewSRSService(db, notificationReadModel, queryCache),
		srsDao:                dao.NewSRSDao(db),
		permissionDAO:         permissionDAO,
		notificationReadModel: notificationReadModel,
		nodeAccessResolver:    newDBNodeAccessResolver(db),
	}
}

func (h *SRSHandler) requireDomainAccessByID(c *gin.Context, domainID uint, accessLevel domainAccessLevel) (*domainAccessContext, bool) {
	domain, err := h.domainDAO.FindByID(domainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return nil, false
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return nil, false
	}

	var allowed bool
	switch accessLevel {
	case domainAccessLevelView:
		allowed, err = canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	case domainAccessLevelEdit:
		allowed, err = canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	default:
		err = errors.New("unsupported access level")
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return nil, false
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return nil, false
	}

	return &domainAccessContext{
		Domain:  domain,
		UserID:  userID,
		IsAdmin: isAdmin,
	}, true
}

func (h *SRSHandler) resolveReviewNodeDomainID(nodeType string, nodeID uint) (uint, error) {
	switch nodeType {
	case "definition":
		resolved, err := h.nodeAccessResolver.ResolveNodeAccess("meta_definition", nodeID)
		if err == nil {
			return resolved.DomainID, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, err
		}
		resolved, err = h.nodeAccessResolver.ResolveNodeAccess("definition", nodeID)
		if err != nil {
			return 0, err
		}
		return resolved.DomainID, nil
	case "exercise":
		resolved, err := h.nodeAccessResolver.ResolveNodeAccess("meta_exercise", nodeID)
		if err == nil {
			return resolved.DomainID, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, err
		}
		resolved, err = h.nodeAccessResolver.ResolveNodeAccess("exercise", nodeID)
		if err != nil {
			return 0, err
		}
		return resolved.DomainID, nil
	default:
		return 0, errors.New("invalid node type")
	}
}

func (h *SRSHandler) getMetaDomainInfo(nodeType string, nodeID uint) (uint, uint, error) {
	resolved, err := h.nodeAccessResolver.ResolveNodeAccess(nodeType, nodeID)
	if err != nil {
		return 0, 0, err
	}
	return resolved.DomainID, resolved.OwnerID, nil
}

// === Review Endpoints ===

// SubmitReview handles review submission
func (h *SRSHandler) SubmitReview(c *gin.Context) {
	if _, _, ok := getUserContext(c); !ok {
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

	domainID, err := h.resolveReviewNodeDomainID(request.NodeType, request.NodeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}
	access, ok := h.requireDomainAccessByID(c, domainID, domainAccessLevelEdit)
	if !ok {
		return
	}

	response, err := h.srsService.SubmitReview(access.UserID, &request)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetDueReviews gets nodes due for review
func (h *SRSHandler) GetDueReviews(c *gin.Context) {
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "domainId")
	if !ok {
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
		dueNodes, err := h.srsService.GetDueReviewsCompact(access.UserID, access.Domain.ID, nodeType, requestID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"dueNodes": dueNodes})
		return
	}

	dueNodes, err := h.srsService.GetDueReviews(access.UserID, access.Domain.ID, nodeType, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"dueNodes": dueNodes})
}

// GetReviewQueue gets a practice review queue with exercise selections
func (h *SRSHandler) GetReviewQueue(c *gin.Context) {
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "domainId")
	if !ok {
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

	queue, err := h.srsService.GetReviewQueue(access.UserID, access.Domain.ID, sessionType, mode, exCount, middleware.GetRequestID(c))
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
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "domainId")
	if !ok {
		return
	}

	progress, err := h.srsDao.GetDomainProgress(access.UserID, access.Domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain progress"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"progress": progress})
}

// GetDomainStats gets statistics for a domain
func (h *SRSHandler) GetDomainStats(c *gin.Context) {
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "domainId")
	if !ok {
		return
	}

	stats, err := h.srsDao.GetDomainStats(access.UserID, access.Domain.ID, middleware.GetRequestID(c))
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
	if _, _, ok := getUserContext(c); !ok {
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

	domainID, err := h.resolveReviewNodeDomainID(nodeType, request.NodeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}
	access, ok := h.requireDomainAccessByID(c, domainID, domainAccessLevelEdit)
	if !ok {
		return
	}

	err = h.srsService.UpdateNodeStatus(access.UserID, request.NodeID, nodeType, request.Status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Node status updated successfully"})
}

// === Session Endpoints ===

// StartSession starts a new study session
func (h *SRSHandler) StartSession(c *gin.Context) {
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

	access, ok := h.requireDomainAccessByID(c, request.DomainID, domainAccessLevelView)
	if !ok {
		return
	}

	session := &models.StudySession{
		UserID:            access.UserID,
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
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "domainId")
	if !ok {
		return
	}

	prerequisites, err := h.srsDao.GetPrerequisitesByDomain(access.Domain.ID)
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

	if _, ok := h.requireDomainAccessByID(c, request.DomainID, domainAccessLevelView); !ok {
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
