package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"ankidemy/server/services"
	"github.com/gin-gonic/gin"
)

type QuestHandler struct {
	questDAO      *dao.QuestDAO
	domainDAO     *dao.DomainDAO
	permissionDAO *dao.DomainPermissionDAO
	codeRegistry  *dao.CodeRegistryDAO
	relationDAO   *dao.NodeRelationDAO
	surveyService *services.SurveyService
}

func NewQuestHandler(questDAO *dao.QuestDAO, domainDAO *dao.DomainDAO, permissionDAO *dao.DomainPermissionDAO, registry *dao.CodeRegistryDAO, relationDAO *dao.NodeRelationDAO, surveyService *services.SurveyService) *QuestHandler {
	return &QuestHandler{
		questDAO:      questDAO,
		domainDAO:     domainDAO,
		permissionDAO: permissionDAO,
		codeRegistry:  registry,
		relationDAO:   relationDAO,
		surveyService: surveyService,
	}
}

// GET /api/domains/:id/quests?scope=visible
func (h *QuestHandler) ListVisibleQuests(c *gin.Context) {
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "id")
	if !ok {
		return
	}

	quests, err := h.questDAO.ListVisible(access.Domain.ID, access.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load quests"})
		return
	}

	responses := make([]models.QuestResponse, 0, len(quests))
	for _, q := range quests {
		state, _ := h.questDAO.EnsureUserState(access.UserID, q.ID)
		resp := models.QuestResponse{
			ID:         q.ID,
			DomainID:   q.DomainID,
			OwnerID:    q.OwnerID,
			Code:       q.Code,
			Name:       q.Name,
			Kind:       q.Kind,
			Schedule:   q.Schedule,
			XPosition:  q.XPosition,
			YPosition:  q.YPosition,
			Visibility: q.Visibility,
			Active:     state.Active,
			NextDueAt:  state.NextDueAt,
			CreatedAt:  q.CreatedAt,
			UpdatedAt:  q.UpdatedAt,
		}
		responses = append(responses, resp)
	}
	c.JSON(http.StatusOK, responses)
}

// POST /api/domains/:id/quests
func (h *QuestHandler) CreateQuest(c *gin.Context) {
	access, ok := requireDomainViewAccess(c, h.domainDAO, h.permissionDAO, "id")
	if !ok {
		return
	}

	var req models.QuestCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	kind := strings.TrimSpace(req.Kind)
	if kind == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kind is required"})
		return
	}
	if len(req.Schedule) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Schedule is required"})
		return
	}
	if strings.TrimSpace(req.InitialVersion.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Initial version title is required"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.TrimSpace(req.InitialVersion.Title)
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
		code = generateUniqueCode(h.codeRegistry, access.Domain.ID, req.InitialVersion.Title, "quest")
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

	meta := &models.Quest{
		DomainID:   access.Domain.ID,
		OwnerID:    access.UserID,
		Code:       code,
		Name:       name,
		Kind:       kind,
		Schedule:   req.Schedule,
		XPosition:  req.XPosition,
		YPosition:  req.YPosition,
		Visibility: visibility,
	}
	version := &models.QuestVersion{
		Title:         strings.TrimSpace(req.InitialVersion.Title),
		DescriptionMd: req.InitialVersion.DescriptionMd,
		ImagePath:     req.InitialVersion.ImagePath,
	}
	if req.InitialVersion.TaskList != nil {
		version.TaskList = *req.InitialVersion.TaskList
	}

	if err := h.questDAO.Create(meta, version, access.UserID); err != nil {
		if errors.Is(err, dao.ErrCodeConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", code)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create quest"})
		return
	}

	resp := models.QuestResponse{
		ID:         meta.ID,
		DomainID:   meta.DomainID,
		OwnerID:    meta.OwnerID,
		Code:       meta.Code,
		Name:       meta.Name,
		Kind:       meta.Kind,
		Schedule:   meta.Schedule,
		XPosition:  meta.XPosition,
		YPosition:  meta.YPosition,
		Visibility: meta.Visibility,
		Active:     true,
		CreatedAt:  meta.CreatedAt,
		UpdatedAt:  meta.UpdatedAt,
		Versions: []models.QuestVersionResponse{
			{
				ID:            version.ID,
				QuestID:       meta.ID,
				DisplayOrder:  version.DisplayOrder,
				Title:         version.Title,
				DescriptionMd: version.DescriptionMd,
				TaskList:      version.TaskList,
				ImagePath:     version.ImagePath,
				CreatedAt:     version.CreatedAt,
				UpdatedAt:     version.UpdatedAt,
			},
		},
	}
	// Populate NextDueAt immediately for the creator.
	if h.surveyService != nil {
		if state, err := h.questDAO.EnsureUserState(access.UserID, meta.ID); err == nil && state != nil {
			if updated, err := h.surveyService.EnsureQuestNextDue(access.UserID, meta, state); err == nil && updated != nil {
				resp.NextDueAt = updated.NextDueAt
			}
		}
	}
	c.JSON(http.StatusCreated, resp)
}

