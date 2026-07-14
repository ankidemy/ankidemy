package models

// Session runtime request/response models for the server-driven session engine.

// SessionGradeRequest grades the session's current item.
type SessionGradeRequest struct {
	Quality int `json:"quality" binding:"min=0,max=5"`
	// Skip marks the current item as acknowledged without grading (frenzy only).
	Skip      bool `json:"skip"`
	TimeTaken int  `json:"timeTaken"` // seconds spent on the item
}
