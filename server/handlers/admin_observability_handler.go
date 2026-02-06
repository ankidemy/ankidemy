package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"myapp/server/dao"
)

type AdminObservabilityHandler struct {
	pgStatsDAO *dao.PGStatStatementsDAO
}

func NewAdminObservabilityHandler(pgStatsDAO *dao.PGStatStatementsDAO) *AdminObservabilityHandler {
	return &AdminObservabilityHandler{pgStatsDAO: pgStatsDAO}
}

func (h *AdminObservabilityHandler) GetDBQueryStats(c *gin.Context) {
	limit := 20
	if rawLimit := strings.TrimSpace(c.Query("limit")); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be a valid integer"})
			return
		}
		limit = parsed
	}

	target := strings.TrimSpace(c.DefaultQuery("target", "all"))
	queryFilter := strings.TrimSpace(c.Query("filter"))
	if queryFilter == "" {
		queryFilter = defaultPGQueryFilter(target)
	}

	stats, err := h.pgStatsDAO.TopQueries(limit, queryFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to read pg_stat_statements. Ensure PostgreSQL has shared_preload_libraries=pg_stat_statements and extension installed.",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"target":      target,
		"queryFilter": queryFilter,
		"limit":       limit,
		"stats":       stats,
	})
}

func defaultPGQueryFilter(target string) string {
	switch strings.ToLower(strings.TrimSpace(target)) {
	case "srs_domain_stats":
		// Uses inline SQL comments in SRSDao.GetDomainStats for easy filtering.
		return "%route:/api/srs/domains/:domainId/stats%"
	case "domain_invites":
		return "%domain_invites%"
	default:
		return "%"
	}
}
