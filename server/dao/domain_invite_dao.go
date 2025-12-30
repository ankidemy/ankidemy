package dao

import (
	"myapp/server/models"

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

func (d *DomainInviteDAO) ListPendingForUser(userID uint) ([]models.DomainInvite, error) {
	var invites []models.DomainInvite
	if err := d.db.Where("invited_user_id = ? AND status = ?", userID, "pending").
		Preload("Domain").
		Preload("Inviter").
		Find(&invites).Error; err != nil {
		return nil, err
	}
	return invites, nil
}
