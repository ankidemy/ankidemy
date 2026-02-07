package models

import "time"

// ReadModelEvent represents a durable, deduplicated event for asynchronous
// projection updates and cache invalidation.
type ReadModelEvent struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	DedupeKey  string    `gorm:"column:dedupe_key;size:191;not null;uniqueIndex:idx_read_model_events_dedupe" json:"dedupeKey"`
	EventType  string    `gorm:"column:event_type;size:120;not null;index" json:"eventType"`
	UserID     uint      `gorm:"column:user_id;not null;index" json:"userId"`
	DomainID   *uint     `gorm:"column:domain_id;index" json:"domainId,omitempty"`
	Payload    string    `gorm:"column:payload;type:text" json:"payload,omitempty"`
	NotBefore  time.Time `gorm:"column:not_before;not null;index" json:"notBefore"`
	RetryCount int       `gorm:"column:retry_count;not null;default:0" json:"retryCount"`
	LastError  string    `gorm:"column:last_error;type:text" json:"lastError,omitempty"`
	CreatedAt  time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (ReadModelEvent) TableName() string {
	return "read_model_events"
}

// UserDomainDueProjection stores per-user/per-domain due counts as a read model.
type UserDomainDueProjection struct {
	UserID     uint      `gorm:"column:user_id;primaryKey" json:"userId"`
	DomainID   uint      `gorm:"column:domain_id;primaryKey" json:"domainId"`
	DueReviews int       `gorm:"column:due_reviews;not null;default:0" json:"dueReviews"`
	ComputedAt time.Time `gorm:"column:computed_at;not null;index" json:"computedAt"`
	CreatedAt  time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (UserDomainDueProjection) TableName() string {
	return "user_domain_due_projections"
}

// NotificationSummaryDomain is the minimal domain payload needed by notifications.
type NotificationSummaryDomain struct {
	DomainID   uint   `json:"domainId"`
	DomainName string `json:"domainName"`
	DueCount   int    `json:"dueCount"`
}

// NotificationSummaryInvite is the minimal invite payload needed by notifications.
type NotificationSummaryInvite struct {
	ID                uint      `json:"id"`
	DomainID          uint      `json:"domainId"`
	DomainName        string    `json:"domainName"`
	InvitedBy         uint      `json:"invitedBy"`
	InvitedByUsername string    `json:"invitedByUsername"`
	Role              string    `json:"role"`
	CreatedAt         time.Time `json:"createdAt"`
}

// NotificationSummary is a read model tailored for notification polling.
type NotificationSummary struct {
	Domains     []NotificationSummaryDomain `json:"domains"`
	Invites     []NotificationSummaryInvite `json:"invites"`
	TotalDue    int                         `json:"totalDue"`
	InviteCount int                         `json:"inviteCount"`
	GeneratedAt time.Time                   `json:"generatedAt"`
}
