package models

import "time"

// NodeGroup represents a named group of nodes in a domain.
type NodeGroup struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DomainID  uint      `gorm:"not null;index" json:"domainId"`
	Name      string    `gorm:"not null" json:"name"`
	IsExact   bool      `gorm:"not null;default:false" json:"isExact"`
	XPosition float64   `gorm:"column:x_position" json:"xPosition,omitempty"`
	YPosition float64   `gorm:"column:y_position" json:"yPosition,omitempty"`
	CreatedBy uint      `gorm:"column:created_by;not null" json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (NodeGroup) TableName() string {
	return "node_groups"
}

// NodeGroupSeed tracks the explicit seed nodes used to build a group.
type NodeGroupSeed struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	GroupID   uint      `gorm:"not null;index;uniqueIndex:idx_group_seed" json:"groupId"`
	NodeID    uint      `gorm:"not null;uniqueIndex:idx_group_seed" json:"nodeId"`
	NodeType  string    `gorm:"not null;uniqueIndex:idx_group_seed" json:"nodeType"`
	CreatedAt time.Time `json:"createdAt"`
}

func (NodeGroupSeed) TableName() string {
	return "node_group_seeds"
}

// NodeGroupMember stores explicit membership when a group is pinned (exact membership).
type NodeGroupMember struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	GroupID   uint      `gorm:"not null;index;uniqueIndex:idx_group_member" json:"groupId"`
	NodeID    uint      `gorm:"not null;uniqueIndex:idx_group_member" json:"nodeId"`
	NodeType  string    `gorm:"not null;uniqueIndex:idx_group_member" json:"nodeType"`
	CreatedAt time.Time `json:"createdAt"`
}

func (NodeGroupMember) TableName() string {
	return "node_group_members"
}

// UserGroupState stores per-user collapse state for a group.
type UserGroupState struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;index;uniqueIndex:idx_user_group_state" json:"userId"`
	GroupID   uint      `gorm:"not null;index;uniqueIndex:idx_user_group_state" json:"groupId"`
	Collapsed bool      `gorm:"not null;default:false" json:"collapsed"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (UserGroupState) TableName() string {
	return "user_group_states"
}
