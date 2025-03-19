package models

import (
	"time"
)

// UserDomainProgress represents a user's progress in a domain
type UserDomainProgress struct {
	UserID         uint      `gorm:"column:user_id;primaryKey" json:"userId"`
	DomainID       uint      `gorm:"column:domain_id;primaryKey" json:"domainId"`
	EnrollmentDate time.Time `gorm:"column:enrollment_date;autoCreateTime" json:"enrollmentDate"`
	Progress       float64   `gorm:"column:progress;default:0" json:"progress"`
	LastActivity   time.Time `gorm:"column:last_activity;autoUpdateTime" json:"lastActivity"`
	
	// Relationships
	User   *User   `gorm:"foreignKey:UserID" json:"-"`
	Domain *Domain `gorm:"foreignKey:DomainID" json:"-"`
}

// TableName overrides the table name
func (UserDomainProgress) TableName() string {
	return "user_domain_progress"
}

// UserDefinitionProgress represents a user's progress with a definition (Anki-like spaced repetition)
type UserDefinitionProgress struct {
	UserID         uint      `gorm:"column:user_id;primaryKey" json:"userId"`
	DefinitionID   uint      `gorm:"column:definition_id;primaryKey" json:"definitionId"`
	Learned        bool      `gorm:"column:learned;default:false" json:"learned"`
	LastReview     time.Time `gorm:"column:last_review" json:"lastReview"`
	NextReview     time.Time `gorm:"column:next_review" json:"nextReview"`
	EasinessFactor float64   `gorm:"column:easiness_factor;default:2.5" json:"easinessFactor"`
	IntervalDays   int       `gorm:"column:interval_days;default:0" json:"intervalDays"`
	Repetitions    int       `gorm:"column:repetitions;default:0" json:"repetitions"`
	
	// Relationships
	User       *User       `gorm:"foreignKey:UserID" json:"-"`
	Definition *Definition `gorm:"foreignKey:DefinitionID" json:"-"`
}

// TableName overrides the table name
func (UserDefinitionProgress) TableName() string {
	return "user_definition_progress"
}

// UserExerciseProgress represents a user's progress with an exercise
type UserExerciseProgress struct {
	UserID      uint      `gorm:"column:user_id;primaryKey" json:"userId"`
	ExerciseID  uint      `gorm:"column:exercise_id;primaryKey" json:"exerciseId"`
	Completed   bool      `gorm:"column:completed;default:false" json:"completed"`
	Correct     bool      `gorm:"column:correct;default:false" json:"correct"`
	Attempts    int       `gorm:"column:attempts;default:0" json:"attempts"`
	LastAttempt time.Time `gorm:"column:last_attempt" json:"lastAttempt"`
	
	// Relationships
	User     *User     `gorm:"foreignKey:UserID" json:"-"`
	Exercise *Exercise `gorm:"foreignKey:ExerciseID" json:"-"`
}

// TableName overrides the table name
func (UserExerciseProgress) TableName() string {
	return "user_exercise_progress"
}

// ReviewResult represents possible review outcomes for spaced repetition
type ReviewResult string

const (
	ReviewAgain ReviewResult = "again"
	ReviewHard  ReviewResult = "hard"
	ReviewGood  ReviewResult = "good"
	ReviewEasy  ReviewResult = "easy"
)

// ReviewRequest is the request body for submitting a review
type ReviewRequest struct {
	DefinitionID uint         `json:"definitionId"`
	Result       ReviewResult `json:"result"`
	TimeTaken    int          `json:"timeTaken"` // in seconds
}

// ExerciseAttemptRequest is the request body for submitting an exercise attempt
type ExerciseAttemptRequest struct {
	ExerciseID uint   `json:"exerciseId"`
	Answer     string `json:"answer"`
	TimeTaken  int    `json:"timeTaken"` // in seconds
}

// ExerciseAttemptResponse is the response body for an exercise attempt
type ExerciseAttemptResponse struct {
	Correct bool   `json:"correct"`
	Message string `json:"message,omitempty"`
}
