package handlers

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"ankidemy/server/services"
	"github.com/gin-gonic/gin"
	"mime/multipart"
)

// DomainHandler handles domain-related HTTP requests
type DomainHandler struct {
	domainDAO             *dao.DomainDAO
	progressDAO           *dao.ProgressDAO
	importService         *services.ImportService
	permissionDAO         *dao.DomainPermissionDAO
	notificationReadModel *services.NotificationReadModelService
}

// NewDomainHandler creates a new DomainHandler
func NewDomainHandler(
	domainDAO *dao.DomainDAO,
	progressDAO *dao.ProgressDAO,
	importService *services.ImportService,
	permissionDAO *dao.DomainPermissionDAO,
	notificationReadModel *services.NotificationReadModelService,
) *DomainHandler {
	return &DomainHandler{
		domainDAO:             domainDAO,
		progressDAO:           progressDAO,
		importService:         importService,
		permissionDAO:         permissionDAO,
		notificationReadModel: notificationReadModel,
	}
}

// CreateDomainRequest represents the request for creating a domain with optional import
type CreateDomainRequest struct {
	Name        string               `json:"name" binding:"required"`
	Privacy     string               `json:"privacy" binding:"required"`
	Description string               `json:"description"`
	ImportData  *services.ImportData `json:"importData,omitempty"`
}

type CopyDomainRequest struct {
	Name        string `json:"name"`
	Privacy     string `json:"privacy"`
	Description string `json:"description"`
}

// GetDomains returns all domains (without stats)
func (h *DomainHandler) GetDomains(c *gin.Context) {
	domains, err := h.domainDAO.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domains"})
		return
	}
	c.JSON(http.StatusOK, domains)
}

// GetPublicDomains returns all public domains with stats
func (h *DomainHandler) GetPublicDomains(c *gin.Context) {
	domains, err := h.domainDAO.GetPublicDomainsWithStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve public domains"})
		return
	}
	c.JSON(http.StatusOK, domains)
}

// GetMyDomains returns domains owned by the current user with stats
func (h *DomainHandler) GetMyDomains(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domains, err := h.domainDAO.GetByOwnerIDWithStats(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve your domains"})
		return
	}
	c.JSON(http.StatusOK, domains)
}

// GetEnrolledDomains returns domains the user is enrolled in, with stats
func (h *DomainHandler) GetEnrolledDomains(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Get the progress records
	progress, err := h.progressDAO.GetUserDomainProgress(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve enrolled domains"})
		return
	}

	// Collect domain IDs from progress
	domainIDs := make([]uint, 0, len(progress))
	for _, p := range progress {
		domainIDs = append(domainIDs, p.DomainID)
	}

	// Get the actual domain objects with their stats
	domains, err := h.domainDAO.GetByIDsWithStats(domainIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve domain details"})
		return
	}

	// Filter out domains owned by the user
	filtered := make([]dao.DomainWithStats, 0, len(domains))
	for _, d := range domains {
		if d.OwnerID != userID.(uint) {
			filtered = append(filtered, d)
		}
	}

	c.JSON(http.StatusOK, filtered)
}

// GetDomain returns a domain by ID with stats
func (h *DomainHandler) GetDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	domainWithStats, err := h.domainDAO.FindByIDWithStats(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canView, err := canViewDomain(&domainWithStats.Domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
		return
	}

	resp := struct {
		dao.DomainWithStats
		PermissionRole string `json:"permissionRole,omitempty"`
	}{
		DomainWithStats: *domainWithStats,
	}
	if userID == domainWithStats.OwnerID {
		resp.PermissionRole = "owner"
	} else if role, exists, _ := h.permissionDAO.GetRole(domainWithStats.ID, userID); exists {
		resp.PermissionRole = role
	}

	c.JSON(http.StatusOK, resp)
}

