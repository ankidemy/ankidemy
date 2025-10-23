package models

import (
	"time"
	"gorm.io/gorm"
)

// MetaDefinition represents a pool of definition versions that share code/name and prerequisites
type MetaDefinition struct {
	gorm.Model
	Code      string    `gorm:"column:code;not null" json:"code"`
	Name      string    `gorm:"column:name;not null" json:"name"`
	DomainID  uint      `gorm:"column:domain_id;not null" json:"domainId"`
	OwnerID   uint      `gorm:"column:owner_id;not null" json:"ownerId"`
	XPosition float64   `gorm:"column:x_position;default:0" json:"xPosition"`
	YPosition float64   `gorm:"column:y_position;default:0" json:"yPosition"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (MetaDefinition) TableName() string { return "meta_definitions" }

// DefinitionVersion is a read-model alias for Definition table rows associated to a MetaDefinition
// We continue to store versions in the existing definitions table, now with meta_definition_id
// See models/definition.go for full definition.

// MetaDefinitionRequest is used to create/update a meta definition and optionally initial versions
type MetaDefinitionRequest struct {
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	DomainID    uint     `json:"domainId"`
	XPosition   float64  `json:"xPosition,omitempty"`
	YPosition   float64  `json:"yPosition,omitempty"`
	PrerequisiteIDs []uint `json:"prerequisiteIds,omitempty"`
	// Optional weights per prerequisite ID (0.01 - 1.0)
	PrerequisiteWeights map[uint]float64 `json:"prerequisiteWeights,omitempty"`
	// Optional initial version to create
	InitialVersion *DefinitionVersionRequest `json:"initialVersion,omitempty"`
}

// DefinitionVersionRequest is used to create/update individual versions under a meta definition
type DefinitionVersionRequest struct {
	Prompt      string   `json:"prompt"`
	Type        string   `json:"type,omitempty"` // default "open_ended"
	Description string   `json:"description,omitempty"`
	Notes       string   `json:"notes,omitempty"`
	References  []string `json:"references,omitempty"`
}

// MetaDefinitionResponse bundles meta definition info, prerequisites and aggregate/version info
type MetaDefinitionResponse struct {
	ID         uint      `json:"id"`
	Code       string    `json:"code"`
	Name       string    `json:"name"`
	DomainID   uint      `json:"domainId"`
	OwnerID    uint      `json:"ownerId"`
	XPosition  float64   `json:"xPosition"`
	YPosition  float64   `json:"yPosition"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
	VersionCount int `json:"versionCount"`
	Versions []DefinitionResponse `json:"versions,omitempty"`
}
