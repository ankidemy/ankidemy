package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"ankidemy/server/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const liveImportMutationTimeout = 30 * time.Second

type ContentLiveImportHandler struct {
	service *services.ContentLiveImportService
	hub     *services.ContentEventHub
}

func NewContentLiveImportHandler(service *services.ContentLiveImportService, hub *services.ContentEventHub) *ContentLiveImportHandler {
	return &ContentLiveImportHandler{service: service, hub: hub}
}

func liveImportUser(c *gin.Context) (uint, bool) {
	userID, _, ok := getUserContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
	}
	return userID, ok
}

func liveImportID(c *gin.Context, name string) (uint, bool) {
	value, err := strconv.ParseUint(c.Param(name), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid " + name})
		return 0, false
	}
	return uint(value), true
}

func (h *ContentLiveImportHandler) Status(c *gin.Context) {
	userID, ok := liveImportUser(c)
	if !ok {
		return
	}
	status, err := h.service.Status(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load live-import status"})
		return
	}
	c.JSON(http.StatusOK, status)
}

func (h *ContentLiveImportHandler) DomainBinding(c *gin.Context) {
	userID, ok := liveImportUser(c)
	if !ok {
		return
	}
	domainID, ok := liveImportID(c, "domainId")
	if !ok {
		return
	}
	binding, err := h.service.BindingForDomain(userID, domainID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusOK, gin.H{"managed": false})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load content binding"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"managed": true, "binding": binding})
}

func (h *ContentLiveImportHandler) AttachCurrent(c *gin.Context) {
	userID, ok := liveImportUser(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), liveImportMutationTimeout)
	defer cancel()
	binding, result, err := h.service.AttachCurrent(ctx, userID)
	if errors.Is(err, services.ErrContentBindingExists) {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	var reconcileErr *services.ContentReconcileError
	if errors.As(err, &reconcileErr) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error(), "validation": reconcileErr.Validation})
		return
	}
	if errors.Is(err, context.DeadlineExceeded) {
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Timed out waiting for the Org snapshot"})
		return
	}
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"binding": binding, "result": result})
}

func (h *ContentLiveImportHandler) Resync(c *gin.Context) {
	userID, ok := liveImportUser(c)
	if !ok {
		return
	}
	bindingID, ok := liveImportID(c, "bindingId")
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), liveImportMutationTimeout)
	defer cancel()
	result, err := h.service.Resync(ctx, userID, bindingID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Content binding not found"})
		return
	}
	var reconcileErr *services.ContentReconcileError
	if errors.As(err, &reconcileErr) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error(), "validation": reconcileErr.Validation})
		return
	}
	if errors.Is(err, context.DeadlineExceeded) {
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Timed out waiting for the Org snapshot"})
		return
	}
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ContentLiveImportHandler) Detach(c *gin.Context) {
	userID, ok := liveImportUser(c)
	if !ok {
		return
	}
	bindingID, ok := liveImportID(c, "bindingId")
	if !ok {
		return
	}
	if err := h.service.Detach(userID, bindingID); errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Content binding not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ContentLiveImportHandler) Diagnostics(c *gin.Context) {
	userID, ok := liveImportUser(c)
	if !ok {
		return
	}
	bindingID, ok := liveImportID(c, "bindingId")
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	runs, err := h.service.Diagnostics(userID, bindingID, limit)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Content binding not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, runs)
}

// Events is authenticated SSE. The browser uses fetch streaming (rather than
// EventSource) so its normal bearer token remains in the Authorization header.
func (h *ContentLiveImportHandler) Events(c *gin.Context) {
	userID, ok := liveImportUser(c)
	if !ok {
		return
	}
	events, unsubscribe := h.hub.Subscribe(userID)
	defer unsubscribe()
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache, no-transform")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	c.Writer.Flush()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event, open := <-events:
			if !open {
				return
			}
			c.SSEvent("content", event)
			c.Writer.Flush()
		case <-heartbeat.C:
			_, _ = c.Writer.Write([]byte(": keepalive\n\n"))
			c.Writer.Flush()
		}
	}
}