// GET /api/quests/:id
func (h *QuestHandler) GetQuest(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	meta, versions, err := h.questDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quest not found"})
		return
	}
	domain, err := h.domainDAO.FindByID(meta.DomainID)
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
	if meta.Visibility == "private" && meta.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	state, _ := h.questDAO.EnsureUserState(userID, meta.ID)
	if h.surveyService != nil {
		if updated, err := h.surveyService.EnsureQuestNextDue(userID, meta, state); err == nil && updated != nil {
			state = updated
		}
	}
	resp := models.QuestResponse{
		ID:         meta.ID,
		DomainID:   meta.DomainID,
		OwnerID:    meta.OwnerID,
		Code:       meta.Code,
		Name:       meta.Name,
		Kind:       meta.Kind,
		Schedule:   meta.Schedule,
		XPosition:  meta.XPosition,
		YPosition:  meta.YPosition,
		Visibility: meta.Visibility,
		Active:     state.Active,
		NextDueAt:  state.NextDueAt,
		CreatedAt:  meta.CreatedAt,
		UpdatedAt:  meta.UpdatedAt,
	}
	if len(versions) > 0 {
		resp.Versions = make([]models.QuestVersionResponse, 0, len(versions))
		for _, v := range versions {
			resp.Versions = append(resp.Versions, models.QuestVersionResponse{
				ID:            v.ID,
				QuestID:       v.QuestID,
				DisplayOrder:  v.DisplayOrder,
				Title:         v.Title,
				DescriptionMd: v.DescriptionMd,
				TaskList:      v.TaskList,
				ImagePath:     v.ImagePath,
				CreatedAt:     v.CreatedAt,
				UpdatedAt:     v.UpdatedAt,
			})
		}
	}
	c.JSON(http.StatusOK, resp)
}

// PATCH /api/quests/:id
func (h *QuestHandler) UpdateQuest(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	meta, _, err := h.questDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quest not found"})
		return
	}
	access, ok := h.requireQuestMutationAccess(c, meta)
	if !ok {
		return
	}

	var req models.QuestUpdateRequest
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
		if newCode != meta.Code {
			exists, err := h.codeRegistry.CodeExists(meta.DomainID, newCode)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check code"})
				return
			}
			if exists {
				c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", newCode)})
				return
			}
			meta.Code = newCode
			codeChanged = true
		}
	}

	if req.Name != nil {
		newName := strings.TrimSpace(*req.Name)
		if newName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Name cannot be empty"})
			return
		}
		meta.Name = newName
	}

	if req.Kind != nil {
		meta.Kind = strings.TrimSpace(*req.Kind)
	}
	if req.Schedule != nil {
		meta.Schedule = *req.Schedule
	}
	if req.Visibility != nil {
		visibility := strings.TrimSpace(*req.Visibility)
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
		meta.Visibility = visibility
	}
	if req.XPosition != nil {
		meta.XPosition = *req.XPosition
	}
	if req.YPosition != nil {
		meta.YPosition = *req.YPosition
	}

	if err := h.questDAO.Update(meta, codeChanged); err != nil {
		if errors.Is(err, dao.ErrCodeConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A node with code '%s' already exists in this domain.", meta.Code)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update quest"})
		return
	}

	if req.Active != nil {
		state, err := h.questDAO.EnsureUserState(access.UserID, meta.ID)
		if err == nil {
			state.Active = *req.Active
			if !state.Active {
				state.NextDueAt = nil
			}
			_ = h.questDAO.UpdateUserState(state)
		}
	}

	state, _ := h.questDAO.EnsureUserState(access.UserID, meta.ID)
	if h.surveyService != nil {
		if updated, err := h.surveyService.EnsureQuestNextDue(access.UserID, meta, state); err == nil && updated != nil {
			state = updated
		}
	}
	resp := models.QuestResponse{
		ID:         meta.ID,
		DomainID:   meta.DomainID,
		OwnerID:    meta.OwnerID,
		Code:       meta.Code,
		Name:       meta.Name,
		Kind:       meta.Kind,
		Schedule:   meta.Schedule,
		XPosition:  meta.XPosition,
		YPosition:  meta.YPosition,
		Visibility: meta.Visibility,
		Active:     state.Active,
		NextDueAt:  state.NextDueAt,
		CreatedAt:  meta.CreatedAt,
		UpdatedAt:  meta.UpdatedAt,
	}
	c.JSON(http.StatusOK, resp)
}

// DELETE /api/quests/:id
func (h *QuestHandler) DeleteQuest(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	meta, _, err := h.questDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quest not found"})
		return
	}
	if _, ok := h.requireQuestMutationAccess(c, meta); !ok {
		return
	}

	if err := h.questDAO.Delete(meta); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete quest"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Quest deleted"})
}

