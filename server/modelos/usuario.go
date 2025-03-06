package modelos

import (
	"gorm.io/gorm"
)

// Usuario representa un modelo de usuario en la base de datos
type Usuario struct {
	gorm.Model
	Username string `gorm:"unique;not null" json:"username"` 
	Correo    string `gorm:"unique;not null" json:"correo"`    
	Contrasena string `gorm:"not null" json:"-"`               
	Nivel    string `gorm:"not null" json:"nivel"`           
}


