package models

import (
	"gorm.io/gorm"
)

// User represents a user in the system
type User struct {
	gorm.Model
	Username  string `gorm:"column:username;unique;not null" json:"username"`
	Email     string `gorm:"column:email;unique;not null" json:"email"` 
	Password  string `gorm:"column:password;not null" json:"-"`
	Level     string `gorm:"column:level;default:user" json:"level"`
	FirstName string `gorm:"column:first_name" json:"firstName"`
	LastName  string `gorm:"column:last_name" json:"lastName"`
	IsActive  bool   `gorm:"column:is_active;default:true" json:"isActive"`
	IsAdmin   bool   `gorm:"column:is_admin;default:false" json:"isAdmin"`
}

// TableName overrides the table name to match our schema
func (User) TableName() string {
	return "users"
}

// LoginRequest defines the structure for login requests
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse defines the structure for login responses
type LoginResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	UserID  uint   `json:"user_id,omitempty"`
	Level   string `json:"level,omitempty"`
	IsAdmin bool   `json:"is_admin,omitempty"`
}