// CreateDomain creates a new domain and returns it with stats
// Now supports optional import data in the request
func (h *DomainHandler) CreateDomain(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	var request CreateDomainRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var domain *models.Domain
	var err error

	// Check if import data is provided
	if request.ImportData != nil {
		// Create domain with import data using ImportService
		domain, err = h.importService.CreateDomainWithImport(
			userID.(uint),
			request.Name,
			request.Privacy,
			request.Description,
			request.ImportData,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create domain with import: " + err.Error()})
			return
		}
	} else {
		// Create regular domain without import
		domain = &models.Domain{
			Name:        request.Name,
			Privacy:     request.Privacy,
			Description: request.Description,
			OwnerID:     userID.(uint),
		}

		// Create domain
		if err := h.domainDAO.Create(domain); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create domain"})
			return
		}

		// Enroll the owner in the domain
		if err := h.progressDAO.EnrollUserInDomain(userID.(uint), domain.ID); err != nil {
			// Just log the error, don't fail the request
		}
	}

	if domain.DomainUID == nil || *domain.DomainUID == "" {
		if uid, err := services.GenerateDomainUID(userID.(uint), domain.ID); err == nil {
			domain.DomainUID = &uid
			_ = h.domainDAO.Update(domain)
		}
	}

	// Return the newly created domain with its initial stats
	domainWithStats, err := h.domainDAO.FindByIDWithStats(domain.ID)
	if err != nil {
		h.enqueueNotificationSummaryInvalidate(userID.(uint))
		c.JSON(http.StatusCreated, domain) // Fallback to returning without stats
		return
	}

	h.enqueueNotificationSummaryInvalidate(userID.(uint))
	c.JSON(http.StatusCreated, domainWithStats)
}

// ImportToDomain imports data to an existing domain
func (h *DomainHandler) ImportToDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get existing domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Require edit access (owner, admin, or editor)
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
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to import to this domain"})
		return
	}

	// Bind import data
	var importData services.ImportData
	if err := c.ShouldBindJSON(&importData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid import data: " + err.Error()})
		return
	}

	strategy := services.DuplicateStrategyUpdate
	strategyParam := strings.ToLower(strings.TrimSpace(c.Query("onDuplicate")))
	if strategyParam == string(services.DuplicateStrategyRename) {
		strategy = services.DuplicateStrategyRename
	} else if strategyParam == string(services.DuplicateStrategyUpdate) {
		strategy = services.DuplicateStrategyUpdate
	}

	// Import data to domain
	if err := h.importService.ImportToDomain(uint(id), &importData, strategy); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to import data: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Data imported successfully"})
}

// ExportImportData exports a domain in ImportService format (definitions + metaExercises)
func (h *DomainHandler) ExportImportData(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
		return
	}

	data, err := h.importService.ExportDomain(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to export domain: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, data)
}

