package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RelationHandler struct {
	relationDAO   *dao.NodeRelationDAO
	domainDAO     *dao.DomainDAO
	permissionDAO *dao.DomainPermissionDAO
	metaDefDAO    *dao.MetaDefinitionDAO
	metaExDAO     *dao.MetaExerciseDAO
	sourceDAO     *dao.SourceDAO
	metaQuestDAO  *dao.MetaQuestDAO
	nodeResolver  nodeAccessResolver
}

func NewRelationHandler(relationDAO *dao.NodeRelationDAO, domainDAO *dao.DomainDAO, permissionDAO *dao.DomainPermissionDAO, metaDefDAO *dao.MetaDefinitionDAO, metaExDAO *dao.MetaExerciseDAO, sourceDAO *dao.SourceDAO, metaQuestDAO *dao.MetaQuestDAO) *RelationHandler {
	return &RelationHandler{
		relationDAO:   relationDAO,
		domainDAO:     domainDAO,
		permissionDAO: permissionDAO,
		metaDefDAO:    metaDefDAO,
		metaExDAO:     metaExDAO,
		sourceDAO:     sourceDAO,
		metaQuestDAO:  metaQuestDAO,
		nodeResolver:  newDBNodeAccessResolver(domainDAO.DB()),
	}
}

// GET /api/domains/:id/relations?scope=visible
func (h *RelationHandler) ListVisibleRelations(c *gin.Context) {
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

	relations, err := h.relationDAO.ListByDomain(uint(domainID64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load relations"})
		return
	}

	visible := h.buildVisibleNodeSet(uint(domainID64), userID)
	filtered := make([]models.NodeRelation, 0, len(relations))
	for _, rel := range relations {
		if visible[rel.FromType][rel.FromID] && visible[rel.ToType][rel.ToID] {
			filtered = append(filtered, rel)
		}
	}

	c.JSON(http.StatusOK, filtered)
}

// POST /api/domains/:id/relations
func (h *RelationHandler) CreateRelation(c *gin.Context) {
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

	var req models.NodeRelationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.FromType == req.ToType && req.FromID == req.ToID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot create self-relation"})
		return
	}

	fromNode, err := h.resolveRelationNode(req.FromType, req.FromID)
	if err != nil {
		h.renderRelationNodeError(c, err)
		return
	}
	toNode, err := h.resolveRelationNode(req.ToType, req.ToID)
	if err != nil {
		h.renderRelationNodeError(c, err)
		return
	}
	if fromNode.DomainID != domain.ID || toNode.DomainID != domain.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Both relation nodes must belong to the route domain"})
		return
	}

	allowed, err := h.canCreateRelation(domain, userID, isAdmin, fromNode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	relation := &models.NodeRelation{
		DomainID:     uint(domainID64),
		FromType:     req.FromType,
		FromID:       req.FromID,
		ToType:       req.ToType,
		ToID:         req.ToID,
		RelationType: req.RelationType,
		ContextKey:   req.ContextKey,
		CreatedBy:    userID,
	}
	if err := h.relationDAO.Create(relation); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create relation"})
		return
	}
	c.JSON(http.StatusCreated, relation)
}

// DELETE /api/relations/:id
func (h *RelationHandler) DeleteRelation(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid relation ID"})
		return
	}
	relation, err := h.relationDAO.FindByID(uint(id64))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Relation not found"})
		return
	}
	domain, err := h.domainDAO.FindByID(relation.DomainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	allow := relation.CreatedBy == userID
	if !allow && (userID == domain.OwnerID || isAdmin) {
		allow = true
	}
	if !allow {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	if err := h.relationDAO.Delete(uint(id64)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete relation"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Relation deleted"})
}

func (h *RelationHandler) buildVisibleNodeSet(domainID uint, userID uint) map[string]map[uint]bool {
	visible := map[string]map[uint]bool{
		"definition": {},
		"exercise":   {},
		"source":          {},
		"meta_quest":      {},
	}
	metaDefs, _ := h.metaDefDAO.ListByDomain(domainID)
	for _, md := range metaDefs {
		visible["definition"][md.ID] = true
	}
	metaExs, _ := h.metaExDAO.GetByDomainID(domainID)
	for _, me := range metaExs {
		visible["exercise"][me.ID] = true
	}
	sources, _ := h.sourceDAO.ListVisible(domainID, userID)
	for _, s := range sources {
		visible["source"][s.ID] = true
	}
	quests, _ := h.metaQuestDAO.ListVisible(domainID, userID)
	for _, q := range quests {
		visible["meta_quest"][q.ID] = true
	}
	return visible
}

func (h *RelationHandler) canCreateRelation(domain *models.Domain, userID uint, isAdmin bool, fromNode *resolvedNodeAccess) (bool, error) {
	switch fromNode.NodeType {
	case "definition", "exercise":
		return canEditDomain(domain, userID, isAdmin, h.permissionDAO)
	case "source", "meta_quest":
		return canMutateVisibilityScopedNode(domain, fromNode, userID, isAdmin, h.permissionDAO)
	default:
		return false, nil
	}
}

func (h *RelationHandler) resolveRelationNode(nodeType string, nodeID uint) (*resolvedNodeAccess, error) {
	switch nodeType {
	case "source", "definition", "exercise", "meta_quest":
		return h.nodeResolver.ResolveNodeAccess(nodeType, nodeID)
	default:
		return nil, errors.New("unsupported node type")
	}
}

func (h *RelationHandler) renderRelationNodeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Relation nodes must exist"})
	case err != nil && err.Error() == "unsupported node type":
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported node type"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate relation nodes"})
	}
}
