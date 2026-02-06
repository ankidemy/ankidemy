package dao

import (
	"myapp/server/models"
	"time"

	"gorm.io/gorm"
)

// DomainInviteDAO handles domain invite queries.
type DomainInviteDAO struct {
	db *gorm.DB
}

func NewDomainInviteDAO(db *gorm.DB) *DomainInviteDAO {
	return &DomainInviteDAO{db: db}
}

func (d *DomainInviteDAO) FindPendingInvite(domainID, userID uint) (*models.DomainInvite, error) {
	var invite models.DomainInvite
	tx := d.db.Where("domain_id = ? AND invited_user_id = ? AND status = ?", domainID, userID, "pending").
		Limit(1).
		Find(&invite)
	if tx.Error != nil {
		return nil, tx.Error
	}
	if tx.RowsAffected == 0 {
		return nil, nil
	}
	return &invite, nil
}

func (d *DomainInviteDAO) Create(invite *models.DomainInvite) error {
	return d.db.Create(invite).Error
}

func (d *DomainInviteDAO) Update(invite *models.DomainInvite) error {
	return d.db.Save(invite).Error
}

func (d *DomainInviteDAO) FindByID(inviteID uint) (*models.DomainInvite, error) {
	var invite models.DomainInvite
	tx := d.db.First(&invite, inviteID)
	if tx.Error != nil {
		return nil, tx.Error
	}
	return &invite, nil
}

func (d *DomainInviteDAO) ListPendingForUser(userID uint, requestID string) ([]models.DomainInvite, error) {
	const route = "/api/domain-invites"
	const daoMethod = "DomainInviteDAO.ListPendingForUser"

	var invites []models.DomainInvite
	listInvitesStartedAt := time.Now()
	if err := d.db.Where("invited_user_id = ? AND status = ?", userID, "pending").
		Find(&invites).Error; err != nil {
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"list_pending_invites",
			listInvitesStartedAt,
			err,
			map[string]interface{}{"userId": userID},
		)
		return nil, err
	}
	logDAOStage(
		requestID,
		route,
		daoMethod,
		"list_pending_invites",
		listInvitesStartedAt,
		nil,
		map[string]interface{}{"userId": userID, "inviteCount": len(invites)},
	)

	if len(invites) == 0 {
		return invites, nil
	}

	domainIDs := make([]uint, 0, len(invites))
	inviterIDs := make([]uint, 0, len(invites))
	for _, invite := range invites {
		domainIDs = append(domainIDs, invite.DomainID)
		inviterIDs = append(inviterIDs, invite.InvitedBy)
	}
	domainIDs = uniqueUintIDs(domainIDs)
	inviterIDs = uniqueUintIDs(inviterIDs)

	domainByID := make(map[uint]*models.Domain, len(domainIDs))
	if len(domainIDs) > 0 {
		loadDomainsStartedAt := time.Now()
		var domains []models.Domain
		if err := d.db.Where("id IN ?", domainIDs).Find(&domains).Error; err != nil {
			logDAOStage(
				requestID,
				route,
				daoMethod,
				"load_domains",
				loadDomainsStartedAt,
				err,
				map[string]interface{}{"userId": userID, "domainIdCount": len(domainIDs)},
			)
			return nil, err
		}
		for i := range domains {
			domainByID[domains[i].ID] = &domains[i]
		}
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"load_domains",
			loadDomainsStartedAt,
			nil,
			map[string]interface{}{
				"userId":      userID,
				"domainCount": len(domains),
			},
		)
	}

	inviterByID := make(map[uint]*models.User, len(inviterIDs))
	if len(inviterIDs) > 0 {
		loadInvitersStartedAt := time.Now()
		var inviters []models.User
		if err := d.db.Where("id IN ?", inviterIDs).Find(&inviters).Error; err != nil {
			logDAOStage(
				requestID,
				route,
				daoMethod,
				"load_inviters",
				loadInvitersStartedAt,
				err,
				map[string]interface{}{"userId": userID, "inviterIdCount": len(inviterIDs)},
			)
			return nil, err
		}
		for i := range inviters {
			inviterByID[inviters[i].ID] = &inviters[i]
		}
		logDAOStage(
			requestID,
			route,
			daoMethod,
			"load_inviters",
			loadInvitersStartedAt,
			nil,
			map[string]interface{}{
				"userId":       userID,
				"inviterCount": len(inviters),
			},
		)
	}

	hydrateStartedAt := time.Now()
	for i := range invites {
		if domain, ok := domainByID[invites[i].DomainID]; ok {
			invites[i].Domain = domain
		}
		if inviter, ok := inviterByID[invites[i].InvitedBy]; ok {
			invites[i].Inviter = inviter
		}
	}
	logDAOStage(
		requestID,
		route,
		daoMethod,
		"hydrate_relations",
		hydrateStartedAt,
		nil,
		map[string]interface{}{"userId": userID, "inviteCount": len(invites)},
	)

	return invites, nil
}

func uniqueUintIDs(values []uint) []uint {
	if len(values) == 0 {
		return values
	}
	seen := make(map[uint]struct{}, len(values))
	unique := make([]uint, 0, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
}
