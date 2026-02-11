package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"ankidemy/server/dao"
	"ankidemy/server/models"
)

type GroupHandler struct {
	groupDAO        *dao.GroupDAO
	domainDAO       *dao.DomainDAO
	permissionDAO   *dao.DomainPermissionDAO
	metaDefDAO      *dao.MetaDefinitionDAO
	metaExerciseDAO *dao.MetaExerciseDAO
}

func NewGroupHandler(groupDAO *dao.GroupDAO, domainDAO *dao.DomainDAO, permissionDAO *dao.DomainPermissionDAO, metaDefDAO *dao.MetaDefinitionDAO, metaExerciseDAO *dao.MetaExerciseDAO) *GroupHandler {
	return &GroupHandler{
		groupDAO:        groupDAO,
		domainDAO:       domainDAO,
		permissionDAO:   permissionDAO,
		metaDefDAO:      metaDefDAO,
		metaExerciseDAO: metaExerciseDAO,
	}
}

type groupNodeRef struct {
	NodeID   uint   `json:"nodeId"`
	NodeType string `json:"nodeType"`
	NodeCode string `json:"nodeCode,omitempty"`
	NodeName string `json:"nodeName,omitempty"`
}

type groupResponse struct {
	ID        uint           `json:"id"`
	DomainID  uint           `json:"domainId"`
	Name      string         `json:"name"`
	IsExact   bool           `json:"isExact"`
	XPosition float64        `json:"xPosition,omitempty"`
	YPosition float64        `json:"yPosition,omitempty"`
	Seeds     []groupNodeRef `json:"seeds"`
	Members   []groupNodeRef `json:"members,omitempty"`
	Collapsed bool           `json:"collapsed"`
}

type createGroupRequest struct {
	Name      string         `json:"name" binding:"required"`
	IsExact   bool           `json:"isExact"`
	XPosition *float64       `json:"xPosition,omitempty"`
	YPosition *float64       `json:"yPosition,omitempty"`
	Seeds     []groupNodeRef `json:"seeds" binding:"required"`
	Members   []groupNodeRef `json:"members,omitempty"`
}

type updateGroupRequest struct {
	Name      *string         `json:"name,omitempty"`
	IsExact   *bool           `json:"isExact,omitempty"`
	XPosition *float64        `json:"xPosition,omitempty"`
	YPosition *float64        `json:"yPosition,omitempty"`
	Seeds     *[]groupNodeRef `json:"seeds,omitempty"`
	Members   *[]groupNodeRef `json:"members,omitempty"`
}

type updateGroupStateRequest struct {
	Collapsed bool `json:"collapsed"`
}

func isValidGroupNodeType(nodeType string) bool {
	return nodeType == "meta_definition" || nodeType == "meta_exercise"
}

func (h *GroupHandler) getDomainNodes(domainID uint) (map[uint]models.MetaDefinition, map[uint]models.MetaExercise, error) {
	metaDefs, err := h.metaDefDAO.ListByDomain(domainID)
	if err != nil {
		return nil, nil, err
	}
	metaExercises, err := h.metaExerciseDAO.ListByDomain(domainID)
	if err != nil {
		return nil, nil, err
	}

	defMap := make(map[uint]models.MetaDefinition, len(metaDefs))
	for _, d := range metaDefs {
		defMap[d.ID] = d
	}
	exMap := make(map[uint]models.MetaExercise, len(metaExercises))
	for _, e := range metaExercises {
		exMap[e.ID] = e
	}
	return defMap, exMap, nil
}

func (h *GroupHandler) validateNodeRefs(refs []groupNodeRef, defs map[uint]models.MetaDefinition, exs map[uint]models.MetaExercise) ([]models.NodeGroupSeed, []groupNodeRef, error) {
	seeds := make([]models.NodeGroupSeed, 0, len(refs))
	validRefs := make([]groupNodeRef, 0, len(refs))
	seen := make(map[string]struct{})
	for _, ref := range refs {
		ref.NodeType = strings.TrimSpace(ref.NodeType)
		if !isValidGroupNodeType(ref.NodeType) {
			return nil, nil, errors.New("invalid node type")
		}
		if ref.NodeType == "meta_definition" {
			def, ok := defs[ref.NodeID]
			if !ok {
				return nil, nil, errors.New("invalid node reference")
			}
			ref.NodeCode = def.Code
			ref.NodeName = def.Name
		} else {
			ex, ok := exs[ref.NodeID]
			if !ok {
				return nil, nil, errors.New("invalid node reference")
			}
			ref.NodeCode = ex.Code
			ref.NodeName = ex.Name
		}
		dupeKey := ref.NodeType + ":" + strconv.FormatUint(uint64(ref.NodeID), 10)
		if _, exists := seen[dupeKey]; exists {
			continue
		}
		seen[dupeKey] = struct{}{}
		seeds = append(seeds, models.NodeGroupSeed{
			NodeID:   ref.NodeID,
			NodeType: ref.NodeType,
		})
		validRefs = append(validRefs, ref)
	}
	return seeds, validRefs, nil
}

