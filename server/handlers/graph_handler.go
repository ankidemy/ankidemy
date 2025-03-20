package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
)

// GraphHandler handles graph-related HTTP requests
type GraphHandler struct {
	graphDAO  *dao.GraphDAO
	domainDAO *dao.DomainDAO
}

// NewGraphHandler creates a new GraphHandler
func NewGraphHandler(graphDAO *dao.GraphDAO, domainDAO *dao.DomainDAO) *GraphHandler {
	return &GraphHandler{
		graphDAO:  graphDAO,
		domainDAO: domainDAO,
	}
}

// GetVisualGraph returns a domain as a visual graph
func (h *GraphHandler) GetVisualGraph(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Check access to the domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the domain is public or the user is the owner
	if domain.Privacy != "public" {
		userID, exists := c.Get("userID")
		if !exists || userID.(uint) != domain.OwnerID {
			isAdmin, adminExists := c.Get("isAdmin")
			if !adminExists || !isAdmin.(bool) {
				c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
				return
			}
		}
	}

	// Get the visual graph
	graph, err := h.graphDAO.GetVisualGraph(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve graph data"})
		return
	}

	c.JSON(http.StatusOK, graph)
}

// UpdatePositions updates the positions of nodes in the graph
func (h *GraphHandler) UpdatePositions(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Check access to the domain
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

	// Bind the positions
	var positions map[string]struct{ X, Y float64 }
	if err := c.ShouldBindJSON(&positions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update the positions
	if err := h.graphDAO.UpdateGraphPositions(positions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update positions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Positions updated successfully"})
}

// ExportDomain exports a domain to JSON format
func (h *GraphHandler) ExportDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Check access to the domain
	domain, err := h.domainDAO.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Domain not found"})
		return
	}

	// Check if the domain is public or the user is the owner
	if domain.Privacy != "public" {
		userID, exists := c.Get("userID")
		if !exists || userID.(uint) != domain.OwnerID {
			isAdmin, adminExists := c.Get("isAdmin")
			if !adminExists || !isAdmin.(bool) {
				c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to this domain"})
				return
			}
		}
	}

	// Export the domain
	graphData, err := h.graphDAO.ExportDomain(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to export domain"})
		return
	}

	c.JSON(http.StatusOK, graphData)
}

// ImportDomain imports a domain from JSON format
func (h *GraphHandler) ImportDomain(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid domain ID"})
		return
	}

	// Check access to the domain
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

	// Bind the graph data
	var graphData dao.GraphData
	if err := c.ShouldBindJSON(&graphData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Import the domain
	if err := h.graphDAO.ImportDomain(uint(id), &graphData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to import domain"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Domain imported successfully"})
}

// RegisterRoutes registers the graph routes
func (h *GraphHandler) RegisterRoutes(router *gin.RouterGroup) {
	domains := router.Group("/domains")
	{
		domains.GET("/:id/graph", h.GetVisualGraph)
		domains.PUT("/:id/graph/positions", h.UpdatePositions)
		domains.GET("/:id/export", h.ExportDomain)
		domains.POST("/:id/import", h.ImportDomain)
	}
}
