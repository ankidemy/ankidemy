package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"ankidemy/server/dao"
	"ankidemy/server/models"
)

type ExternalPrerequisiteHandler struct {
	domainDAO         *dao.DomainDAO
	permissionDAO     *dao.DomainPermissionDAO
	externalDAO       *dao.ExternalPrerequisiteDAO
	metaDefinitionDAO *dao.MetaDefinitionDAO
	metaExerciseDAO   *dao.MetaExerciseDAO
}

func NewExternalPrerequisiteHandler(
	domainDAO *dao.DomainDAO,
	permissionDAO *dao.DomainPermissionDAO,
	externalDAO *dao.ExternalPrerequisiteDAO,
	metaDefinitionDAO *dao.MetaDefinitionDAO,
	metaExerciseDAO *dao.MetaExerciseDAO,
) *ExternalPrerequisiteHandler {
	return &ExternalPrerequisiteHandler{
		domainDAO:         domainDAO,
		permissionDAO:     permissionDAO,
		externalDAO:       externalDAO,
		metaDefinitionDAO: metaDefinitionDAO,
		metaExerciseDAO:   metaExerciseDAO,
	}
}

type externalPrerequisiteRequest struct {
	NodeID            uint   `json:"nodeId" binding:"required"`
	NodeType          string `json:"nodeType" binding:"required"`
	ExternalDomainUID string `json:"externalDomainUid" binding:"required"`
	ExternalNodeID    uint   `json:"externalNodeId" binding:"required"`
	ExternalNodeType  string `json:"externalNodeType" binding:"required"`
}

type externalPrerequisiteResponse struct {
	ID                 uint     `json:"id"`
	DomainID           uint     `json:"domainId"`
	NodeID             uint     `json:"nodeId"`
	NodeType           string   `json:"nodeType"`
	ExternalDomainUID  string   `json:"externalDomainUid"`
	ExternalDomainID   *uint    `json:"externalDomainId,omitempty"`
	ExternalDomainName string   `json:"externalDomainName,omitempty"`
	ExternalNodeID     uint     `json:"externalNodeId"`
	ExternalNodeType   string   `json:"externalNodeType"`
	ExternalNodeCode   string   `json:"externalNodeCode,omitempty"`
	ExternalNodeName   string   `json:"externalNodeName,omitempty"`
	XPosition          *float64 `json:"xPosition,omitempty"`
	YPosition          *float64 `json:"yPosition,omitempty"`
	Status             string   `json:"status"`
}

const (
	externalStatusOK            = "ok"
	externalStatusMissingDomain = "missing_domain"
	externalStatusMissingNode   = "missing_node"
	externalStatusNoAccess      = "no_access"
)