// ExportBackup exports a full domain backup as a zip file (JSON + media + optional SRS progress).
func (h *DomainHandler) ExportBackup(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to export this backup"})
		return
	}

	backup, err := h.importService.ExportDomainBackup(domain.ID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to export backup: " + err.Error()})
		return
	}

	payload, err := json.MarshalIndent(backup, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encode backup JSON"})
		return
	}

	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)

	jsonWriter, err := zw.Create("backup.json")
	if err != nil {
		_ = zw.Close()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create backup archive"})
		return
	}
	if _, err := jsonWriter.Write(payload); err != nil {
		_ = zw.Close()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write backup JSON"})
		return
	}

	mediaPaths := services.CollectImportMediaPaths(&backup.Data)
	for _, mediaPath := range mediaPaths {
		filePath, err := services.MediaURLToPath(mediaPath)
		if err != nil || filePath == "" {
			continue
		}
		file, err := os.Open(filePath)
		if err != nil {
			continue
		}
		zipName := strings.TrimPrefix(filepath.ToSlash(filePath), "/")
		writer, err := zw.Create(zipName)
		if err == nil {
			_, _ = io.Copy(writer, file)
		}
		_ = file.Close()
	}

	if err := zw.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize backup archive"})
		return
	}

	timestamp := time.Now().UTC().Format("20060102-150405")
	filename := fmt.Sprintf("%s-backup-%s.zip", sanitizeFilename(domain.Name), timestamp)
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// ImportBackup imports a full domain backup from a zip archive.
func (h *DomainHandler) ImportBackup(c *gin.Context) {
	access, ok := requireDomainEditAccess(c, h.domainDAO, h.permissionDAO, "id")
	if !ok {
		return
	}

	const multipartOverheadAllowance int64 = 1 << 20
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, services.BackupArchiveMaxCompressedSize+multipartOverheadAllowance)
	fileHeader, err := c.FormFile("file")
	if err != nil {
		if isBackupImportTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Backup archive exceeds the upload size limit"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	if fileHeader.Size > services.BackupArchiveMaxCompressedSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Backup archive exceeds the upload size limit"})
		return
	}

	archivePath, err := copyUploadedBackupToTemp(fileHeader, services.BackupArchiveMaxCompressedSize)
	if err != nil {
		if isBackupImportTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "Backup archive exceeds the upload size limit"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read uploaded file"})
		return
	}
	defer os.Remove(archivePath)

	archive, err := zip.OpenReader(archivePath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid backup archive"})
		return
	}
	defer archive.Close()

	validated, err := services.ValidateBackupArchive(&archive.Reader)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	preparedMedia, err := prepareBackupMediaImport(validated, access.Domain)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to restore media files: " + err.Error()})
		return
	}

	cleanupPreparedMedia := true
	defer func() {
		if cleanupPreparedMedia {
			preparedMedia.Cleanup()
		}
	}()

	if err := preparedMedia.Promote(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restore media files"})
		return
	}

	importData := validated.ImportData
	if validated.Backup != nil {
		importData = &validated.Backup.Data
	}

	if err := h.importService.ImportToDomain(access.Domain.ID, importData, services.DuplicateStrategyUpdate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to import backup: " + err.Error()})
		return
	}

	if validated.Backup != nil && validated.Backup.UserState != nil {
		if err := h.importService.ImportUserState(access.Domain.ID, access.UserID, validated.Backup.UserState); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to import user state: " + err.Error()})
			return
		}
	} else if validated.Backup != nil && validated.Backup.SRS != nil && validated.Backup.SRS.Username != "" {
		userDAO := dao.NewUserDAO(h.domainDAO.DB())
		currentUser, err := userDAO.FindUserByID(access.UserID)
		if err == nil && currentUser.Username == validated.Backup.SRS.Username {
			if err := h.importService.ImportDomainSRSProgress(access.Domain.ID, access.UserID, validated.Backup.SRS.Progress); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to import SRS progress: " + err.Error()})
				return
			}
		}
	}

	cleanupPreparedMedia = false
	c.JSON(http.StatusOK, gin.H{"message": "Backup imported successfully"})
}

// CopyDomain creates a new domain by copying content from an existing domain.
func (h *DomainHandler) CopyDomain(c *gin.Context) {
	sourceID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	sourceDomain, err := h.domainDAO.FindByID(uint(sourceID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	canView, err := canViewDomain(sourceDomain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
		return
	}

	var req CopyDomainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = sourceDomain.Name + " (Copy)"
	}
	privacy := strings.TrimSpace(req.Privacy)
	if privacy == "" {
		privacy = "private"
	}
	if privacy != "public" && privacy != "private" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "privacy must be public or private"})
		return
	}
	description := strings.TrimSpace(req.Description)
	if description == "" {
		description = sourceDomain.Description
	}

	data, err := h.importService.ExportDomain(uint(sourceID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to export domain"})
		return
	}

	newDomain, err := h.importService.CreateDomainWithImport(userID, name, privacy, description, data)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to copy domain"})
		return
	}

	if newDomain.DomainUID == nil || *newDomain.DomainUID == "" {
		uid, err := services.GenerateDomainUID(userID, newDomain.ID)
		if err == nil {
			newDomain.DomainUID = &uid
		}
	}
	newDomain.CopiedFromDomainID = &sourceDomain.ID
	sourceOwner := sourceDomain.OwnerID
	newDomain.CopiedFromUserID = &sourceOwner
	_ = h.domainDAO.Update(newDomain)

	if err := h.copyUserProgress(userID, sourceDomain.ID, newDomain.ID); err != nil {
		// Progress copy is best-effort; the domain copy itself is already created.
	}

	domainWithStats, err := h.domainDAO.FindByIDWithStats(newDomain.ID)
	if err != nil {
		h.enqueueNotificationSummaryInvalidate(userID)
		c.JSON(http.StatusCreated, newDomain)
		return
	}

	h.enqueueNotificationSummaryInvalidate(userID)
	c.JSON(http.StatusCreated, domainWithStats)
}

