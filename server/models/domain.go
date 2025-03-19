package models

import (
	"time"

	"gorm.io/gorm"
)

// Domain represents a knowledge domain (formerly "temario")
type Domain struct {
	gorm.Model
	Name        string `gorm:"column:name;not null" json:"name"`
	Privacy     string `gorm:"column:privacy;not null" json:"privacy"`
	OwnerID     uint   `gorm:"column:owner_id;not null" json:"ownerId"`
	Description string `gorm:"column:description" json:"description"`

	// Relationships - only included when explicitly loaded
	Owner       *User        `gorm:"foreignKey:OwnerID" json:"-"`
	Definitions []Definition `json:"definitions,omitempty"`
	Exercises   []Exercise   `json:"exercises,omitempty"`
}

// TableName overrides the table name
func (Domain) TableName() string {
	return "domains"
}

// DomainComment represents a comment on a domain
type DomainComment struct {
	gorm.Model
	Content   string    `gorm:"column:content;not null" json:"content"`
	DomainID  uint      `gorm:"column:domain_id;not null" json:"domainId"`
	UserID    uint      `gorm:"column:user_id;not null" json:"userId"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`

	// Relationships
	Domain *Domain `gorm:"foreignKey:DomainID" json:"-"`
	User   *User   `gorm:"foreignKey:UserID" json:"-"`
}

// TableName overrides the table name
func (DomainComment) TableName() string {
	return "domain_comments"
}
