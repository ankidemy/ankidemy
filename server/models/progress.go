package models

import (
	"time"
)

// UserDomainProgress represents a user's enrollment and progress in a domain
type UserDomainProgress struct {
	UserID         uint      `gorm:"column:user_id;primaryKey" json:"userId"`
	DomainID       uint      `gorm:"column:domain_id;primaryKey" json:"domainId"`
	EnrollmentDate time.Time `gorm:"column:enrollment_date;autoCreateTime" json:"enrollmentDate"`
	Progress       float64   `gorm:"column:progress;default:0" json:"progress"`
	LastActivity   time.Time `gorm:"column:last_activity;autoUpdateTime" json:"lastActivity"`

	// Relationships
	User   *User   `gorm:"foreignKey:UserID" json:"-"`
	Domain *Domain `gorm:"foreignKey:DomainID" json:"-"`
}

// TableName overrides the table name
func (UserDomainProgress) TableName() string {
	return "user_domain_progress"
}
