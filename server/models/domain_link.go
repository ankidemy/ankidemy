package models

import (
	"time"
)

// DomainLink represents an undirected user-defined connection between two domains.
// We store pairs in canonical order (DomainAID < DomainBID) to enforce uniqueness.
type DomainLink struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DomainAID uint      `gorm:"column:domain_a_id;not null;index" json:"domainAId"`
	DomainBID uint      `gorm:"column:domain_b_id;not null;index" json:"domainBId"`
	CreatedBy uint      `gorm:"column:created_by;not null;index" json:"createdBy"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (DomainLink) TableName() string {
	return "domain_links"
}
