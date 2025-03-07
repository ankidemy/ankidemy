package modelos

import (
	"gorm.io/gorm"
)

// Usuario representa un modelo de usuario en la base de datos
type Usuario struct {
	gorm.Model
	Username string 
	Email    string     
	Contrasena string                
	Nivel    string 
	Nombre string
	Apellido string
}