// GET /api/domains/:id/external-prerequisites
func (h *ExternalPrerequisiteHandler) ListByDomain(c *gin.Context) {
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

	links, err := h.externalDAO.ListByDomainID(domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load external prerequisites"})
		return
	}

	responses := make([]externalPrerequisiteResponse, 0, len(links))
	for _, link := range links {
		resp := externalPrerequisiteResponse{
			ID:                 link.ID,
			DomainID:           link.DomainID,
			NodeID:             link.NodeID,
			NodeType:           link.NodeType,
			ExternalDomainUID:  link.ExternalDomainUID,
			ExternalDomainID:   link.ExternalDomainID,
			ExternalDomainName: link.ExternalDomainName,
			ExternalNodeID:     link.ExternalNodeID,
			ExternalNodeType:   link.ExternalNodeType,
			ExternalNodeCode:   link.ExternalNodeCode,
			ExternalNodeName:   link.ExternalNodeName,
			XPosition:          link.XPosition,
			YPosition:          link.YPosition,
			Status:             externalStatusOK,
		}

		if link.ExternalDomainUID == "" {
			resp.Status = externalStatusMissingDomain
			responses = append(responses, resp)
			continue
		}

		externalDomain, err := h.domainDAO.FindByUID(link.ExternalDomainUID)
		if err != nil {
			resp.Status = externalStatusMissingDomain
			responses = append(responses, resp)
			continue
		}

		canViewExternal, err := canViewDomain(externalDomain, userID, isAdmin, h.permissionDAO)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check external domain access"})
			return
		}
		if !canViewExternal {
			resp.Status = externalStatusNoAccess
			resp.ExternalDomainID = nil
			responses = append(responses, resp)
			continue
		}

		resp.ExternalDomainID = &externalDomain.ID
		resp.ExternalDomainName = externalDomain.Name

		switch link.ExternalNodeType {
		case "definition":
			meta, _, err := h.metaDefinitionDAO.FindByID(link.ExternalNodeID)
			if err != nil || meta.DomainID != externalDomain.ID {
				resp.Status = externalStatusMissingNode
			} else {
				resp.ExternalNodeCode = meta.Code
				resp.ExternalNodeName = meta.Name
			}
		case "exercise":
			meta, _, err := h.metaExerciseDAO.FindByID(link.ExternalNodeID)
			if err != nil || meta.DomainID != externalDomain.ID {
				resp.Status = externalStatusMissingNode
			} else {
				resp.ExternalNodeCode = meta.Code
				resp.ExternalNodeName = meta.Name
			}
		default:
			resp.Status = externalStatusMissingNode
		}

		responses = append(responses, resp)
	}

	c.JSON(http.StatusOK, responses)
}

// POST /api/domains/:id/external-prerequisites
func (h *ExternalPrerequisiteHandler) Create(c *gin.Context) {
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

	var req externalPrerequisiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.NodeType = strings.TrimSpace(req.NodeType)
	req.ExternalNodeType = strings.TrimSpace(req.ExternalNodeType)
	req.ExternalDomainUID = strings.TrimSpace(req.ExternalDomainUID)
	if !isValidExternalNodeType(req.NodeType) || !isValidExternalNodeType(req.ExternalNodeType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid node type"})
		return
	}
	if req.ExternalDomainUID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "External domain UID is required"})
		return
	}
	if req.NodeType == "definition" && req.ExternalNodeType != "definition" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Concepts can only link to external concepts"})
		return
	}

	if err := h.validateNodeInDomain(domain.ID, req.NodeID, req.NodeType); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	externalDomain, err := h.domainDAO.FindByUID(req.ExternalDomainUID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "External domain not found"})
		return
	}
	if externalDomain.ID == domain.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Use internal prerequisites for nodes in the same domain"})
		return
	}

	canViewExternal, err := canViewDomain(externalDomain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check external domain access"})
		return
	}
	if !canViewExternal {
		c.JSON(http.StatusForbidden, gin.H{"error": "No access to external domain"})
		return
	}

	externalNodeCode, externalNodeName, err := h.resolveExternalNode(externalDomain.ID, req.ExternalNodeID, req.ExternalNodeType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	externalDomainID := externalDomain.ID
	link := &models.ExternalPrerequisite{
		DomainID:           domain.ID,
		NodeID:             req.NodeID,
		NodeType:           req.NodeType,
		ExternalDomainUID:  req.ExternalDomainUID,
		ExternalDomainID:   &externalDomainID,
		ExternalDomainName: externalDomain.Name,
		ExternalNodeID:     req.ExternalNodeID,
		ExternalNodeType:   req.ExternalNodeType,
		ExternalNodeCode:   externalNodeCode,
		ExternalNodeName:   externalNodeName,
		CreatedBy:          userID,
	}

	if err := h.externalDAO.Create(link); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			c.JSON(http.StatusConflict, gin.H{"error": "External prerequisite already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create external prerequisite"})
		return
	}

	resp := externalPrerequisiteResponse{
		ID:                 link.ID,
		DomainID:           link.DomainID,
		NodeID:             link.NodeID,
		NodeType:           link.NodeType,
		ExternalDomainUID:  link.ExternalDomainUID,
		ExternalDomainID:   link.ExternalDomainID,
		ExternalDomainName: link.ExternalDomainName,
		ExternalNodeID:     link.ExternalNodeID,
		ExternalNodeType:   link.ExternalNodeType,
		ExternalNodeCode:   link.ExternalNodeCode,
		ExternalNodeName:   link.ExternalNodeName,
		XPosition:          link.XPosition,
		YPosition:          link.YPosition,
		Status:             externalStatusOK,
	}

	c.JSON(http.StatusCreated, resp)
}

