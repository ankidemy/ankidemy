package models

import (
	"gorm.io/gorm"
	"time"
)

// MetaExercise represents a pool of exercise versions that share code/name and prerequisites
type MetaExercise struct {
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

func (MetaExercise) TableName() string { return "meta_exercises" }

// ExerciseVersion is a read-model alias for Exercise table rows associated to a MetaExercise
// We continue to store versions in the existing exercises table, now with meta_exercise_id
// See models/exercise.go for full definition.

// MetaExerciseRequest is used to create/update a meta exercise and optionally initial versions
type MetaExerciseRequest struct {
	Code            string  `json:"code"`
	Name            string  `json:"name"`
	DomainID        uint    `json:"domainId"`
	XPosition       float64 `json:"xPosition,omitempty"`
	YPosition       float64 `json:"yPosition,omitempty"`
	PrerequisiteIDs []uint  `json:"prerequisiteIds,omitempty"`
	// Optional weights per prerequisite ID (0.01 - 1.0)
	PrerequisiteWeights map[uint]float64 `json:"prerequisiteWeights,omitempty"`
	// Optional initial version to create
	InitialVersion *ExerciseRequest `json:"initialVersion,omitempty"`
}

// ExerciseVersionRequest is used to create/update individual versions under a meta exercise
type ExerciseVersionRequest struct {
	Statement            string `json:"statement"`
	Description          string `json:"description,omitempty"`
	Notes                string `json:"notes,omitempty"`
	Hints                string `json:"hints,omitempty"`
	Verifiable           bool   `json:"verifiable,omitempty"`
	Result               string `json:"result,omitempty"`
	Difficulty           int    `json:"difficulty,omitempty"`
	StatementImagePath   string `json:"statementImagePath,omitempty"`
	DescriptionImagePath string `json:"descriptionImagePath,omitempty"`
}

// MetaExerciseResponse bundles meta exercise info, prerequisites and aggregate/version info
type MetaExerciseResponse struct {
	ID                  uint               `json:"id"`
	Code                string             `json:"code"`
	Name                string             `json:"name"`
	DomainID            uint               `json:"domainId"`
	OwnerID             uint               `json:"ownerId"`
	XPosition           float64            `json:"xPosition"`
	YPosition           float64            `json:"yPosition"`
	CreatedAt           time.Time          `json:"createdAt"`
	UpdatedAt           time.Time          `json:"updatedAt"`
	Prerequisites       []string           `json:"prerequisites,omitempty"`
	PrerequisiteWeights map[string]float64 `json:"prerequisiteWeights,omitempty"`
	VersionCount        int                `json:"versionCount"`
	Versions            []ExerciseResponse `json:"versions,omitempty"`
}
