package models

import "time"

// DomainNodeCode enforces unique codes across node types per domain.
type DomainNodeCode struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DomainID  uint      `gorm:"column:domain_id;not null;index;uniqueIndex:idx_domain_code" json:"domainId"`
	Code      string    `gorm:"column:code;not null;size:80;uniqueIndex:idx_domain_code" json:"code"`
	NodeType  string    `gorm:"column:node_type;not null;index" json:"nodeType"`
	NodeID    uint      `gorm:"column:node_id;not null;index" json:"nodeId"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (DomainNodeCode) TableName() string { return "domain_node_codes" }
