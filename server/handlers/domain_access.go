package handlers

import (
	"ankidemy/server/dao"
	"ankidemy/server/models"

	"github.com/gin-gonic/gin"
)

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

func canViewDomain(domain *models.Domain, userID uint, isAdmin bool, permissionDAO *dao.DomainPermissionDAO) (bool, error) {
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

func canEditDomain(domain *models.Domain, userID uint, isAdmin bool, permissionDAO *dao.DomainPermissionDAO) (bool, error) {
	if isAdmin || userID == domain.OwnerID {
		return true, nil
	}
	role, exists, err := permissionDAO.GetRole(domain.ID, userID)
	if err != nil {
		return false, err
	}
	return exists && role == "editor", nil
}