// GET /api/domains/:id/groups
func (h *GroupHandler) ListByDomain(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	domain, err := h.domainDAO.FindByID(uint(domainID))
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

	groups, seeds, members, err := h.groupDAO.ListByDomainID(domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load groups"})
		return
	}

	defs, exs, err := h.getDomainNodes(domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load group nodes"})
		return
	}

	groupIDs := make([]uint, 0, len(groups))
	for _, g := range groups {
		groupIDs = append(groupIDs, g.ID)
	}
	states, err := h.groupDAO.ListUserStates(userID, groupIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load group state"})
		return
	}
	stateMap := make(map[uint]bool, len(states))
	for _, st := range states {
		stateMap[st.GroupID] = st.Collapsed
	}

	seedsByGroup := make(map[uint][]groupNodeRef)
	for _, s := range seeds {
		ref := groupNodeRef{NodeID: s.NodeID, NodeType: s.NodeType}
		if s.NodeType == "meta_definition" {
			if def, ok := defs[s.NodeID]; ok {
				ref.NodeCode = def.Code
				ref.NodeName = def.Name
			}
		} else if s.NodeType == "meta_exercise" {
			if ex, ok := exs[s.NodeID]; ok {
				ref.NodeCode = ex.Code
				ref.NodeName = ex.Name
			}
		}
		seedsByGroup[s.GroupID] = append(seedsByGroup[s.GroupID], ref)
	}

	membersByGroup := make(map[uint][]groupNodeRef)
	for _, m := range members {
		ref := groupNodeRef{NodeID: m.NodeID, NodeType: m.NodeType}
		if m.NodeType == "meta_definition" {
			if def, ok := defs[m.NodeID]; ok {
				ref.NodeCode = def.Code
				ref.NodeName = def.Name
			}
		} else if m.NodeType == "meta_exercise" {
			if ex, ok := exs[m.NodeID]; ok {
				ref.NodeCode = ex.Code
				ref.NodeName = ex.Name
			}
		}
		membersByGroup[m.GroupID] = append(membersByGroup[m.GroupID], ref)
	}

	responses := make([]groupResponse, 0, len(groups))
	for _, g := range groups {
		responses = append(responses, groupResponse{
			ID:        g.ID,
			DomainID:  g.DomainID,
			Name:      g.Name,
			IsExact:   g.IsExact,
			XPosition: g.XPosition,
			YPosition: g.YPosition,
			Seeds:     seedsByGroup[g.ID],
			Members:   membersByGroup[g.ID],
			Collapsed: stateMap[g.ID],
		})
	}

	c.JSON(http.StatusOK, responses)
}

// POST /api/domains/:id/groups
func (h *GroupHandler) Create(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	domain, err := h.domainDAO.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	canEdit, err := canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canEdit {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	var req createGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Group name is required"})
		return
	}
	if len(req.Seeds) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Group seeds are required"})
		return
	}

	defs, exs, err := h.getDomainNodes(domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load group nodes"})
		return
	}

	seedModels, seedRefs, err := h.validateNodeRefs(req.Seeds, defs, exs)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	memberModels := []models.NodeGroupMember{}
	memberRefs := []groupNodeRef{}
	if req.IsExact {
		members := req.Members
		if len(members) == 0 {
			members = req.Seeds
		}
		memberSeedModels, memberRefsParsed, err := h.validateNodeRefs(members, defs, exs)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		for _, seed := range memberSeedModels {
			memberModels = append(memberModels, models.NodeGroupMember{NodeID: seed.NodeID, NodeType: seed.NodeType})
		}
		memberRefs = memberRefsParsed
	}

	group := models.NodeGroup{
		DomainID:  domain.ID,
		Name:      name,
		IsExact:   req.IsExact,
		CreatedBy: userID,
	}
	if req.XPosition != nil {
		group.XPosition = *req.XPosition
	}
	if req.YPosition != nil {
		group.YPosition = *req.YPosition
	}

	if err := h.groupDAO.Create(&group, seedModels, memberModels); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create group"})
		return
	}

	c.JSON(http.StatusCreated, groupResponse{
		ID:        group.ID,
		DomainID:  group.DomainID,
		Name:      group.Name,
		IsExact:   group.IsExact,
		XPosition: group.XPosition,
		YPosition: group.YPosition,
		Seeds:     seedRefs,
		Members:   memberRefs,
		Collapsed: false,
	})
}

