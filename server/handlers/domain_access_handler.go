package handlers

import (
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
	"myapp/server/middleware"
	"myapp/server/models"
	"myapp/server/services"
)

type DomainAccessHandler struct {
	domainDAO             *dao.DomainDAO
	permissionDAO         *dao.DomainPermissionDAO
	inviteDAO             *dao.DomainInviteDAO
	userDAO               *dao.UserDAO
	progressDAO           *dao.ProgressDAO
	notificationReadModel *services.NotificationReadModelService
}

func NewDomainAccessHandler(
	domainDAO *dao.DomainDAO,
	permissionDAO *dao.DomainPermissionDAO,
	inviteDAO *dao.DomainInviteDAO,
	userDAO *dao.UserDAO,
	progressDAO *dao.ProgressDAO,
	notificationReadModel *services.NotificationReadModelService,
) *DomainAccessHandler {
	return &DomainAccessHandler{
		domainDAO:             domainDAO,
		permissionDAO:         permissionDAO,
		inviteDAO:             inviteDAO,
		userDAO:               userDAO,
		progressDAO:           progressDAO,
		notificationReadModel: notificationReadModel,
	}
}

// GET /api/domains/shared
func (h *DomainAccessHandler) GetSharedDomains(c *gin.Context) {
	userID, _, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	perms, err := h.permissionDAO.ListPermissionsForUser(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve shared domains"})
		return
	}

	domainIDs := make([]uint, 0, len(perms))
	roleByDomain := make(map[uint]string, len(perms))
	for _, perm := range perms {
		domainIDs = append(domainIDs, perm.DomainID)
		roleByDomain[perm.DomainID] = perm.Role
	}

	domains, err := h.domainDAO.GetByIDsWithStats(domainIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve shared domain details"})
		return
	}

	type response struct {
		dao.DomainWithStats
		PermissionRole string `json:"permissionRole"`
	}
	results := make([]response, 0, len(domains))
	for _, domain := range domains {
		results = append(results, response{
			DomainWithStats: domain,
			PermissionRole:  roleByDomain[domain.ID],
		})
	}

	c.JSON(http.StatusOK, results)
}

// GET /api/domains/accessible
func (h *DomainAccessHandler) GetAccessibleDomains(c *gin.Context) {
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	domainsByID := make(map[uint]models.Domain)
	addDomains := func(domains []models.Domain) {
		for _, domain := range domains {
			domainsByID[domain.ID] = domain
		}
	}

	if isAdmin {
		all, err := h.domainDAO.GetAll()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domains"})
			return
		}
		addDomains(all)
	} else {
		owned, err := h.domainDAO.GetByOwnerID(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve owned domains"})
			return
		}
		addDomains(owned)

		publicDomains, err := h.domainDAO.GetPublicDomains()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve public domains"})
			return
		}
		addDomains(publicDomains)

		perms, err := h.permissionDAO.ListPermissionsForUser(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve shared domains"})
			return
		}
		sharedIDs := make([]uint, 0, len(perms))
		for _, perm := range perms {
			sharedIDs = append(sharedIDs, perm.DomainID)
		}
		if len(sharedIDs) > 0 {
			sharedDomains, err := h.domainDAO.GetByIDs(sharedIDs)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve shared domains"})
				return
			}
			addDomains(sharedDomains)
		}

		progress, err := h.progressDAO.GetUserDomainProgress(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve enrolled domains"})
			return
		}
		enrolledIDs := make([]uint, 0, len(progress))
		for _, record := range progress {
			enrolledIDs = append(enrolledIDs, record.DomainID)
		}
		if len(enrolledIDs) > 0 {
			enrolledDomains, err := h.domainDAO.GetByIDs(enrolledIDs)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve enrolled domains"})
				return
			}
			addDomains(enrolledDomains)
		}
	}

	type response struct {
		ID            uint   `json:"id"`
		DomainUID     string `json:"domainUid"`
		Name          string `json:"name"`
		Privacy       string `json:"privacy"`
		OwnerID       uint   `json:"ownerId"`
		OwnerUsername string `json:"ownerUsername"`
	}

	results := make([]response, 0, len(domainsByID))
	for _, domain := range domainsByID {
		if domain.DomainUID == nil || *domain.DomainUID == "" {
			continue
		}
		ownerName := ""
		if owner, err := h.userDAO.FindUserByID(domain.OwnerID); err == nil {
			ownerName = owner.Username
		}
		results = append(results, response{
			ID:            domain.ID,
			DomainUID:     *domain.DomainUID,
			Name:          domain.Name,
			Privacy:       domain.Privacy,
			OwnerID:       domain.OwnerID,
			OwnerUsername: ownerName,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].OwnerUsername == results[j].OwnerUsername {
			return results[i].Name < results[j].Name
		}
		return results[i].OwnerUsername < results[j].OwnerUsername
	})

	c.JSON(http.StatusOK, results)
}

// POST /api/domains/:id/invites
func (h *DomainAccessHandler) CreateInvite(c *gin.Context) {
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
	if userID != domain.OwnerID && !isAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	var req struct {
		Username string `json:"username" binding:"required"`
		Role     string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := strings.ToLower(strings.TrimSpace(req.Role))
	if role != "editor" && role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Role must be editor or viewer"})
		return
	}

	invitee, err := h.userDAO.FindUserByUsername(strings.TrimSpace(req.Username))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	if invitee.ID == domain.OwnerID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Owner already has access"})
		return
	}

	if _, exists, err := h.permissionDAO.GetRole(domain.ID, invitee.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check permissions"})
		return
	} else if exists {
		c.JSON(http.StatusConflict, gin.H{"error": "User already has access"})
		return
	}

	pending, err := h.inviteDAO.FindPendingInvite(domain.ID, invitee.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check invites"})
		return
	}
	if pending != nil {
		pending.Role = role
		pending.InvitedBy = userID
		if err := h.inviteDAO.Update(pending); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update invite"})
			return
		}
		h.enqueueNotificationSummaryInvalidate(invitee.ID)
		c.JSON(http.StatusOK, pending)
		return
	}

	invite := &models.DomainInvite{
		DomainID:      domain.ID,
		InvitedUserID: invitee.ID,
		InvitedBy:     userID,
		Role:          role,
		Status:        "pending",
	}
	if err := h.inviteDAO.Create(invite); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create invite"})
		return
	}

	h.enqueueNotificationSummaryInvalidate(invitee.ID)
	c.JSON(http.StatusCreated, invite)
}