func (h *DomainHandler) copyUserProgress(userID, sourceDomainID, newDomainID uint) error {
	db := h.domainDAO.DB()

	type nodeRow struct {
		ID   uint
		Code string
	}

	var sourceDefs []nodeRow
	var newDefs []nodeRow
	if err := db.Model(&models.MetaDefinition{}).
		Select("id, code").
		Where("domain_id = ?", sourceDomainID).
		Find(&sourceDefs).Error; err != nil {
		return err
	}
	if err := db.Model(&models.MetaDefinition{}).
		Select("id, code").
		Where("domain_id = ?", newDomainID).
		Find(&newDefs).Error; err != nil {
		return err
	}

	sourceDefCodeByID := make(map[uint]string, len(sourceDefs))
	newDefIDByCode := make(map[string]uint, len(newDefs))
	for _, row := range sourceDefs {
		sourceDefCodeByID[row.ID] = row.Code
	}
	for _, row := range newDefs {
		newDefIDByCode[row.Code] = row.ID
	}

	var sourceExercises []nodeRow
	var newExercises []nodeRow
	if err := db.Model(&models.MetaExercise{}).
		Select("id, code").
		Where("domain_id = ?", sourceDomainID).
		Find(&sourceExercises).Error; err != nil {
		return err
	}
	if err := db.Model(&models.MetaExercise{}).
		Select("id, code").
		Where("domain_id = ?", newDomainID).
		Find(&newExercises).Error; err != nil {
		return err
	}

	sourceExerciseCodeByID := make(map[uint]string, len(sourceExercises))
	newExerciseIDByCode := make(map[string]uint, len(newExercises))
	for _, row := range sourceExercises {
		sourceExerciseCodeByID[row.ID] = row.Code
	}
	for _, row := range newExercises {
		newExerciseIDByCode[row.Code] = row.ID
	}

	defIDs := make([]uint, 0, len(sourceDefs))
	for _, row := range sourceDefs {
		defIDs = append(defIDs, row.ID)
	}
	exIDs := make([]uint, 0, len(sourceExercises))
	for _, row := range sourceExercises {
		exIDs = append(exIDs, row.ID)
	}

	var progresses []models.UserNodeProgress
	if len(defIDs) > 0 {
		if err := db.Where("user_id = ? AND node_type = ? AND node_id IN ?", userID, "definition", defIDs).
			Find(&progresses).Error; err != nil {
			return err
		}
	}
	if len(exIDs) > 0 {
		var exProgress []models.UserNodeProgress
		if err := db.Where("user_id = ? AND node_type = ? AND node_id IN ?", userID, "exercise", exIDs).
			Find(&exProgress).Error; err != nil {
			return err
		}
		progresses = append(progresses, exProgress...)
	}

	for _, prog := range progresses {
		newNodeID := uint(0)
		switch prog.NodeType {
		case "definition":
			code := sourceDefCodeByID[prog.NodeID]
			newNodeID = newDefIDByCode[code]
		case "exercise":
			code := sourceExerciseCodeByID[prog.NodeID]
			newNodeID = newExerciseIDByCode[code]
		}
		if newNodeID == 0 {
			continue
		}
		clone := prog
		clone.ID = 0
		clone.NodeID = newNodeID
		if err := db.Create(&clone).Error; err != nil {
			return err
		}
	}

	return nil
}

