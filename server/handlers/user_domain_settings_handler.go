package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"ankidemy/server/dao"
	"ankidemy/server/services"
)

type UserDomainSettingsHandler struct {
	domainDAO     *dao.DomainDAO
	permissionDAO *dao.DomainPermissionDAO
	settingsDAO   *dao.UserDomainSettingsDAO
	queryCache    *services.QueryCacheService
}

type userDomainSettingsUpdateRequest struct {
	Timezone               *string                `json:"timezone"`
	DailyQuestLimit        *int                   `json:"dailyQuestLimit"`
	DailyQuestCooldownDays *int                   `json:"dailyQuestCooldownDays"`
	Preferences            map[string]interface{} `json:"preferences"`
}

func NewUserDomainSettingsHandler(
	domainDAO *dao.DomainDAO,
	permissionDAO *dao.DomainPermissionDAO,
	settingsDAO *dao.UserDomainSettingsDAO,
	queryCache *services.QueryCacheService,
) *UserDomainSettingsHandler {
	return &UserDomainSettingsHandler{
		domainDAO:     domainDAO,
		permissionDAO: permissionDAO,
		settingsDAO:   settingsDAO,
		queryCache:    queryCache,
	}
}

// GET /api/domains/:id/user-settings
func (h *UserDomainSettingsHandler) Get(c *gin.Context) {
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

	settings, err := h.settingsDAO.GetOrCreate(userID, uint(domainID64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load settings"})
		return
	}
	if len(settings.Preferences) == 0 {
		settings.Preferences = json.RawMessage([]byte("{}"))
	}
	c.JSON(http.StatusOK, settings)
}

// PUT /api/domains/:id/user-settings
func (h *UserDomainSettingsHandler) Update(c *gin.Context) {
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

	var req userDomainSettingsUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	settings, err := h.settingsDAO.GetOrCreate(userID, uint(domainID64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load settings"})
		return
	}

	if req.Timezone != nil {
		settings.Timezone = *req.Timezone
	}
	if req.DailyQuestLimit != nil {
		settings.DailyQuestLimit = *req.DailyQuestLimit
	}
	if req.DailyQuestCooldownDays != nil {
		settings.DailyQuestCooldownDays = *req.DailyQuestCooldownDays
	}
	if req.Preferences != nil {
		current := parsePreferences(settings.Preferences)
		merged := mergePreferences(current, req.Preferences)
		encoded, err := json.Marshal(merged)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid preferences payload"})
			return
		}
		settings.Preferences = encoded
	}

	if err := h.settingsDAO.Update(settings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save settings"})
		return
	}

	if h.queryCache != nil {
		queueTag := fmt.Sprintf("srs:queue:user:%d:domain:%d", userID, uint(domainID64))
		if err := h.queryCache.InvalidateTag(context.Background(), queueTag); err != nil {
			log.Printf("warning: failed to invalidate queue cache tag %s: %v", queueTag, err)
		}
		dueTag := fmt.Sprintf("srs:due:user:%d:domain:%d", userID, uint(domainID64))
		if err := h.queryCache.InvalidateTag(context.Background(), dueTag); err != nil {
			log.Printf("warning: failed to invalidate due cache tag %s: %v", dueTag, err)
		}
	}

	if len(settings.Preferences) == 0 {
		settings.Preferences = json.RawMessage([]byte("{}"))
	}
	c.JSON(http.StatusOK, settings)
}

func parsePreferences(raw json.RawMessage) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var prefs map[string]interface{}
	if err := json.Unmarshal(raw, &prefs); err != nil || prefs == nil {
		return map[string]interface{}{}
	}
	return prefs
}

func mergePreferences(base map[string]interface{}, patch map[string]interface{}) map[string]interface{} {
	for key, value := range patch {
		if valueMap, ok := value.(map[string]interface{}); ok {
			existingMap, exists := base[key].(map[string]interface{})
			if !exists {
				existingMap = map[string]interface{}{}
			}
			base[key] = mergePreferences(existingMap, valueMap)
			continue
		}
		base[key] = value
	}
	return base
}
