package models

import (
	"time"
)

// StudySession represents a learning session
type StudySession struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"column:user_id;not null" json:"userId"`
	DomainID  uint      `gorm:"column:domain_id;not null" json:"domainId"`
	StartTime time.Time `gorm:"column:start_time;autoCreateTime" json:"startTime"`
	EndTime   time.Time `gorm:"column:end_time" json:"endTime"`
	
	// Relationships
	User   *User   `gorm:"foreignKey:UserID" json:"-"`
	Domain *Domain `gorm:"foreignKey:DomainID" json:"-"`
}

// TableName overrides the table name
func (StudySession) TableName() string {
	return "study_sessions"
}

// SessionDefinition represents a definition reviewed during a study session
type SessionDefinition struct {
	SessionID    uint   `gorm:"column:session_id;primaryKey" json:"sessionId"`
	DefinitionID uint   `gorm:"column:definition_id;primaryKey" json:"definitionId"`
	ReviewResult string `gorm:"column:review_result" json:"reviewResult"`
	TimeTaken    int    `gorm:"column:time_taken" json:"timeTaken"` // in seconds
	
	// Relationships
	Session    *StudySession `gorm:"foreignKey:SessionID" json:"-"`
	Definition *Definition   `gorm:"foreignKey:DefinitionID" json:"definition,omitempty"`
}

// TableName overrides the table name
func (SessionDefinition) TableName() string {
	return "session_definitions"
}

// SessionExercise represents an exercise completed during a study session
type SessionExercise struct {
	SessionID  uint  `gorm:"column:session_id;primaryKey" json:"sessionId"`
	ExerciseID uint  `gorm:"column:exercise_id;primaryKey" json:"exerciseId"`
	Completed  bool  `gorm:"column:completed;default:false" json:"completed"`
	Correct    bool  `gorm:"column:correct;default:false" json:"correct"`
	TimeTaken  int   `gorm:"column:time_taken" json:"timeTaken"` // in seconds
	
	// Relationships
	Session  *StudySession `gorm:"foreignKey:SessionID" json:"-"`
	Exercise *Exercise     `gorm:"foreignKey:ExerciseID" json:"exercise,omitempty"`
}

// TableName overrides the table name
func (SessionExercise) TableName() string {
	return "session_exercises"
}

// StudySessionResponse provides session information with statistics
type StudySessionResponse struct {
	ID              uint      `json:"id"`
	StartTime       time.Time `json:"startTime"`
	EndTime         time.Time `json:"endTime"`
	Duration        int       `json:"duration"` // in seconds
	DomainID        uint      `json:"domainId"`
	DomainName      string    `json:"domainName"`
	DefinitionsReviewCount int `json:"definitionsReviewCount"`
	ExercisesCompletedCount int `json:"exercisesCompletedCount"`
	CorrectExercisesCount int `json:"correctExercisesCount"`
}

// CreateSessionRequest is used for starting a new study session
type CreateSessionRequest struct {
	DomainID uint `json:"domainId"`
}

// SessionDetailsResponse provides detailed session information
type SessionDetailsResponse struct {
	Session    StudySessionResponse `json:"session"`
	Definitions []struct {
		ID          uint   `json:"id"`
		Code        string `json:"code"`
		Name        string `json:"name"`
		ReviewResult string `json:"reviewResult"`
		TimeTaken   int    `json:"timeTaken"`
	} `json:"definitions"`
	Exercises []struct {
		ID        uint   `json:"id"`
		Code      string `json:"code"`
		Name      string `json:"name"`
		Completed bool   `json:"completed"`
		Correct   bool   `json:"correct"`
		TimeTaken int    `json:"timeTaken"`
	} `json:"exercises"`
}
