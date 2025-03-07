package dao

import (
	"myapp/server/modelos"
	"gorm.io/gorm"
)

// UsuarioCRUD implementa la interfaz CRUD para el modelo Usuario
type UsuarioCRUD struct {
	db *gorm.DB
}

// NewUsuarioCRUD crea una nueva instancia de UsuarioCRUD usando la conexión a la base de datos
func NewUsuarioCRUD() *UsuarioCRUD {
	var dbu = GetDB()
	dbu.AutoMigrate(&modelos.Usuario{})
	return &UsuarioCRUD{dbu}
}

// GetAll obtiene todos los usuarios de la base de datos
func (uc *UsuarioCRUD) GetAll() ([]modelos.Usuario, error) {
	var usuarios []modelos.Usuario
	err := uc.db.Find(&usuarios).Error
	return usuarios, err
}

// GetByID obtiene un usuario por su ID
func (uc *UsuarioCRUD) GetByID(id uint) (*modelos.Usuario, error) {
	var usuario modelos.Usuario
	err := uc.db.First(&usuario, id).Error
	if err != nil {
		return nil, err
	}
	return &usuario, nil
}

// verificarUsuario obtiene un usuario por su username y contraseña
func (uc *UsuarioCRUD) verificarUsuario(username string, password string) (*modelos.Usuario, error) {
	var usuario modelos.Usuario
	err := uc.db.Where("username=?",username).First(&usuario).Error
	if err != nil {
		return nil, err
	}
	if password != usuario.Contrasena {
		return nil, err
	}
	return &usuario, nil
}

// Create crea un nuevo usuario en la base de datos
func (uc *UsuarioCRUD) Create(usuario *modelos.Usuario) error {
	err := uc.db.Create(usuario).Error
	return err
}

// Update actualiza los datos de un usuario en la base de datos
func (uc *UsuarioCRUD) Update(usuario *modelos.Usuario) error {
	err := uc.db.Save(usuario).Error
	return err
}

// Delete elimina un usuario por su ID
func (uc *UsuarioCRUD) Delete(id uint) error {
	var usuario modelos.Usuario
	err := uc.db.Delete(&usuario, id).Error
	return err
}
