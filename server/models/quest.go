package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// Quest represents a quest definition node (schedule + visibility + position).
type Quest struct {
	ID         uint            `gorm:"primaryKey" json:"id"`
	DomainID   uint            `gorm:"column:domain_id;not null;index" json:"domainId"`
	OwnerID    uint            `gorm:"column:owner_id;not null;index" json:"ownerId"`
	Code       string          `gorm:"column:code;not null;size:80;index" json:"code"`
	Name       string          `gorm:"column:name;not null;default:'';size:200" json:"name"`
	Kind       string          `gorm:"column:kind;not null" json:"kind"`
	Schedule   json.RawMessage `gorm:"column:schedule;type:jsonb;not null" json:"schedule"`
	XPosition  float64         `gorm:"column:x_position;default:0" json:"xPosition"`
	YPosition  float64         `gorm:"column:y_position;default:0" json:"yPosition"`
	Visibility string          `gorm:"column:visibility;not null;default:'private'" json:"visibility"`
	CreatedAt  time.Time       `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time       `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	DeletedAt  gorm.DeletedAt  `gorm:"column:deleted_at;index" json:"deletedAt,omitempty"`
}

func (Quest) TableName() string { return "quests" }

// QuestVersion represents versioned quest content.
type QuestVersion struct {
	ID            uint            `gorm:"primaryKey" json:"id"`
	QuestID       uint            `gorm:"column:quest_id;not null;index" json:"questId"`
	DisplayOrder  int             `gorm:"column:display_order;not null;default:0" json:"displayOrder"`
	Title         string          `gorm:"column:title;not null" json:"title"`
	DescriptionMd string          `gorm:"column:description_md;not null;default:''" json:"descriptionMd"`
	TaskList      json.RawMessage `gorm:"column:task_list;type:jsonb" json:"taskList,omitempty"`
	ImagePath     *string         `gorm:"column:image_path" json:"imagePath,omitempty"`
	CreatedAt     time.Time       `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt     time.Time       `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	DeletedAt     gorm.DeletedAt  `gorm:"column:deleted_at;index" json:"deletedAt,omitempty"`
}

func (QuestVersion) TableName() string { return "quest_versions" }

// UserQuestState stores per-user state for a quest definition.
type UserQuestState struct {
	ID                 uint       `gorm:"primaryKey" json:"id"`
	UserID             uint       `gorm:"column:user_id;not null;index;uniqueIndex:idx_user_quest" json:"userId"`
	QuestID            uint       `gorm:"column:quest_id;not null;index;uniqueIndex:idx_user_quest" json:"questId"`
	Active             bool       `gorm:"column:active;not null;default:true" json:"active"`
	NextDueAt          *time.Time `gorm:"column:next_due_at" json:"nextDueAt,omitempty"`
	SnoozedUntil       *time.Time `gorm:"column:snoozed_until" json:"snoozedUntil,omitempty"`
	LastPresentedAt    *time.Time `gorm:"column:last_presented_at" json:"lastPresentedAt,omitempty"`
	LastCompletedAt    *time.Time `gorm:"column:last_completed_at" json:"lastCompletedAt,omitempty"`
	CurrentStreak      int        `gorm:"column:current_streak;not null;default:0" json:"currentStreak"`
	CurrentPeriodKey   *string    `gorm:"column:current_period_key" json:"currentPeriodKey,omitempty"`
	CurrentPeriodCount int        `gorm:"column:current_period_count;not null;default:0" json:"currentPeriodCount"`
	LastShownAt        *time.Time `gorm:"column:last_shown_at" json:"lastShownAt,omitempty"`
	CreatedAt          time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt          time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (UserQuestState) TableName() string { return "user_quest_state" }

// QuestEvent is an append-only log for quest events.
type QuestEvent struct {
	ID             uint            `gorm:"primaryKey" json:"id"`
	UserID         uint            `gorm:"column:user_id;not null;index" json:"userId"`
	QuestID        uint            `gorm:"column:quest_id;not null;index" json:"questId"`
	QuestVersionID *uint           `gorm:"column:quest_version_id" json:"questVersionId,omitempty"`
	EventType      string          `gorm:"column:event_type;not null" json:"eventType"`
	HappenedAt     time.Time       `gorm:"column:happened_at;autoCreateTime" json:"happenedAt"`
	Note           *string         `gorm:"column:note" json:"note,omitempty"`
	Payload        json.RawMessage `gorm:"column:payload;type:jsonb" json:"payload,omitempty"`
}

func (QuestEvent) TableName() string { return "quest_events" }

type QuestCreateRequest struct {
	Code           string              `json:"code,omitempty"`
	Name           string              `json:"name,omitempty"`
	Kind           string              `json:"kind"`
	Schedule       json.RawMessage     `json:"schedule"`
	Visibility     string              `json:"visibility,omitempty"`
	XPosition      float64             `json:"xPosition,omitempty"`
	YPosition      float64             `json:"yPosition,omitempty"`
	InitialVersion QuestVersionRequest `json:"initialVersion"`
}

type QuestUpdateRequest struct {
	Code       *string          `json:"code,omitempty"`
	Name       *string          `json:"name,omitempty"`
	Kind       *string          `json:"kind,omitempty"`
	Schedule   *json.RawMessage `json:"schedule,omitempty"`
	Visibility *string          `json:"visibility,omitempty"`
	XPosition  *float64         `json:"xPosition,omitempty"`
	YPosition  *float64         `json:"yPosition,omitempty"`
	Active     *bool            `json:"active,omitempty"`
}

type QuestVersionRequest struct {
	Title         string           `json:"title"`
	DescriptionMd string           `json:"descriptionMd,omitempty"`
	TaskList      *json.RawMessage `json:"taskList,omitempty"`
	ImagePath     *string          `json:"imagePath,omitempty"`
}

type QuestResponse struct {
	ID         uint                   `json:"id"`
	DomainID   uint                   `json:"domainId"`
	OwnerID    uint                   `json:"ownerId"`
	Code       string                 `json:"code"`
	Name       string                 `json:"name"`
	Kind       string                 `json:"kind"`
	Schedule   json.RawMessage        `json:"schedule"`
	XPosition  float64                `json:"xPosition"`
	YPosition  float64                `json:"yPosition"`
	Visibility string                 `json:"visibility"`
	Active     bool                   `json:"active"`
	NextDueAt  *time.Time             `json:"nextDueAt,omitempty"`
	CreatedAt  time.Time              `json:"createdAt"`
	UpdatedAt  time.Time              `json:"updatedAt"`
	Versions   []QuestVersionResponse `json:"versions,omitempty"`
}

type QuestVersionResponse struct {
	ID            uint            `json:"id"`
	QuestID       uint            `json:"questId"`
	DisplayOrder  int             `json:"displayOrder"`
	Title         string          `json:"title"`
	DescriptionMd string          `json:"descriptionMd"`
	TaskList      json.RawMessage `json:"taskList,omitempty"`
	ImagePath     *string         `json:"imagePath,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
	UpdatedAt     time.Time       `json:"updatedAt"`
}

type QuestEventRequest struct {
	QuestID        uint            `json:"questId"`
	EventType      string          `json:"eventType"`
	QuestVersionID *uint           `json:"questVersionId,omitempty"`
	HappenedAt     *time.Time      `json:"happenedAt,omitempty"`
	Note           *string         `json:"note,omitempty"`
	Payload        json.RawMessage `json:"payload,omitempty"`
}
