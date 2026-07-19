package models

import (
	"encoding/json"
	"time"
)

// UserDomainSettings stores per-user settings per domain (timezone + daily quest settings).
type UserDomainSettings struct {
	ID                     uint            `gorm:"primaryKey" json:"id"`
	UserID                 uint            `gorm:"column:user_id;not null;index;uniqueIndex:idx_user_domain_settings" json:"userId"`
	DomainID               uint            `gorm:"column:domain_id;not null;index;uniqueIndex:idx_user_domain_settings" json:"domainId"`
	Timezone               string          `gorm:"column:timezone;not null;default:'UTC'" json:"timezone"`
	DailyQuestLimit        int             `gorm:"column:daily_quest_limit;not null;default:1" json:"dailyQuestLimit"`
	DailyQuestCooldownDays int             `gorm:"column:daily_quest_cooldown_days;not null;default:7" json:"dailyQuestCooldownDays"`
	Preferences            json.RawMessage `gorm:"column:preferences;type:jsonb;default:'{}'" json:"preferences,omitempty"`
	CreatedAt              time.Time       `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt              time.Time       `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (UserDomainSettings) TableName() string { return "user_domain_settings" }
