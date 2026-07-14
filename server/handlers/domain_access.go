package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"ankidemy/server/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type domainPermissionLookup interface {
	GetRole(domainID, userID uint) (string, bool, error)
}

type domainFinder interface {
	FindByID(id uint) (*models.Domain, error)
}

type domainAccessContext struct {
	Domain  *models.Domain
	UserID  uint
	IsAdmin bool
}

type domainAccessLevel string

const (
	domainAccessLevelView domainAccessLevel = "view"
	domainAccessLevelEdit domainAccessLevel = "edit"
)

type resolvedNodeAccess struct {
	NodeType   string
	NodeID     uint
	DomainID   uint
	OwnerID    uint
	Visibility string
}

type nodeAccessLookup func(nodeID uint) (*resolvedNodeAccess, error)

type nodeAccessResolver interface {
	ResolveNodeAccess(nodeType string, nodeID uint) (*resolvedNodeAccess, error)
}

type dbNodeAccessResolver struct {
	db *gorm.DB
}

func getUserContext(c *gin.Context) (uint, bool, bool) {
	userID, ok := c.Get("userID")
	if !ok {
		return 0, false, false
	}
	isAdmin := false
	if adminVal, exists := c.Get("isAdmin"); exists {
		isAdmin, _ = adminVal.(bool)
	}
	return userID.(uint), isAdmin, true
}

func canViewDomain(domain *models.Domain, userID uint, isAdmin bool, permissionDAO domainPermissionLookup) (bool, error) {
	if domain.Privacy == "public" {
		return true, nil
	}
	if isAdmin || userID == domain.OwnerID {
		return true, nil
	}
	role, exists, err := permissionDAO.GetRole(domain.ID, userID)
	if err != nil {
		return false, err
	}
	return exists && role != "", nil
}

func canEditDomain(domain *models.Domain, userID uint, isAdmin bool, permissionDAO domainPermissionLookup) (bool, error) {
	if isAdmin || userID == domain.OwnerID {
		return true, nil
	}
	role, exists, err := permissionDAO.GetRole(domain.ID, userID)
	if err != nil {
		return false, err
	}
	return exists && role == "editor", nil
}

func requireDomainViewAccess(c *gin.Context, finder domainFinder, permissionDAO domainPermissionLookup, paramName string) (*domainAccessContext, bool) {
	return requireDomainAccess(c, finder, permissionDAO, paramName, domainAccessLevelView)
}

func requireDomainEditAccess(c *gin.Context, finder domainFinder, permissionDAO domainPermissionLookup, paramName string) (*domainAccessContext, bool) {
	return requireDomainAccess(c, finder, permissionDAO, paramName, domainAccessLevelEdit)
}

func requireDomainAccess(c *gin.Context, finder domainFinder, permissionDAO domainPermissionLookup, paramName string, accessLevel domainAccessLevel) (*domainAccessContext, bool) {
	domainID, err := strconv.ParseUint(c.Param(paramName), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return nil, false
	}

	domain, err := finder.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return nil, false
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return nil, false
	}

	var allowed bool
	switch accessLevel {
	case domainAccessLevelView:
		allowed, err = canViewDomain(domain, userID, isAdmin, permissionDAO)
	case domainAccessLevelEdit:
		allowed, err = canEditDomain(domain, userID, isAdmin, permissionDAO)
	default:
		err = fmt.Errorf("unsupported domain access level: %s", accessLevel)
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

func newDBNodeAccessResolver(db *gorm.DB) nodeAccessResolver {
	return &dbNodeAccessResolver{db: db}
}

func (r *dbNodeAccessResolver) ResolveNodeAccess(nodeType string, nodeID uint) (*resolvedNodeAccess, error) {
	return resolveNodeAccessWithLookup(nodeType, nodeID, map[string]nodeAccessLookup{
		"definition": r.loadMetaDefinition,
		"exercise":   r.loadMetaExercise,
		"source":     r.loadSource,
		"meta_quest": r.loadQuest,
		"quest":      r.loadQuest,
	})
}

func resolveNodeAccessWithLookup(nodeType string, nodeID uint, lookups map[string]nodeAccessLookup) (*resolvedNodeAccess, error) {
	lookup, ok := lookups[nodeType]
	if !ok {
		return nil, fmt.Errorf("unsupported node type: %s", nodeType)
	}

	resolved, err := lookup(nodeID)
	if err != nil {
		return nil, err
	}

	clone := *resolved
	clone.NodeType = nodeType
	clone.NodeID = nodeID
	return &clone, nil
}

func (r *dbNodeAccessResolver) loadMetaDefinition(nodeID uint) (*resolvedNodeAccess, error) {
	var meta models.MetaDefinition
	if err := r.db.Select("domain_id", "owner_id").First(&meta, nodeID).Error; err != nil {
		return nil, err
	}
	return &resolvedNodeAccess{DomainID: meta.DomainID, OwnerID: meta.OwnerID}, nil
}

func (r *dbNodeAccessResolver) loadMetaExercise(nodeID uint) (*resolvedNodeAccess, error) {
	var meta models.MetaExercise
	if err := r.db.Select("domain_id", "owner_id").First(&meta, nodeID).Error; err != nil {
		return nil, err
	}
	return &resolvedNodeAccess{DomainID: meta.DomainID, OwnerID: meta.OwnerID}, nil
}

func (r *dbNodeAccessResolver) loadSource(nodeID uint) (*resolvedNodeAccess, error) {
	var source models.Source
	if err := r.db.Select("domain_id", "owner_id", "visibility").First(&source, nodeID).Error; err != nil {
		return nil, err
	}
	return &resolvedNodeAccess{
		DomainID:   source.DomainID,
		OwnerID:    source.OwnerID,
		Visibility: source.Visibility,
	}, nil
}

func (r *dbNodeAccessResolver) loadQuest(nodeID uint) (*resolvedNodeAccess, error) {
	var quest models.MetaQuest
	if err := r.db.Select("domain_id", "owner_id", "visibility").First(&quest, nodeID).Error; err != nil {
		return nil, err
	}
	return &resolvedNodeAccess{
		DomainID:   quest.DomainID,
		OwnerID:    quest.OwnerID,
		Visibility: quest.Visibility,
	}, nil
}

func canMutateVisibilityScopedNode(domain *models.Domain, node *resolvedNodeAccess, userID uint, isAdmin bool, permissionDAO domainPermissionLookup) (bool, error) {
	if isAdmin {
		return true, nil
	}

	switch strings.TrimSpace(node.Visibility) {
	case "", "private":
		return node.OwnerID == userID, nil
	case "domain":
		return canEditDomain(domain, userID, isAdmin, permissionDAO)
	default:
		return false, fmt.Errorf("unsupported node visibility: %s", node.Visibility)
	}
}

func canCreateVisibilityScopedNode(domain *models.Domain, visibility string, userID uint, isAdmin bool, permissionDAO domainPermissionLookup) (bool, error) {
	trimmed := strings.TrimSpace(visibility)
	switch trimmed {
	case "", "private":
		return true, nil
	case "domain":
		return canEditDomain(domain, userID, isAdmin, permissionDAO)
	default:
		return false, fmt.Errorf("unsupported node visibility: %s", visibility)
	}
}
