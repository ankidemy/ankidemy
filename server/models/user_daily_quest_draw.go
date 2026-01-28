package models

import (
	"encoding/json"
	"time"
)

// UserDailyQuestDraw stores persisted daily quest selections.
type UserDailyQuestDraw struct {
	ID        uint            `gorm:"primaryKey" json:"id"`
	UserID    uint            `gorm:"column:user_id;not null;index;uniqueIndex:idx_user_domain_day" json:"userId"`
	DomainID  uint            `gorm:"column:domain_id;not null;index;uniqueIndex:idx_user_domain_day" json:"domainId"`
	DateKey   string          `gorm:"column:date_key;not null;uniqueIndex:idx_user_domain_day" json:"dateKey"`
	QuestIDs  json.RawMessage `gorm:"column:quest_ids;type:jsonb;not null" json:"questIds"`
	CreatedAt time.Time       `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (UserDailyQuestDraw) TableName() string { return "user_daily_quest_draws" }
