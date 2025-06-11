// models/definition.go - Updated without GORM associations

package models

import (
	"time"
	"gorm.io/gorm"
)

// Definition represents a concept or definition
type Definition struct {
	gorm.Model
	Code        string    `gorm:"column:code;not null" json:"code"`
	Name        string    `gorm:"column:name;not null" json:"name"`
	Description string    `gorm:"column:description;not null" json:"description"`
	Notes       string    `gorm:"column:notes" json:"notes"`
	DomainID    uint      `gorm:"column:domain_id;not null" json:"domainId"`
	OwnerID     uint      `gorm:"column:owner_id;not null" json:"ownerId"`
	XPosition   float64   `gorm:"column:x_position;default:0" json:"xPosition"`
	YPosition   float64   `gorm:"column:y_position;default:0" json:"yPosition"`
	CreatedAt   time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	
	// Relationships
	Domain     *Domain     `gorm:"foreignKey:DomainID" json:"-"`
	Owner      *User       `gorm:"foreignKey:OwnerID" json:"-"`
	References []Reference `gorm:"foreignKey:DefinitionID" json:"references,omitempty"`
	
	// Prerequisites are now managed via node_prerequisites table
	// No GORM many-to-many association
}

// TableName overrides the table name
func (Definition) TableName() string {
	return "definitions"
}

// Reference represents a reference for a definition
type Reference struct {
	gorm.Model
	DefinitionID uint   `gorm:"column:definition_id;not null" json:"definitionId"`
	Reference    string `gorm:"column:reference;not null" json:"reference"`
	
	// Relationships
	Definition *Definition `gorm:"foreignKey:DefinitionID" json:"-"`
}

// TableName overrides the table name
func (Reference) TableName() string {
	return "definition_references"
}

// DefinitionRequest is used for creating or updating definitions
type DefinitionRequest struct {
	Code           string   `json:"code"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Notes          string   `json:"notes,omitempty"`
	References     []string `json:"references,omitempty"`
	PrerequisiteIDs []uint  `json:"prerequisiteIds,omitempty"`
	DomainID       uint     `json:"domainId"`
	XPosition      float64  `json:"xPosition,omitempty"`
	YPosition      float64  `json:"yPosition,omitempty"`
}

// DefinitionResponse is used for returning definitions
type DefinitionResponse struct {
	ID            uint      `json:"id"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Notes         string    `json:"notes,omitempty"`
	References    []string  `json:"references,omitempty"`
	Prerequisites []string  `json:"prerequisites,omitempty"` // Just the codes
	DomainID      uint      `json:"domainId"`
	OwnerID       uint      `json:"ownerId"`
	XPosition     float64   `json:"xPosition,omitempty"`
	YPosition     float64   `json:"yPosition,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// DefinitionWithPrerequisites holds a definition with its prerequisite data
type DefinitionWithPrerequisites struct {
	Definition
	PrerequisiteCodes []string `json:"prerequisiteCodes"`
}