// POST /api/quests/:id/versions
func (h *QuestHandler) AddVersion(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	meta, _, err := h.questDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quest not found"})
		return
	}
	if _, ok := h.requireQuestMutationAccess(c, meta); !ok {
		return
	}

	var req models.QuestVersionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
		return
	}

	version := &models.QuestVersion{
		QuestID:       meta.ID,
		Title:         title,
		DescriptionMd: req.DescriptionMd,
		ImagePath:     req.ImagePath,
	}
	if req.TaskList != nil {
		version.TaskList = *req.TaskList
	}
	if err := h.questDAO.AddVersion(meta.ID, version); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create version"})
		return
	}
	resp := models.QuestVersionResponse{
		ID:            version.ID,
		QuestID:       meta.ID,
		DisplayOrder:  version.DisplayOrder,
		Title:         version.Title,
		DescriptionMd: version.DescriptionMd,
		TaskList:      version.TaskList,
		ImagePath:     version.ImagePath,
		CreatedAt:     version.CreatedAt,
		UpdatedAt:     version.UpdatedAt,
	}
	c.JSON(http.StatusCreated, resp)
}

// PATCH /api/quests/:id/versions/:versionId
func (h *QuestHandler) UpdateVersion(c *gin.Context) {
	versionID64, err := strconv.ParseUint(c.Param("versionId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid version ID"})
		return
	}
	version, err := h.questDAO.FindVersionByID(uint(versionID64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Version not found"})
		return
	}
	meta, _, err := h.questDAO.FindByID(version.QuestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quest not found"})
		return
	}
	if _, ok := h.requireQuestMutationAccess(c, meta); !ok {
		return
	}

	var req models.QuestVersionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Title != "" {
		version.Title = strings.TrimSpace(req.Title)
	}
	if req.DescriptionMd != "" {
		version.DescriptionMd = req.DescriptionMd
	}
	if req.TaskList != nil {
		version.TaskList = *req.TaskList
	}
	if req.ImagePath != nil {
		version.ImagePath = req.ImagePath
	}
	if err := h.questDAO.UpdateVersion(version); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update version"})
		return
	}
	resp := models.QuestVersionResponse{
		ID:            version.ID,
		QuestID:       version.QuestID,
		DisplayOrder:  version.DisplayOrder,
		Title:         version.Title,
		DescriptionMd: version.DescriptionMd,
		TaskList:      version.TaskList,
		ImagePath:     version.ImagePath,
		CreatedAt:     version.CreatedAt,
		UpdatedAt:     version.UpdatedAt,
	}
	c.JSON(http.StatusOK, resp)
}

// DELETE /api/quests/:id/versions/:versionId
func (h *QuestHandler) DeleteVersion(c *gin.Context) {
	versionID64, err := strconv.ParseUint(c.Param("versionId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid version ID"})
		return
	}
	version, err := h.questDAO.FindVersionByID(uint(versionID64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Version not found"})
		return
	}
	meta, _, err := h.questDAO.FindByID(version.QuestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quest not found"})
		return
	}
	if _, ok := h.requireQuestMutationAccess(c, meta); !ok {
		return
	}

	if err := h.questDAO.DeleteVersion(version.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Version deleted"})
}

// PUT /api/quests/:id/versions/:versionId/relevant
func (h *QuestHandler) UpdateRelevantLinks(c *gin.Context) {
	metaID64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid quest ID"})
		return
	}
	versionID64, err := strconv.ParseUint(c.Param("versionId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid version ID"})
		return
	}
	meta, _, err := h.questDAO.FindByID(uint(metaID64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Quest not found"})
		return
	}
	access, ok := h.requireQuestMutationAccess(c, meta)
	if !ok {
		return
	}

	type RelevantReq struct {
		RelationType string `json:"relationType"`
		ToType       string `json:"toType"`
		ToCode       string `json:"toCode"`
	}
	var req []RelevantReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	relations := make([]models.NodeRelation, 0, len(req))
	for _, item := range req {
		toCode := strings.TrimSpace(item.ToCode)
		if toCode == "" {
			continue
		}
		entry, err := h.codeRegistry.FindByCode(meta.DomainID, toCode)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Unknown code %s", toCode)})
			return
		}
		if entry.NodeType != item.ToType {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Code %s does not match node type %s", toCode, item.ToType)})
			return
		}
		relation := models.NodeRelation{
			DomainID:     meta.DomainID,
			FromType:     "quest",
			FromID:       meta.ID,
			ToType:       entry.NodeType,
			ToID:         entry.NodeID,
			RelationType: item.RelationType,
			ContextKey:   "",
			CreatedBy:    access.UserID,
		}
		relations = append(relations, relation)
	}

	if err := h.relationDAO.ReplaceQuestVersionRelations(meta.DomainID, meta.ID, uint(versionID64), relations); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update relations"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Relations updated"})
}

func (h *QuestHandler) requireQuestMutationAccess(c *gin.Context, meta *models.Quest) (*domainAccessContext, bool) {
	domain, err := h.domainDAO.FindByID(meta.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return nil, false
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return nil, false
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return nil, false
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return nil, false
	}
	allowed, err := canMutateVisibilityScopedNode(domain, &resolvedNodeAccess{
		NodeType:   "quest",
		NodeID:     meta.ID,
		DomainID:   meta.DomainID,
		OwnerID:    meta.OwnerID,
		Visibility: meta.Visibility,
	}, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visibility"})
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
