package models

import "time"

// UserMetaExerciseStats tracks per-user stats for an exercise node (pool).
// SolvedUntil implements solved-state expiry: the exercise counts as solved
// only while SolvedUntil is in the future; afterwards it becomes eligible for
// re-selection as if unsolved.
type UserMetaExerciseStats struct {
	ID                    uint       `gorm:"primaryKey" json:"id"`
	UserID                uint       `gorm:"column:user_id;not null;index" json:"userId"`
	MetaExerciseID        uint       `gorm:"column:meta_exercise_id;not null;index" json:"metaExerciseId"`
	LastCorrectDifficulty int        `gorm:"column:last_correct_difficulty;default:1" json:"lastCorrectDifficulty"`
	SolvedUntil           *time.Time `gorm:"column:solved_until" json:"solvedUntil,omitempty"`
	UpdatedAt             time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	CreatedAt             time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (UserMetaExerciseStats) TableName() string { return "user_meta_exercise_stats" }

// UserExerciseVersionStats tracks seen/correct counts for individual versions (Exercise rows)
type UserExerciseVersionStats struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	UserID        uint       `gorm:"column:user_id;not null;index" json:"userId"`
	ExerciseID    uint       `gorm:"column:exercise_id;not null;index" json:"exerciseId"`
	SeenCount     int        `gorm:"column:seen_count;default:0" json:"seenCount"`
	CorrectCount  int        `gorm:"column:correct_count;default:0" json:"correctCount"`
	LastSeenAt    *time.Time `gorm:"column:last_seen_at" json:"lastSeenAt"`
	LastCorrectAt *time.Time `gorm:"column:last_correct_at" json:"lastCorrectAt"`
	UpdatedAt     time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	CreatedAt     time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (UserExerciseVersionStats) TableName() string { return "user_exercise_version_stats" }

// UserMetaDefinitionStats tracks per-user stats for a meta definition (pool)
type UserMetaDefinitionStats struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	UserID           uint       `gorm:"column:user_id;not null;index" json:"userId"`
	MetaDefinitionID uint       `gorm:"column:meta_definition_id;not null;index" json:"metaDefinitionId"`
	LastCorrectAt    *time.Time `gorm:"column:last_correct_at" json:"lastCorrectAt"`
	UpdatedAt        time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	CreatedAt        time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (UserMetaDefinitionStats) TableName() string { return "user_meta_definition_stats" }

// UserDefinitionVersionStats tracks seen/correct counts for individual versions (Definition rows)
type UserDefinitionVersionStats struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	UserID        uint       `gorm:"column:user_id;not null;index" json:"userId"`
	DefinitionID  uint       `gorm:"column:definition_id;not null;index" json:"definitionId"`
	SeenCount     int        `gorm:"column:seen_count;default:0" json:"seenCount"`
	CorrectCount  int        `gorm:"column:correct_count;default:0" json:"correctCount"`
	LastSeenAt    *time.Time `gorm:"column:last_seen_at" json:"lastSeenAt"`
	LastCorrectAt *time.Time `gorm:"column:last_correct_at" json:"lastCorrectAt"`
	UpdatedAt     time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	CreatedAt     time.Time  `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (UserDefinitionVersionStats) TableName() string { return "user_definition_version_stats" }
