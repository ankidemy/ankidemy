package models

import "time"

// ExternalNodeRelation is the cross-domain counterpart of NodeRelation. The
// direction flag allows either endpoint to be local, which is necessary for an
// Org link whose external target is a prerequisite of the containing local note.
type ExternalNodeRelation struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	DomainID          uint      `gorm:"column:domain_id;not null;index;uniqueIndex:idx_external_node_relation" json:"domainId"`
	LocalNodeID       uint      `gorm:"column:local_node_id;not null;index;uniqueIndex:idx_external_node_relation" json:"localNodeId"`
	LocalNodeType     string    `gorm:"column:local_node_type;not null;size:32;uniqueIndex:idx_external_node_relation" json:"localNodeType"`
	LocalDirection    string    `gorm:"column:local_direction;not null;size:4;uniqueIndex:idx_external_node_relation" json:"localDirection"` // from | to
	ExternalDomainUID string    `gorm:"column:external_domain_uid;not null;index;uniqueIndex:idx_external_node_relation" json:"externalDomainUid"`
	ExternalDomainID  *uint     `gorm:"column:external_domain_id;index" json:"externalDomainId,omitempty"`
	ExternalNodeID    uint      `gorm:"column:external_node_id;not null;uniqueIndex:idx_external_node_relation" json:"externalNodeId"`
	ExternalNodeType  string    `gorm:"column:external_node_type;not null;size:32;uniqueIndex:idx_external_node_relation" json:"externalNodeType"`
	RelationType      string    `gorm:"column:relation_type;not null;size:32;uniqueIndex:idx_external_node_relation" json:"relationType"`
	ContextKey        string    `gorm:"column:context_key;not null;default:'';uniqueIndex:idx_external_node_relation" json:"contextKey"`
	CreatedBy         uint      `gorm:"column:created_by;not null" json:"createdBy"`
	CreatedAt         time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt         time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (ExternalNodeRelation) TableName() string { return "external_node_relations" }