// GET /api/domains/:id/permissions
func (h *DomainAccessHandler) ListPermissions(c *gin.Context) {
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
	if userID != domain.OwnerID && !isAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}

	perms, err := h.permissionDAO.ListPermissions(domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve permissions"})
		return
	}

	type permissionResponse struct {
		UserID    uint      `json:"userId"`
		Username  string    `json:"username"`
		Role      string    `json:"role"`
		CreatedAt time.Time `json:"createdAt"`
	}

	permissions := make([]permissionResponse, 0, len(perms))
	for _, perm := range perms {
		user, err := h.userDAO.FindUserByID(perm.UserID)
		if err != nil {
			continue
		}
		permissions = append(permissions, permissionResponse{
			UserID:    perm.UserID,
			Username:  user.Username,
			Role:      perm.Role,
			CreatedAt: perm.CreatedAt,
		})
	}

	owner, _ := h.userDAO.FindUserByID(domain.OwnerID)
	c.JSON(http.StatusOK, gin.H{
		"owner": gin.H{
			"userId":   domain.OwnerID,
			"username": owner.Username,
		},
		"permissions": permissions,
	})
}

// DELETE /api/domains/:id/permissions/:userId
func (h *DomainAccessHandler) RemovePermission(c *gin.Context) {
	domainID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}
	targetUserID, err := strconv.ParseUint(c.Param("userId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
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
	if userID != domain.OwnerID && !isAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}
	if targetUserID == uint64(domain.OwnerID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot remove the owner"})
		return
	}

	if err := h.permissionDAO.RemovePermission(domain.ID, uint(targetUserID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove permission"})
		return
	}

	h.enqueueNotificationSummaryInvalidate(uint(targetUserID))
	c.JSON(http.StatusOK, gin.H{"message": "Permission removed"})
}

// GET /api/domain-invites
func (h *DomainAccessHandler) ListMyInvites(c *gin.Context) {
	userID, _, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	invites, err := h.inviteDAO.ListPendingForUser(userID, middleware.GetRequestID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve invites"})
		return
	}

	type inviteResponse struct {
		ID                uint      `json:"id"`
		DomainID          uint      `json:"domainId"`
		DomainName        string    `json:"domainName"`
		InvitedBy         uint      `json:"invitedBy"`
		InvitedByUsername string    `json:"invitedByUsername"`
		Role              string    `json:"role"`
		Status            string    `json:"status"`
		CreatedAt         time.Time `json:"createdAt"`
	}

	results := make([]inviteResponse, 0, len(invites))
	for _, invite := range invites {
		domainName := ""
		if invite.Domain != nil {
			domainName = invite.Domain.Name
		}
		inviterName := ""
		if invite.Inviter != nil {
			inviterName = invite.Inviter.Username
		}
		results = append(results, inviteResponse{
			ID:                invite.ID,
			DomainID:          invite.DomainID,
			DomainName:        domainName,
			InvitedBy:         invite.InvitedBy,
			InvitedByUsername: inviterName,
			Role:              invite.Role,
			Status:            invite.Status,
			CreatedAt:         invite.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, results)
}

// POST /api/domain-invites/:id/accept
func (h *DomainAccessHandler) AcceptInvite(c *gin.Context) {
	inviteID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invite ID"})
		return
	}

	userID, _, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	invite, err := h.inviteDAO.FindByID(uint(inviteID))
	if err != nil || invite == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invite not found"})
		return
	}
	if invite.InvitedUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}
	if invite.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invite already handled"})
		return
	}

	if err := h.permissionDAO.UpsertPermission(invite.DomainID, userID, invite.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to grant permission"})
		return
	}

	now := time.Now()
	invite.Status = "accepted"
	invite.RespondedAt = &now
	if err := h.inviteDAO.Update(invite); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update invite"})
		return
	}

	h.enqueueNotificationSummaryInvalidate(userID)
	c.JSON(http.StatusOK, gin.H{"message": "Invite accepted"})
}

// POST /api/domain-invites/:id/decline
func (h *DomainAccessHandler) DeclineInvite(c *gin.Context) {
	inviteID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invite ID"})
		return
	}

	userID, _, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	invite, err := h.inviteDAO.FindByID(uint(inviteID))
	if err != nil || invite == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invite not found"})
		return
	}
	if invite.InvitedUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not allowed"})
		return
	}
	if invite.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invite already handled"})
		return
	}

	now := time.Now()
	invite.Status = "declined"
	invite.RespondedAt = &now
	if err := h.inviteDAO.Update(invite); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update invite"})
		return
	}

	h.enqueueNotificationSummaryInvalidate(userID)
	c.JSON(http.StatusOK, gin.H{"message": "Invite declined"})
}

func (h *DomainAccessHandler) enqueueNotificationSummaryInvalidate(userID uint) {
	if h.notificationReadModel == nil {
		return
	}
	if err := h.notificationReadModel.EnqueueSummaryInvalidate(userID); err != nil {
		log.Printf("warning: failed to enqueue notification summary invalidation for user %d: %v", userID, err)
	}
}
