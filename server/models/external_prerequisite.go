package models

import "time"

// ExternalPrerequisite links a node in a domain to a node in another domain.
type ExternalPrerequisite struct {
	ID uint `gorm:"primaryKey" json:"id"`

	DomainID uint   `gorm:"column:domain_id;not null;index;uniqueIndex:idx_external_prereq" json:"domainId"`
	NodeID   uint   `gorm:"column:node_id;not null;index;uniqueIndex:idx_external_prereq" json:"nodeId"`
	NodeType string `gorm:"column:node_type;not null;index;uniqueIndex:idx_external_prereq" json:"nodeType"`

	ExternalDomainUID  string   `gorm:"column:external_domain_uid;not null;index;uniqueIndex:idx_external_prereq" json:"externalDomainUid"`
	ExternalDomainID   *uint    `gorm:"column:external_domain_id" json:"externalDomainId,omitempty"`
	ExternalDomainName string   `gorm:"column:external_domain_name" json:"externalDomainName,omitempty"`
	ExternalNodeID     uint     `gorm:"column:external_node_id;not null;uniqueIndex:idx_external_prereq" json:"externalNodeId"`
	ExternalNodeType   string   `gorm:"column:external_node_type;not null;uniqueIndex:idx_external_prereq" json:"externalNodeType"`
	ExternalNodeCode   string   `gorm:"column:external_node_code" json:"externalNodeCode,omitempty"`
	ExternalNodeName   string   `gorm:"column:external_node_name" json:"externalNodeName,omitempty"`
	XPosition          *float64 `gorm:"column:x_position" json:"xPosition,omitempty"`
	YPosition          *float64 `gorm:"column:y_position" json:"yPosition,omitempty"`
	CreatedBy          uint     `gorm:"column:created_by;not null" json:"createdBy"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

func (ExternalPrerequisite) TableName() string {
	return "external_prerequisites"
}