// DELETE /api/domains/:id/external-prerequisites/:linkId
func (h *ExternalPrerequisiteHandler) Delete(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	linkID, err := strconv.ParseUint(c.Param("linkId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid link ID"})
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

	link, err := h.externalDAO.FindByID(uint(linkID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load external prerequisite"})
		return
	}
	if link == nil || link.DomainID != domain.ID {
		c.JSON(http.StatusNotFound, gin.H{"error": "External prerequisite not found"})
		return
	}

	if err := h.externalDAO.DeleteByID(link.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete external prerequisite"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "External prerequisite removed"})
}

// PUT /api/domains/:id/external-prerequisites/positions
func (h *ExternalPrerequisiteHandler) UpdatePositions(c *gin.Context) {
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

	var req struct {
		Positions []struct {
			ExternalDomainUID string  `json:"externalDomainUid" binding:"required"`
			ExternalNodeID    uint    `json:"externalNodeId" binding:"required"`
			ExternalNodeType  string  `json:"externalNodeType" binding:"required"`
			XPosition         float64 `json:"xPosition" binding:"required"`
			YPosition         float64 `json:"yPosition" binding:"required"`
		} `json:"positions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	positions := make([]dao.ExternalPrerequisitePosition, 0, len(req.Positions))
	for _, pos := range req.Positions {
		pos.ExternalDomainUID = strings.TrimSpace(pos.ExternalDomainUID)
		pos.ExternalNodeType = strings.TrimSpace(pos.ExternalNodeType)
		if pos.ExternalDomainUID == "" || !isValidExternalNodeType(pos.ExternalNodeType) {
			continue
		}
		positions = append(positions, dao.ExternalPrerequisitePosition{
			ExternalDomainUID: pos.ExternalDomainUID,
			ExternalNodeID:    pos.ExternalNodeID,
			ExternalNodeType:  pos.ExternalNodeType,
			XPosition:         pos.XPosition,
			YPosition:         pos.YPosition,
		})
	}

	if err := h.externalDAO.UpdatePositions(domain.ID, positions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update external positions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "External positions updated"})
}

func isValidExternalNodeType(nodeType string) bool {
	return nodeType == "definition" || nodeType == "exercise"
}

func (h *ExternalPrerequisiteHandler) validateNodeInDomain(domainID, nodeID uint, nodeType string) error {
	switch nodeType {
	case "definition":
		meta, _, err := h.metaDefinitionDAO.FindByID(nodeID)
		if err != nil || meta.DomainID != domainID {
			return errors.New("Node not found in domain")
		}
	case "exercise":
		meta, _, err := h.metaExerciseDAO.FindByID(nodeID)
		if err != nil || meta.DomainID != domainID {
			return errors.New("Node not found in domain")
		}
	default:
		return errors.New("Invalid node type")
	}
	return nil
}

func (h *ExternalPrerequisiteHandler) resolveExternalNode(domainID, nodeID uint, nodeType string) (string, string, error) {
	switch nodeType {
	case "definition":
		meta, _, err := h.metaDefinitionDAO.FindByID(nodeID)
		if err != nil || meta.DomainID != domainID {
			return "", "", errors.New("External node not found")
		}
		return meta.Code, meta.Name, nil
	case "exercise":
		meta, _, err := h.metaExerciseDAO.FindByID(nodeID)
		if err != nil || meta.DomainID != domainID {
			return "", "", errors.New("External node not found")
		}
		return meta.Code, meta.Name, nil
	default:
		return "", "", errors.New("Invalid node type")
	}
}
