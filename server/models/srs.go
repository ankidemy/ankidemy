package models

import (
	"time"
)

// NodePrerequisite represents a prerequisite relationship between nodes
type NodePrerequisite struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	NodeID           uint      `gorm:"column:node_id;not null" json:"nodeId"`
	NodeType         string    `gorm:"column:node_type;not null" json:"nodeType"` // 'definition' or 'exercise'
	PrerequisiteID   uint      `gorm:"column:prerequisite_id;not null" json:"prerequisiteId"`
	PrerequisiteType string    `gorm:"column:prerequisite_type;not null" json:"prerequisiteType"`
	Weight           float64   `gorm:"column:weight;default:1.0" json:"weight"`
	IsManual         bool      `gorm:"column:is_manual;default:false" json:"isManual"`
	CreatedAt        time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
}

func (NodePrerequisite) TableName() string {
	return "node_prerequisites"
}

// UserNodeProgress represents SRS progress for a user on a specific node
type UserNodeProgress struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	UserID            uint      `gorm:"column:user_id;not null" json:"userId"`
	NodeID            uint      `gorm:"column:node_id;not null" json:"nodeId"`
	NodeType          string    `gorm:"column:node_type;not null" json:"nodeType"`
	Status            string    `gorm:"column:status;default:fresh" json:"status"` // fresh, tackling, grasped, learned
	EasinessFactor    float64   `gorm:"column:easiness_factor;default:2.5" json:"easinessFactor"`
	IntervalDays      float64   `gorm:"column:interval_days;default:0" json:"intervalDays"`
	Repetitions       int       `gorm:"column:repetitions;default:0" json:"repetitions"`
	LastReview        *time.Time `gorm:"column:last_review" json:"lastReview"`
	NextReview        *time.Time `gorm:"column:next_review" json:"nextReview"`
	AccumulatedCredit float64   `gorm:"column:accumulated_credit;default:0" json:"accumulatedCredit"`
	CreditPostponed   bool      `gorm:"column:credit_postponed;default:false" json:"creditPostponed"`
	TotalReviews      int       `gorm:"column:total_reviews;default:0" json:"totalReviews"`
	SuccessfulReviews int       `gorm:"column:successful_reviews;default:0" json:"successfulReviews"`
	CreatedAt         time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt         time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	
	// Relationships
	User *User `gorm:"foreignKey:UserID" json:"-"`
}

func (UserNodeProgress) TableName() string {
	return "user_node_progress"
}

// StudySession represents a study session
type StudySession struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	UserID            uint      `gorm:"column:user_id;not null" json:"userId"`
	DomainID          uint      `gorm:"column:domain_id;not null" json:"domainId"`
	SessionType       string    `gorm:"column:session_type;not null" json:"sessionType"` // definition, exercise, mixed
	StartTime         time.Time `gorm:"column:start_time;autoCreateTime" json:"startTime"`
	EndTime           *time.Time `gorm:"column:end_time" json:"endTime"`
	TotalReviews      int       `gorm:"column:total_reviews;default:0" json:"totalReviews"`
	SuccessfulReviews int       `gorm:"column:successful_reviews;default:0" json:"successfulReviews"`
	
	// Relationships
	User   *User   `gorm:"foreignKey:UserID" json:"-"`
	Domain *Domain `gorm:"foreignKey:DomainID" json:"-"`
}

func (StudySession) TableName() string {
	return "study_sessions"
}

// SessionReview represents an individual review within a session
type SessionReview struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	SessionID     uint      `gorm:"column:session_id;not null" json:"sessionId"`
	NodeID        uint      `gorm:"column:node_id;not null" json:"nodeId"`
	NodeType      string    `gorm:"column:node_type;not null" json:"nodeType"`
	ReviewType    string    `gorm:"column:review_type;not null" json:"reviewType"` // explicit, implicit
	ReviewTime    time.Time `gorm:"column:review_time;autoCreateTime" json:"reviewTime"`
	Success       bool      `gorm:"column:success;not null" json:"success"`
	Quality       *int      `gorm:"column:quality" json:"quality"` // 0-5, nullable for implicit reviews
	TimeTaken     *int      `gorm:"column:time_taken" json:"timeTaken"` // in seconds
	CreditApplied float64   `gorm:"column:credit_applied;default:1.0" json:"creditApplied"`
	
	// Relationships
	Session *StudySession `gorm:"foreignKey:SessionID" json:"-"`
}

func (SessionReview) TableName() string {
	return "session_reviews"
}

