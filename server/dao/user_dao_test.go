package dao

import (
	"myapp/server/models"
	"testing"
)

func TestFindUserByEmail(t *testing.T) {
	db, _ := InitDB()
	usuarioCrud := NewUserDAO(db)

	// Crear usuario
	usuario := models.User{
		Username:  "testuser2",
		Email:    "test@example2.com",
		Password: "12345",
		Level:     "admin",
		FirstName: "test2",
		LastName: "user2",
	}

	err := usuarioCrud.CreateUser(&usuario)
	if err != nil {
		t.Fatalf("Error al crear usuario: %v", err)
	}

	// Obtener usuario por ID
	obtenido, err := usuarioCrud.FindUserByEmail(usuario.Email)
	if err != nil {
		t.Fatalf("Error al obtener usuario por ID: %v", err)
	}
	if obtenido.Username != usuario.Username {
		t.Errorf("El nombre de usuario obtenido no coincide: %s vs %s", obtenido.Username, usuario.Username)
	}
}

func TestCreateUser(t *testing.T) {
	db, _ := InitDB()
	usuarioCrud := NewUserDAO(db)

	// Crear usuario
	usuario := models.User{
		Username:  "testuser",
		Email:    "test@example.com",
		Password: "12345",
		Level:     "admin",
		FirstName: "test",
		LastName: "user",
	}

	err := usuarioCrud.CreateUser(&usuario)
	if err != nil {
		t.Fatalf("Error al crear usuario: %v", err)
	}
}

func TestGetAllUsers(t *testing.T) {
	db, _:= InitDB()
	usuarioCrud := NewUserDAO(db)

	// Crear usuario
	usuario := models.User{
		Username:  "testuser2",
		Email:    "test@example2.com",
		Password: "12345",
		Level:     "admin",
		FirstName: "test2",
		LastName: "user2",
	}

	err := usuarioCrud.CreateUser(&usuario)

	// Obtener todos los usuarios
	usuarios, err := usuarioCrud.GetAllUsers()
	if err != nil || len(usuarios) == 0 {
		t.Fatalf("Error al obtener usuarios o la lista está vacía: %v", err)
	}

}

