package models

import (
	"gorm.io/gorm"
)

// User represents a user in the system, mapped to the "usuario" table in the database
type User struct {
	gorm.Model
	Username  string `gorm:"column:username;unique;not null" json:"username"`
	Email     string `gorm:"column:email;unique;not null" json:"email"` 
	Password  string `gorm:"column:contrasena;not null" json:"-"`
	Level     string `gorm:"column:nivel" json:"level"`
	FirstName string `gorm:"column:nombre" json:"firstName"`
	LastName  string `gorm:"column:apellido" json:"lastName"`
}

// TableName overrides the table name to match our schema
func (User) TableName() string {
	return "usuario"
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
}
