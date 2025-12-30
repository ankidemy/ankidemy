package models

import "time"

// DomainPermission grants a user access to a domain.
type DomainPermission struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DomainID  uint      `gorm:"column:domain_id;not null;uniqueIndex:idx_domain_user" json:"domainId"`
	UserID    uint      `gorm:"column:user_id;not null;uniqueIndex:idx_domain_user" json:"userId"`
	Role      string    `gorm:"column:role;not null" json:"role"` // editor, viewer
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (DomainPermission) TableName() string {
	return "domain_permissions"
}

// DomainInvite represents a pending collaboration invite.
type DomainInvite struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	DomainID      uint       `gorm:"column:domain_id;not null;index" json:"domainId"`
	InvitedUserID uint       `gorm:"column:invited_user_id;not null;index" json:"invitedUserId"`
	InvitedBy     uint       `gorm:"column:invited_by;not null" json:"invitedBy"`
	Role          string     `gorm:"column:role;not null" json:"role"`     // editor, viewer
	Status        string     `gorm:"column:status;not null" json:"status"` // pending, accepted, declined
	CreatedAt     time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	RespondedAt   *time.Time `gorm:"column:responded_at" json:"respondedAt,omitempty"`

	Domain  *Domain `gorm:"foreignKey:DomainID" json:"-"`
	Inviter *User   `gorm:"foreignKey:InvitedBy" json:"-"`
	Invitee *User   `gorm:"foreignKey:InvitedUserID" json:"-"`
}

func (DomainInvite) TableName() string {
	return "domain_invites"
}
