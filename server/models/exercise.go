// models/exercise.go - Updated without GORM associations

package models

import (
	"gorm.io/gorm"
	"time"
)

// Exercise represents a practice exercise
type Exercise struct {
	gorm.Model
	// Code and Name are retained for backward compatibility and quick queries,
	// but should mirror the owning MetaExercise values.
	Code                 string    `gorm:"column:code;not null" json:"code"`
	Name                 string    `gorm:"column:name;not null" json:"name"`
	Statement            string    `gorm:"column:statement;not null" json:"statement"`
	Description          string    `gorm:"column:description" json:"description"`
	Notes                string    `gorm:"column:notes" json:"notes"`
	Hints                string    `gorm:"column:hints" json:"hints"`
	StatementImagePath   string    `gorm:"column:statement_image_path" json:"statementImagePath,omitempty"`
	DescriptionImagePath string    `gorm:"column:description_image_path" json:"descriptionImagePath,omitempty"`
	DomainID             uint      `gorm:"column:domain_id;not null" json:"domainId"`
	OwnerID              uint      `gorm:"column:owner_id;not null" json:"ownerId"`
	MetaExerciseID       uint      `gorm:"column:meta_exercise_id;not null;index" json:"metaExerciseId"`
	Verifiable           bool      `gorm:"column:verifiable;default:false" json:"verifiable"`
	Result               string    `gorm:"column:result" json:"result"`
	Difficulty           int       `gorm:"column:difficulty" json:"difficulty"`
	XPosition            float64   `gorm:"column:x_position;default:0" json:"xPosition"`
	YPosition            float64   `gorm:"column:y_position;default:0" json:"yPosition"`
	CreatedAt            time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt            time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`

	// Relationships
	Domain *Domain `gorm:"foreignKey:DomainID" json:"-"`
	Owner  *User   `gorm:"foreignKey:OwnerID" json:"-"`
	// Meta owner
	// No GORM relation here to keep model minimal; DAO handles joins

	// Prerequisites are now managed via node_prerequisites table
	// No GORM many-to-many association
}

// TableName overrides the table name
func (Exercise) TableName() string {
	return "exercises"
}

// ExerciseRequest is used for creating or updating exercises
type ExerciseRequest struct {
	Code                 string `json:"code"`
	Name                 string `json:"name"`
	Statement            string `json:"statement"`
	Description          string `json:"description,omitempty"`
	StatementImagePath   string `json:"statementImagePath,omitempty"`
	DescriptionImagePath string `json:"descriptionImagePath,omitempty"`
	Notes                string `json:"notes,omitempty"`
	Hints                string `json:"hints,omitempty"`
	DomainID             uint   `json:"domainId"`
	MetaExerciseID       uint   `json:"metaExerciseId,omitempty"`
	Verifiable           bool   `json:"verifiable,omitempty"`
	Result               string `json:"result,omitempty"`
	Difficulty           int    `json:"difficulty,omitempty"`
	PrerequisiteIDs      []uint `json:"prerequisiteIds,omitempty"`
	// Optional weights for each prerequisite ID (0.01 - 1.0). If omitted, defaults to 1.0 on server.
	PrerequisiteWeights map[uint]float64 `json:"prerequisiteWeights,omitempty"`
	XPosition           float64          `json:"xPosition,omitempty"`
	YPosition           float64          `json:"yPosition,omitempty"`
}

// ExerciseResponse is used for returning exercises
type ExerciseResponse struct {
	ID                   uint     `json:"id"`
	Code                 string   `json:"code"`
	Name                 string   `json:"name"`
	Statement            string   `json:"statement"`
	Description          string   `json:"description,omitempty"`
	StatementImagePath   string   `json:"statementImagePath,omitempty"`
	DescriptionImagePath string   `json:"descriptionImagePath,omitempty"`
	Notes                string   `json:"notes,omitempty"`
	Hints                string   `json:"hints,omitempty"`
	DomainID             uint     `json:"domainId"`
	OwnerID              uint     `json:"ownerId"`
	Verifiable           bool     `json:"verifiable"`
	Result               string   `json:"result,omitempty"`
	Difficulty           int      `json:"difficulty,omitempty"`
	Prerequisites        []string `json:"prerequisites,omitempty"` // Just the codes
	// Map of prerequisite code -> weight (0.01 - 1.0)
	PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
	XPosition           float64            `json:"xPosition,omitempty"`
	YPosition           float64            `json:"yPosition,omitempty"`
	CreatedAt           time.Time          `json:"createdAt"`
	UpdatedAt           time.Time          `json:"updatedAt"`
}

// ExerciseSelectionResponse wraps a chosen exercise version for definition testing.
type ExerciseSelectionResponse struct {
	MetaExerciseID   uint             `json:"metaExerciseId"`
	MetaExerciseCode string           `json:"metaExerciseCode"`
	MetaExerciseName string           `json:"metaExerciseName"`
	Version          ExerciseResponse `json:"version"`
}

// ExerciseWithPrerequisites holds an exercise with its prerequisite data
type ExerciseWithPrerequisites struct {
	Exercise
	PrerequisiteCodes []string `json:"prerequisiteCodes"`
}