// UpdateDomain updates a domain and returns it with stats
func (h *DomainHandler) UpdateDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get existing domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to update this domain"})
			return
		}
	}

	// Bind update data
	var updateData struct {
		Name        string `json:"name"`
		Privacy     string `json:"privacy"`
		Description string `json:"description"`
	}

	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields if provided
	if updateData.Name != "" {
		domain.Name = updateData.Name
	}
	if updateData.Privacy != "" {
		domain.Privacy = updateData.Privacy
	}
	if updateData.Description != "" {
		domain.Description = updateData.Description
	}

	// Update domain
	if err := h.domainDAO.Update(domain); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update domain"})
		return
	}

	// Return the updated domain with its stats
	domainWithStats, err := h.domainDAO.FindByIDWithStats(domain.ID)
	if err != nil {
		c.JSON(http.StatusOK, domain) // Fallback to returning without stats
		return
	}

	c.JSON(http.StatusOK, domainWithStats)
}

// DeleteDomain deletes a domain
func (h *DomainHandler) DeleteDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get existing domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the user is the owner
	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to delete this domain"})
			return
		}
	}

	// Delete domain
	if err := h.domainDAO.Delete(domain.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete domain"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Domain deleted successfully"})
}

// GetMyArchivedDomains returns archived (soft-deleted) domains owned by the current user with stats
func (h *DomainHandler) GetMyArchivedDomains(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	domains, err := h.domainDAO.GetArchivedByOwnerIDWithStats(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve archived domains"})
		return
	}
	c.JSON(http.StatusOK, domains)
}

func randomFilename(length int) string {
	if length <= 0 {
		length = 16
	}
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%x", b)
	}
	return hex.EncodeToString(b)
}

func sanitizeFilename(input string) string {
	if input == "" {
		return "domain"
	}
	var b strings.Builder
	for i := 0; i < len(input); i++ {
		ch := input[i]
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') {
			b.WriteByte(ch)
		} else {
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), "_")
	if out == "" {
		return "domain"
	}
	return out
}

type preparedBackupMediaImport struct {
	stageDir string
	mediaDir string
	files    []preparedBackupMediaFile
}

type preparedBackupMediaFile struct {
	stagedPath string
	finalPath  string
}

func prepareBackupMediaImport(validated *services.ValidatedBackupArchive, domain *models.Domain) (*preparedBackupMediaImport, error) {
	prepared := &preparedBackupMediaImport{}
	if validated == nil || domain == nil {
		return prepared, nil
	}

	visibility := "public"
	if domain.Privacy != "public" {
		visibility = "private"
	}
	domainFolder := services.BuildDomainFolder(domain.ID, domain.Name)
	prepared.mediaDir = services.BuildMediaDir(domain.OwnerID, visibility, domainFolder)
	mediaMap := make(map[string]string)
	usedNames := make(map[string]bool)

	rewrite := func(oldPath string) (string, error) {
		trimmed := strings.TrimSpace(oldPath)
		if trimmed == "" || strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
			return trimmed, nil
		}
		if mapped, ok := mediaMap[trimmed]; ok {
			return mapped, nil
		}

		sourcePath, err := services.MediaURLToPath(trimmed)
		if err != nil || sourcePath == "" {
			return trimmed, nil
		}
		archiveKey := strings.TrimPrefix(filepath.ToSlash(sourcePath), "/")
		zf, ok := validated.FilesByName[archiveKey]
		if !ok {
			return "", fmt.Errorf("backup archive is missing media file %q", archiveKey)
		}

		filename, stagedPath, err := extractBackupMediaEntry(prepared, zf, archiveKey, usedNames)
		if err != nil {
			return "", err
		}

		finalPath := filepath.Join(prepared.mediaDir, filename)
		prepared.files = append(prepared.files, preparedBackupMediaFile{
			stagedPath: stagedPath,
			finalPath:  finalPath,
		})

		newPath := services.BuildMediaURL(domain.OwnerID, visibility, domainFolder, filename)
		mediaMap[trimmed] = newPath
		return newPath, nil
	}

	if validated.Backup != nil {
		if err := services.RewriteBackupMediaPaths(validated.Backup, rewrite); err != nil {
			prepared.Cleanup()
			return nil, err
		}
		return prepared, nil
	}

	if err := services.RewriteImportMediaPaths(validated.ImportData, rewrite); err != nil {
		prepared.Cleanup()
		return nil, err
	}
	return prepared, nil
}

