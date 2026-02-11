package dao

import (
	"encoding/json"

	"gorm.io/gorm"
	"ankidemy/server/models"
)

type UserDomainSettingsDAO struct {
	db *gorm.DB
}

func NewUserDomainSettingsDAO(db *gorm.DB) *UserDomainSettingsDAO {
	return &UserDomainSettingsDAO{db: db}
}

func (d *UserDomainSettingsDAO) GetOrCreate(userID uint, domainID uint) (*models.UserDomainSettings, error) {
	settings := &models.UserDomainSettings{
		UserID:   userID,
		DomainID: domainID,
		Preferences: json.RawMessage([]byte("{}")),
	}
	if err := d.db.FirstOrCreate(settings, "user_id = ? AND domain_id = ?", userID, domainID).Error; err != nil {
		return nil, err
	}
	return settings, nil
}

func (d *UserDomainSettingsDAO) Update(settings *models.UserDomainSettings) error {
	return d.db.Save(settings).Error
}
