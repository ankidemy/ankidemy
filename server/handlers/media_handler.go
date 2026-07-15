package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"ankidemy/server/dao"
	"ankidemy/server/services"
	"github.com/gin-gonic/gin"
	"mime/multipart"
)

type MediaHandler struct {
	domainDAO     *dao.DomainDAO
	progressDAO   *dao.ProgressDAO
	permissionDAO *dao.DomainPermissionDAO
}

func NewMediaHandler(domainDAO *dao.DomainDAO, progressDAO *dao.ProgressDAO, permissionDAO *dao.DomainPermissionDAO) *MediaHandler {
	return &MediaHandler{
		domainDAO:     domainDAO,
		progressDAO:   progressDAO,
		permissionDAO: permissionDAO,
	}
}

// POST /api/media/upload
func (h *MediaHandler) UploadImage(c *gin.Context) {
	userIDVal, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	isAdmin := false
	if adminVal, ok := c.Get("isAdmin"); ok {
		isAdmin = adminVal.(bool)
	}

	domainIDRaw := c.PostForm("domainId")
	if domainIDRaw == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domainId is required"})
		return
	}
	domainID, err := strconv.ParseUint(domainIDRaw, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domainId"})
		return
	}

	domain, err := h.domainDAO.FindByID(uint(domainID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	if domain.OwnerID != userIDVal.(uint) && !isAdmin {
		role, exists, err := h.permissionDAO.GetRole(domain.ID, userIDVal.(uint))
		if err != nil || !exists || role != "editor" {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't have permission to upload media to this domain"})
			return
		}
	}

	nodeType := c.PostForm("nodeType")
	field := c.PostForm("field")
	if !validFieldForNode(nodeType, field) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid nodeType or field"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	contentType, err := sniffContentType(file)
	if err != nil || !services.IsImageContentType(contentType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only image uploads are supported"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext == "" {
		if exts, err := mime.ExtensionsByType(contentType); err == nil && len(exts) > 0 {
			ext = exts[0]
		}
	}
	if ext == "" {
		ext = ".img"
	}

	visibility := "public"
	if domain.Privacy != "public" {
		visibility = "private"
	}

	domainFolder := services.BuildDomainFolder(domain.ID, domain.Name)
	dir := services.BuildMediaDir(domain.OwnerID, visibility, domainFolder)
	if err := ensureDir(dir); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare media directory"})
		return
	}

	filename := randomName(16) + ext
	filePath := filepath.Join(dir, filename)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save image"})
		return
	}

	urlPath := services.BuildMediaURL(domain.OwnerID, visibility, domainFolder, filename)
	c.JSON(http.StatusOK, gin.H{"imagePath": urlPath})
}

// GET /api/media/:userId/:visibility/:domain/:filename
func (h *MediaHandler) GetImage(c *gin.Context) {
	visibility := c.Param("visibility")
	if visibility != "public" && visibility != "private" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid visibility"})
		return
	}
	userIDParam := c.Param("userId")
	domainFolder := c.Param("domain")
	filename := c.Param("filename")

	if !isSafeSegment(userIDParam) || !isSafeSegment(domainFolder) || !isSafeSegment(filename) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid media path"})
		return
	}

	domainID, err := parseDomainID(domainFolder)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain folder"})
		return
	}

	domain, err := h.domainDAO.FindByID(domainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}
	ownerID, err := strconv.ParseUint(userIDParam, 10, 32)
	if err != nil || domain.OwnerID != uint(ownerID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Media not found"})
		return
	}

	if visibility == "private" {
		userID, ok := c.Get("userID")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		isAdmin := false
		if adminVal, ok := c.Get("isAdmin"); ok {
			isAdmin = adminVal.(bool)
		}
		if domain.OwnerID != userID.(uint) && !isAdmin {
			enrolled, err := h.progressDAO.IsUserEnrolled(userID.(uint), domain.ID)
			if err != nil || !enrolled {
				role, exists, permErr := h.permissionDAO.GetRole(domain.ID, userID.(uint))
				if permErr != nil || !exists || role == "" {
					c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this media"})
					return
				}
			}
		}
	}

	filePath := filepath.Join(services.MediaRoot, userIDParam, visibility, domainFolder, filename)
	if err := serveMediaFile(c, filePath, filename); err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read media"})
		return
	}
}

func validFieldForNode(nodeType, field string) bool {
	if nodeType == "definition" {
		return field == "prompt" || field == "description"
	}
	if nodeType == "exercise" {
		return field == "statement" || field == "description"
	}
	if nodeType == "quest" {
		return field == "description"
	}
	return false
}

func randomName(length int) string {
	if length <= 0 {
		length = 16
	}
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%x", b)
	}
	return hex.EncodeToString(b)
}

func ensureDir(dir string) error {
	return os.MkdirAll(dir, 0o755)
}

func sniffContentType(file *multipart.FileHeader) (string, error) {
	f, err := file.Open()
	if err != nil {
		return "", err
	}
	defer f.Close()
	contentType, _, err := services.DetectContentTypeFromReader(f)
	return contentType, err
}

func isSafeSegment(segment string) bool {
	return segment != "" && segment != "." && segment != ".." && !strings.Contains(segment, "..") && !strings.Contains(segment, "/")
}

func parseDomainID(folder string) (uint, error) {
	parts := strings.SplitN(folder, "-", 2)
	if len(parts) == 0 {
		return 0, fmt.Errorf("invalid domain folder")
	}
	id, err := strconv.ParseUint(parts[0], 10, 32)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

func serveMediaFile(c *gin.Context, filePath, filename string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return err
	}

	contentType, _, err := services.DetectContentTypeFromReader(file)
	if err != nil {
		return err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}

	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Type", contentType)
	if contentType == "image/svg+xml" {
		c.Header("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'")
	}
	disposition := fmt.Sprintf("inline; filename=%q", sanitizeMediaFilename(filename))
	if !services.IsImageContentType(contentType) {
		disposition = fmt.Sprintf("attachment; filename=%q", sanitizeMediaFilename(filename))
	}
	c.Header("Content-Disposition", disposition)
	http.ServeContent(c.Writer, c.Request, filename, info.ModTime(), file)
	return nil
}

func sanitizeMediaFilename(filename string) string {
	clean := strings.TrimSpace(filepath.Base(filename))
	if clean == "." || clean == "" || clean == string(filepath.Separator) {
		return "download"
	}
	return clean
}