func extractBackupMediaEntry(prepared *preparedBackupMediaImport, entry *zip.File, archiveKey string, usedNames map[string]bool) (string, string, error) {
	if prepared.stageDir == "" {
		prepared.stageDir = filepath.Join(prepared.mediaDir, ".import-"+randomFilename(8))
		if err := os.MkdirAll(prepared.stageDir, 0o755); err != nil {
			return "", "", err
		}
	}

	reader, err := entry.Open()
	if err != nil {
		return "", "", err
	}
	defer reader.Close()

	contentType, sample, err := services.DetectContentTypeFromReader(reader)
	if err != nil {
		return "", "", err
	}
	if !services.IsImageContentType(contentType) {
		return "", "", fmt.Errorf("backup media %q is not an image", archiveKey)
	}

	ext := strings.ToLower(filepath.Ext(archiveKey))
	if ext == "" {
		if extensions, err := mime.ExtensionsByType(contentType); err == nil && len(extensions) > 0 {
			ext = extensions[0]
		}
	}
	if ext == "" {
		ext = ".img"
	}

	filename := randomFilename(16) + ext
	for usedNames[filename] {
		filename = randomFilename(16) + ext
	}
	usedNames[filename] = true

	stagedPath := filepath.Join(prepared.stageDir, filename)
	out, err := os.OpenFile(stagedPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o644)
	if err != nil {
		return "", "", err
	}
	if len(sample) > 0 {
		if _, err := out.Write(sample); err != nil {
			_ = out.Close()
			return "", "", err
		}
	}
	if _, err := io.Copy(out, reader); err != nil {
		_ = out.Close()
		return "", "", err
	}
	if err := out.Close(); err != nil {
		return "", "", err
	}

	return filename, stagedPath, nil
}

func (p *preparedBackupMediaImport) Promote() error {
	if p == nil || len(p.files) == 0 {
		return nil
	}
	if err := os.MkdirAll(p.mediaDir, 0o755); err != nil {
		return err
	}
	for _, file := range p.files {
		if err := os.Rename(file.stagedPath, file.finalPath); err != nil {
			return err
		}
	}
	if p.stageDir != "" {
		return os.RemoveAll(p.stageDir)
	}
	return nil
}

func (p *preparedBackupMediaImport) Cleanup() {
	if p == nil {
		return
	}
	for _, file := range p.files {
		_ = os.Remove(file.stagedPath)
		_ = os.Remove(file.finalPath)
	}
	if p.stageDir != "" {
		_ = os.RemoveAll(p.stageDir)
	}
}

func copyUploadedBackupToTemp(fileHeader *multipart.FileHeader, maxSize int64) (string, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()

	tempFile, err := os.CreateTemp("", "ankidemy-backup-*.zip")
	if err != nil {
		return "", err
	}
	defer tempFile.Close()

	written, err := io.Copy(tempFile, io.LimitReader(file, maxSize+1))
	if err != nil {
		_ = os.Remove(tempFile.Name())
		return "", err
	}
	if written > maxSize {
		_ = os.Remove(tempFile.Name())
		return "", fmt.Errorf("request body too large")
	}
	return tempFile.Name(), nil
}

func isBackupImportTooLarge(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "request body too large") || strings.Contains(message, "multipart: message too large")
}

// RestoreDomain unarchives a soft-deleted domain
func (h *DomainHandler) RestoreDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// We must check ownership/admin using Unscoped find
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		// Try unscoped load for deleted records to check owner
		var d models.Domain
		if e := h.domainDAO.DB().Unscoped().First(&d, uint(id)).Error; e != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
			return
		}
		domain = &d
	}

	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to restore this domain"})
			return
		}
	}

	if err := h.domainDAO.Restore(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restore domain"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Domain restored successfully"})
}

// PurgeDomain permanently deletes a domain and all related data
func (h *DomainHandler) PurgeDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Load unscoped to check ownership when soft-deleted
	var domain models.Domain
	if err := h.domainDAO.DB().Unscoped().First(&domain, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists || userID.(uint) != domain.OwnerID {
		isAdmin, adminExists := c.Get("isAdmin")
		if !adminExists || !isAdmin.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to delete this domain"})
			return
		}
	}

	if err := h.domainDAO.HardDeleteCascade(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to permanently delete domain"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Domain permanently deleted"})
}

