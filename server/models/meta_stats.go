package models

import "time"

// UserMetaExerciseStats tracks per-user stats for a meta exercise (pool)
type UserMetaExerciseStats struct {
    ID                   uint      `gorm:"primaryKey" json:"id"`
    UserID               uint      `gorm:"column:user_id;not null;index" json:"userId"`
    MetaExerciseID       uint      `gorm:"column:meta_exercise_id;not null;index" json:"metaExerciseId"`
    LastCorrectDifficulty int      `gorm:"column:last_correct_difficulty;default:1" json:"lastCorrectDifficulty"`
    UpdatedAt            time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
    CreatedAt            time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (UserMetaExerciseStats) TableName() string { return "user_meta_exercise_stats" }

// UserExerciseVersionStats tracks seen/correct counts for individual versions (Exercise rows)
type UserExerciseVersionStats struct {
    ID         uint      `gorm:"primaryKey" json:"id"`
    UserID     uint      `gorm:"column:user_id;not null;index" json:"userId"`
    ExerciseID uint      `gorm:"column:exercise_id;not null;index" json:"exerciseId"`
    SeenCount  int       `gorm:"column:seen_count;default:0" json:"seenCount"`
    CorrectCount int     `gorm:"column:correct_count;default:0" json:"correctCount"`
    LastSeenAt *time.Time `gorm:"column:last_seen_at" json:"lastSeenAt"`
    LastCorrectAt *time.Time `gorm:"column:last_correct_at" json:"lastCorrectAt"`
    UpdatedAt  time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
    CreatedAt  time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (UserExerciseVersionStats) TableName() string { return "user_exercise_version_stats" }