// PATCH /api/groups/:id
func (h *GroupHandler) Update(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	group, err := h.groupDAO.FindByID(uint(groupID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	domain, err := h.domainDAO.FindByID(group.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	canEdit, err := canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canEdit {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	var req updateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Group name cannot be empty"})
			return
		}
		group.Name = name
	}
	if req.IsExact != nil {
		group.IsExact = *req.IsExact
	}
	if req.XPosition != nil {
		group.XPosition = *req.XPosition
	}
	if req.YPosition != nil {
		group.YPosition = *req.YPosition
	}

	defs, exs, err := h.getDomainNodes(domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load group nodes"})
		return
	}

	var seedModels *[]models.NodeGroupSeed
	var seedRefs []groupNodeRef
	if req.Seeds != nil {
		if len(*req.Seeds) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Group seeds cannot be empty"})
			return
		}
		models, refs, err := h.validateNodeRefs(*req.Seeds, defs, exs)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		seedModels = &models
		seedRefs = refs
	}

	var memberModels *[]models.NodeGroupMember
	var memberRefs []groupNodeRef
	if req.Members != nil {
		members := *req.Members
		memberSeeds, refs, err := h.validateNodeRefs(members, defs, exs)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		memberModels = &[]models.NodeGroupMember{}
		for _, m := range memberSeeds {
			*memberModels = append(*memberModels, models.NodeGroupMember{NodeID: m.NodeID, NodeType: m.NodeType})
		}
		memberRefs = refs
	}

	if err := h.groupDAO.Update(group, seedModels, memberModels); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update group"})
		return
	}

	_, seeds, members, err := h.groupDAO.ListByDomainID(domain.ID)
	if err == nil {
		seedRefs = []groupNodeRef{}
		for _, s := range seeds {
			if s.GroupID != group.ID {
				continue
			}
			ref := groupNodeRef{NodeID: s.NodeID, NodeType: s.NodeType}
			if s.NodeType == "meta_definition" {
				if def, ok := defs[s.NodeID]; ok {
					ref.NodeCode = def.Code
					ref.NodeName = def.Name
				}
			} else if s.NodeType == "meta_exercise" {
				if ex, ok := exs[s.NodeID]; ok {
					ref.NodeCode = ex.Code
					ref.NodeName = ex.Name
				}
			}
			seedRefs = append(seedRefs, ref)
		}
		memberRefs = []groupNodeRef{}
		for _, m := range members {
			if m.GroupID != group.ID {
				continue
			}
			ref := groupNodeRef{NodeID: m.NodeID, NodeType: m.NodeType}
			if m.NodeType == "meta_definition" {
				if def, ok := defs[m.NodeID]; ok {
					ref.NodeCode = def.Code
					ref.NodeName = def.Name
				}
			} else if m.NodeType == "meta_exercise" {
				if ex, ok := exs[m.NodeID]; ok {
					ref.NodeCode = ex.Code
					ref.NodeName = ex.Name
				}
			}
			memberRefs = append(memberRefs, ref)
		}
	}

	collapsed := false
	if states, err := h.groupDAO.ListUserStates(userID, []uint{group.ID}); err == nil {
		if len(states) > 0 {
			collapsed = states[0].Collapsed
		}
	}

	c.JSON(http.StatusOK, groupResponse{
		ID:        group.ID,
		DomainID:  group.DomainID,
		Name:      group.Name,
		IsExact:   group.IsExact,
		XPosition: group.XPosition,
		YPosition: group.YPosition,
		Seeds:     seedRefs,
		Members:   memberRefs,
		Collapsed: collapsed,
	})
}

// DELETE /api/groups/:id
func (h *GroupHandler) Delete(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	group, err := h.groupDAO.FindByID(uint(groupID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	domain, err := h.domainDAO.FindByID(group.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	canEdit, err := canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canEdit {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	if err := h.groupDAO.Delete(group.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete group"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Group deleted"})
}

// PUT /api/groups/:id/state
func (h *GroupHandler) UpdateState(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	group, err := h.groupDAO.FindByID(uint(groupID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	domain, err := h.domainDAO.FindByID(group.DomainID)
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

	var req updateGroupStateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.groupDAO.UpsertUserState(userID, group.ID, req.Collapsed); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update group state"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"groupId": group.ID, "collapsed": req.Collapsed})
}

// PUT /api/domains/:id/groups/positions
func (h *GroupHandler) UpdatePositions(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	domain, err := h.domainDAO.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	canEdit, err := canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canEdit {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	var payload map[string]struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	positions := make(map[uint]struct{ X, Y float64 })
	for key, pos := range payload {
		groupID, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
			return
		}
		positions[uint(groupID)] = struct{ X, Y float64 }{X: pos.X, Y: pos.Y}
	}

	if err := h.groupDAO.UpdatePositions(uint(domainID), positions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update group positions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Group positions updated"})
}
