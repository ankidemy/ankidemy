package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"ankidemy/server/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ContentManagedReadOnly prevents HTTP handlers from becoming a second content
// writer for an attached provider domain. Learning/progress APIs are outside
// this route classifier and continue to work normally.
func ContentManagedReadOnly(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		domainID, protected := managedContentMutationDomain(c, db)
		if !protected || domainID == 0 {
			c.Next()
			return
		}
		var count int64
		if err := db.Model(&models.ContentBinding{}).
			Where("domain_id = ? AND authorization_state = ?", domainID, "attached").
			Count(&count).Error; err != nil || count == 0 {
			c.Next()
			return
		}
		if managedMutationIsLocalOnly(c) {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error":   "This domain is managed by an attached content provider; edit it in the provider or detach it first.",
			"managed": true,
		})
	}
}

// managedMutationIsLocalOnly permits fields that have no provider
// representation. Content/meta fields remain protected, while layout and
// Ankidemy access/user-state fields stay editable.
func managedMutationIsLocalOnly(c *gin.Context) bool {
	if c.Request.Method != http.MethodPut && c.Request.Method != http.MethodPatch {
		return false
	}
	pattern := c.FullPath()
	allowed := map[string]bool{}
	switch pattern {
	case "/api/meta-definitions/:id", "/api/meta-exercises/:id":
		allowed = map[string]bool{"xPosition": true, "yPosition": true}
	case "/api/sources/:id":
		allowed = map[string]bool{"xPosition": true, "yPosition": true, "visibility": true, "bibtexKey": true, "filePath": true}
	case "/api/quests/:id":
		allowed = map[string]bool{"xPosition": true, "yPosition": true, "visibility": true, "active": true}
	default:
		return false
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return false
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) != nil || len(fields) == 0 {
		return false
	}
	for field := range fields {
		if !allowed[field] {
			return false
		}
	}
	return true
}

func managedContentMutationDomain(c *gin.Context, db *gorm.DB) (uint, bool) {
	pattern := c.FullPath()
	if pattern == "" {
		pattern = c.Request.URL.Path
	}
	if pattern == "/api/media/upload" {
		if err := c.Request.ParseMultipartForm(21 << 20); err != nil {
			return 0, false
		}
		id, err := strconv.ParseUint(c.Request.FormValue("domainId"), 10, 32)
		return uint(id), err == nil
	}

	if strings.HasPrefix(pattern, "/api/domains/:id") {
		if !protectedDomainRoute(pattern, c.Request.Method) {
			return 0, false
		}
		id, err := strconv.ParseUint(c.Param("id"), 10, 32)
		return uint(id), err == nil
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return 0, false
	}
	var domainID uint
	var query *gorm.DB
	switch {
	case strings.HasPrefix(pattern, "/api/definitions/:id"):
		query = db.Model(&models.Definition{}).Select("domain_id").Where("id = ?", id).Scan(&domainID)
	case strings.HasPrefix(pattern, "/api/exercises/:id") && !strings.HasSuffix(pattern, "/verify"):
		query = db.Model(&models.Exercise{}).Select("domain_id").Where("id = ?", id).Scan(&domainID)
	case strings.HasPrefix(pattern, "/api/meta-definitions/:id"):
		query = db.Model(&models.MetaDefinition{}).Select("domain_id").Where("id = ?", id).Scan(&domainID)
	case strings.HasPrefix(pattern, "/api/meta-exercises/:id") && !strings.HasSuffix(pattern, "/record-outcome"):
		query = db.Model(&models.MetaExercise{}).Select("domain_id").Where("id = ?", id).Scan(&domainID)
	case strings.HasPrefix(pattern, "/api/sources/:id"):
		query = db.Model(&models.Source{}).Select("domain_id").Where("id = ?", id).Scan(&domainID)
	case strings.HasPrefix(pattern, "/api/quests/:id"):
		query = db.Model(&models.MetaQuest{}).Select("domain_id").Where("id = ?", id).Scan(&domainID)
	case strings.HasPrefix(pattern, "/api/relations/:id"):
		query = db.Model(&models.NodeRelation{}).Select("domain_id").Where("id = ?", id).Scan(&domainID)
	default:
		return 0, false
	}
	return domainID, query != nil && query.Error == nil && domainID != 0
}

func protectedDomainRoute(pattern, method string) bool {
	// Layout is Ankidemy-owned state even when node content is provider-owned.
	// These routes only persist visual coordinates and must remain writable.
	if pattern == "/api/domains/:id/graph/positions" ||
		pattern == "/api/domains/:id/external-prerequisites/positions" ||
		pattern == "/api/domains/:id/groups/positions" {
		return false
	}
	if pattern == "/api/domains/:id" || pattern == "/api/domains/:id/purge" || pattern == "/api/domains/:id/restore" {
		return true
	}
	if pattern == "/api/domains/:id/import" || pattern == "/api/domains/:id/import-graph" || pattern == "/api/domains/:id/import-backup" {
		return true
	}
	for _, segment := range []string{
		"/definitions", "/exercises", "/meta-definitions", "/meta-exercises",
		"/sources", "/quests", "/relations", "/external-prerequisites",
	} {
		if strings.HasPrefix(pattern, "/api/domains/:id"+segment) {
			return method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch || method == http.MethodDelete
		}
	}
	return false
}
