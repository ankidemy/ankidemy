package handlers

import (
    "net/http"
    "strconv"
    "strings"
    "myapp/server/dao"
    "github.com/gin-gonic/gin"
)

type DomainNetworkHandler struct {
    dao *dao.DomainNetworkDAO
}

func NewDomainNetworkHandler(d *dao.DomainNetworkDAO) *DomainNetworkHandler {
    return &DomainNetworkHandler{dao: d}
}

// GET /api/network/links?domainIds=1,2,3
func (h *DomainNetworkHandler) GetLinks(c *gin.Context) {
    userID, exists := c.Get("userID")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
        return
    }
    // Parse optional domainIds query param
    var ids []uint
    if qs := c.Query("domainIds"); qs != "" {
        parts := strings.Split(qs, ",")
        for _, p := range parts {
            if p == "" { continue }
            if v, err := strconv.ParseUint(strings.TrimSpace(p), 10, 32); err == nil {
                ids = append(ids, uint(v))
            }
        }
    }
    links, err := h.dao.GetLinks(userID.(uint), ids)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch links"})
        return
    }
    c.JSON(http.StatusOK, links)
}

// POST /api/network/links { domainId1, domainId2 }
func (h *DomainNetworkHandler) CreateLink(c *gin.Context) {
    userID, exists := c.Get("userID")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
        return
    }
    var payload struct{
        DomainId1 uint `json:"domainId1" binding:"required"`
        DomainId2 uint `json:"domainId2" binding:"required"`
    }
    if err := c.ShouldBindJSON(&payload); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    link, err := h.dao.CreateLink(userID.(uint), payload.DomainId1, payload.DomainId2)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusCreated, link)
}

// DELETE /api/network/links/:id
func (h *DomainNetworkHandler) DeleteLink(c *gin.Context) {
    userID, exists := c.Get("userID")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
        return
    }
    linkID, err := strconv.ParseUint(c.Param("id"), 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid link ID"})
        return
    }
    if err := h.dao.DeleteLink(userID.(uint), uint(linkID)); err != nil {
        if err.Error() == "record not found" {
            c.JSON(http.StatusNotFound, gin.H{"error": "Link not found"})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete link"})
        return
    }
    c.Status(http.StatusNoContent)
}