// ReviewHistory represents complete review history for analytics
type ReviewHistory struct {
	ID                    uint      `gorm:"primaryKey" json:"id"`
	UserID                uint      `gorm:"column:user_id;not null" json:"userId"`
	NodeID                uint      `gorm:"column:node_id;not null" json:"nodeId"`
	NodeType              string    `gorm:"column:node_type;not null" json:"nodeType"`
	ReviewTime            time.Time `gorm:"column:review_time;autoCreateTime" json:"reviewTime"`
	ReviewType            string    `gorm:"column:review_type;not null" json:"reviewType"`
	Success               bool      `gorm:"column:success;not null" json:"success"`
	Quality               *int      `gorm:"column:quality" json:"quality"`
	TimeTaken             *int      `gorm:"column:time_taken" json:"timeTaken"`
	CreditApplied         float64   `gorm:"column:credit_applied;default:1.0" json:"creditApplied"`
	EasinessFactorBefore  *float64  `gorm:"column:easiness_factor_before" json:"easinessFactorBefore"`
	EasinessFactorAfter   *float64  `gorm:"column:easiness_factor_after" json:"easinessFactorAfter"`
	IntervalBefore        *float64  `gorm:"column:interval_before" json:"intervalBefore"`
	IntervalAfter         *float64  `gorm:"column:interval_after" json:"intervalAfter"`
	
	// Relationships
	User *User `gorm:"foreignKey:UserID" json:"-"`
}

func (ReviewHistory) TableName() string {
	return "review_history"
}

// Review request/response models
type ReviewRequest struct {
	NodeID      uint   `json:"nodeId" binding:"required"`
	NodeType    string `json:"nodeType" binding:"required"`
	Success     bool   `json:"success"`
	Quality     int    `json:"quality" binding:"min=0,max=5"`
	TimeTaken   int    `json:"timeTaken"` // in seconds
	SessionID   *uint  `json:"sessionId"`
}

type ReviewResponse struct {
	Success        bool                    `json:"success"`
	Message        string                  `json:"message"`
	UpdatedNodes   []UserNodeProgress      `json:"updatedNodes,omitempty"`
	CreditFlow     []CreditUpdate         `json:"creditFlow,omitempty"`
}

type CreditUpdate struct {
	NodeID      uint    `json:"nodeId"`
	NodeType    string  `json:"nodeType"`
	Credit      float64 `json:"credit"`
	Type        string  `json:"type"` // explicit, implicit
}

// Session request/response models
type SessionRequest struct {
	DomainID    uint   `json:"domainId" binding:"required"`
	SessionType string `json:"sessionType" binding:"required"`
}

type SessionResponse struct {
	ID                uint      `json:"id"`
	DomainID          uint      `json:"domainId"`
	SessionType       string    `json:"sessionType"`
	StartTime         time.Time `json:"startTime"`
	EndTime           *time.Time `json:"endTime"`
	TotalReviews      int       `json:"totalReviews"`
	SuccessfulReviews int       `json:"successfulReviews"`
	Duration          *int      `json:"duration"` // in seconds
}

// Progress models
type NodeProgress struct {
	NodeID            uint       `json:"nodeId"`
	NodeType          string     `json:"nodeType"`
	NodeCode          string     `json:"nodeCode"`
	NodeName          string     `json:"nodeName"`
	Status            string     `json:"status"`
	EasinessFactor    float64    `json:"easinessFactor"`
	IntervalDays      float64    `json:"intervalDays"`
	Repetitions       int        `json:"repetitions"`
	LastReview        *time.Time `json:"lastReview"`
	NextReview        *time.Time `json:"nextReview"`
	AccumulatedCredit float64    `json:"accumulatedCredit"`
	CreditPostponed   bool       `json:"creditPostponed"`
	TotalReviews      int        `json:"totalReviews"`
	SuccessfulReviews int        `json:"successfulReviews"`
	DaysUntilReview   *int       `json:"daysUntilReview"`
	IsDue             bool       `json:"isDue"`
}

type DomainProgressSummary struct {
	DomainID           uint  `json:"domainId"`
	TotalNodes         int   `json:"totalNodes"`
	FreshNodes         int   `json:"freshNodes"`
	TacklingNodes      int   `json:"tacklingNodes"`
	GraspedNodes       int   `json:"graspedNodes"`
	LearnedNodes       int   `json:"learnedNodes"`
	DueReviews         int   `json:"dueReviews"`
	CompletedToday     int   `json:"completedToday"`
	SuccessRate        float64 `json:"successRate"`
}

// Status update request
type StatusUpdateRequest struct {
	NodeID   uint   `json:"nodeId" binding:"required"`
	NodeType string `json:"nodeType" binding:"required"`
	Status   string `json:"status" binding:"required"`
}

// Prerequisite models
type PrerequisiteRequest struct {
	NodeID           uint    `json:"nodeId" binding:"required"`
	NodeType         string  `json:"nodeType" binding:"required"`
	PrerequisiteID   uint    `json:"prerequisiteId" binding:"required"`
	PrerequisiteType string  `json:"prerequisiteType" binding:"required"`
	Weight           float64 `json:"weight"`
	IsManual         bool    `json:"isManual"`
}

type PrerequisiteResponse struct {
	ID               uint    `json:"id"`
	NodeID           uint    `json:"nodeId"`
	NodeType         string  `json:"nodeType"`
	PrerequisiteID   uint    `json:"prerequisiteId"`
	PrerequisiteType string  `json:"prerequisiteType"`
	PrerequisiteCode string  `json:"prerequisiteCode"`
	PrerequisiteName string  `json:"prerequisiteName"`
	Weight           float64 `json:"weight"`
	IsManual         bool    `json:"isManual"`
}
