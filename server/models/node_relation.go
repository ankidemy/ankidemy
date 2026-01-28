package models

import "time"

// NodeRelation represents a typed link between nodes.
type NodeRelation struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	DomainID     uint      `gorm:"column:domain_id;not null;index" json:"domainId"`
	FromType     string    `gorm:"column:from_type;not null" json:"fromType"`
	FromID       uint      `gorm:"column:from_id;not null" json:"fromId"`
	ToType       string    `gorm:"column:to_type;not null" json:"toType"`
	ToID         uint      `gorm:"column:to_id;not null" json:"toId"`
	RelationType string    `gorm:"column:relation_type;not null" json:"relationType"`
	ContextKey   string    `gorm:"column:context_key;not null;default:''" json:"contextKey"`
	CreatedBy    uint      `gorm:"column:created_by;not null" json:"createdBy"`
	CreatedAt    time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (NodeRelation) TableName() string { return "node_relations" }

type NodeRelationRequest struct {
	FromType     string `json:"fromType"`
	FromID       uint   `json:"fromId"`
	ToType       string `json:"toType"`
	ToID         uint   `json:"toId"`
	RelationType string `json:"relationType"`
	ContextKey   string `json:"contextKey,omitempty"`
}