// EnrollInDomain enrolls the current user in a domain
func (h *DomainHandler) EnrollInDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the domain is public or the user is the owner
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	isAdmin := false
	if adminVal, adminExists := c.Get("isAdmin"); adminExists {
		isAdmin, _ = adminVal.(bool)
	}
	canView, err := canViewDomain(domain, userID.(uint), isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
		return
	}

	// Enroll user
	if err := h.progressDAO.EnrollUserInDomain(userID.(uint), domain.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enroll in domain"})
		return
	}

	h.enqueueNotificationSummaryInvalidate(userID.(uint))
	c.JSON(http.StatusOK, gin.H{"message": "Enrolled in domain successfully"})
}

func (h *DomainHandler) enqueueNotificationSummaryInvalidate(userID uint) {
	if h.notificationReadModel == nil {
		return
	}
	if err := h.notificationReadModel.EnqueueSummaryInvalidate(userID); err != nil {
		log.Printf("warning: failed to enqueue notification summary invalidation for user %d: %v", userID, err)
	}
}

// GetComments returns comments for a domain
func (h *DomainHandler) GetComments(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	userID, isAdmin, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}
	canView, err := canViewDomain(domain, userID, isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
		return
	}

	// Get comments
	comments, err := h.domainDAO.GetComments(domain.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve comments"})
		return
	}

	c.JSON(http.StatusOK, comments)
}

// AddComment adds a comment to a domain
func (h *DomainHandler) AddComment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Get domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Get user ID
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	isAdmin := false
	if adminVal, adminExists := c.Get("isAdmin"); adminExists {
		isAdmin, _ = adminVal.(bool)
	}
	canView, err := canViewDomain(domain, userID.(uint), isAdmin, h.permissionDAO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access"})
		return
	}
	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
		return
	}

	// Bind comment data
	var commentData struct {
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&commentData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create comment
	comment := &models.DomainComment{
		Content:  commentData.Content,
		DomainID: domain.ID,
		UserID:   userID.(uint),
	}

	if err := h.domainDAO.AddComment(comment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add comment"})
		return
	}

	c.JSON(http.StatusCreated, comment)
}

// DeleteComment deletes a comment
func (h *DomainHandler) DeleteComment(c *gin.Context) {
	// Parse domain ID but we don't need to use it directly as the commentID is unique
	_, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	commentID, err := strconv.ParseUint(c.Param("commentId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	// Get user ID
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Delete comment (the DAO will check permissions)
	if err := h.domainDAO.DeleteComment(uint(commentID), userID.(uint)); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted successfully"})
}

// RegisterRoutes registers the domain routes
func (h *DomainHandler) RegisterRoutes(router *gin.RouterGroup) {
	// Public routes
	router.GET("/domains/public", h.GetPublicDomains)

	// Auth required routes
	authorized := router.Group("/")
	{
		domains := authorized.Group("/domains")
		{
			domains.GET("", h.GetDomains)
			domains.POST("", h.CreateDomain) // Now supports import data
			domains.GET("/my", h.GetMyDomains)
			domains.GET("/archived/my", h.GetMyArchivedDomains)
			domains.GET("/enrolled", h.GetEnrolledDomains)
			domains.GET("/:id", h.GetDomain)
			domains.PUT("/:id", h.UpdateDomain)
			domains.DELETE("/:id", h.DeleteDomain)
			domains.POST("/:id/restore", h.RestoreDomain)
			domains.DELETE("/:id/purge", h.PurgeDomain)
			domains.POST("/:id/enroll", h.EnrollInDomain)
			domains.POST("/:id/import", h.ImportToDomain) // NEW: Import to existing domain

			// Domain comments
			domains.GET("/:id/comments", h.GetComments)
			domains.POST("/:id/comments", h.AddComment)
			domains.DELETE("/:id/comments/:commentId", h.DeleteComment)
		}
	}
}
