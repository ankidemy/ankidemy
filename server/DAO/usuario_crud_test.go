package dao

import (
	"myapp/server/modelos"
	"testing"
)

func TestUsuarioCRUD(t *testing.T) {
	usuarioCrud := NewUsuarioCRUD()

	// Crear usuario
	usuario := modelos.Usuario{
		Username:  "testuser",
		Email:    "test@example.com",
		Contrasena: "12345",
		Nivel:     "admin",
		Nombre: "test",
		Apellido: "user",
	}

	err := usuarioCrud.Create(&usuario)
	if err != nil {
		t.Fatalf("Error al crear usuario: %v", err)
	}

	// Obtener todos los usuarios
	usuarios, err := usuarioCrud.GetAll()
	if err != nil || len(usuarios) == 0 {
		t.Fatalf("Error al obtener usuarios o la lista está vacía: %v", err)
	}

	// Obtener usuario por ID
	obtenido, err := usuarioCrud.GetByID(usuario.ID)
	if err != nil {
		t.Fatalf("Error al obtener usuario por ID: %v", err)
	}
	if obtenido.Username != usuario.Username {
		t.Errorf("El nombre de usuario obtenido no coincide: %s vs %s", obtenido.Username, usuario.Username)
	}

	// Actualizar usuario
	usuario.Username = "updateduser"
	err = usuarioCrud.Update(&usuario)
	if err != nil {
		t.Fatalf("Error al actualizar usuario: %v", err)
	}

	// Verificar actualización
	obtenido, err = usuarioCrud.GetByID(usuario.ID)
	if err != nil {
		t.Fatalf("Error al obtener usuario tras actualizar: %v", err)
	}
	if obtenido.Username != "updateduser" {
		t.Errorf("El nombre de usuario no se actualizó correctamente: %s", obtenido.Username)
	}

	// Eliminar usuario
	err = usuarioCrud.Delete(usuario.ID)
	if err != nil {
		t.Fatalf("Error al eliminar usuario: %v", err)
	}

	// Verificar eliminación
	obtenido, err = usuarioCrud.GetByID(usuario.ID)
	if err == nil {
		t.Errorf("El usuario debería haber sido eliminado, pero todavía existe")
	}
}

func TestLogin(t *testing.T) {
	usuarioCrud := NewUsuarioCRUD()

	// Crear usuario
	usuario := modelos.Usuario{
		Username:  "testuser2",
		Email:    "test@example2.com",
		Contrasena: "12345",
		Nivel:     "admin",
		Nombre: "test2",
		Apellido: "user2",
	}

	err := usuarioCrud.Create(&usuario)
	if err != nil {
		t.Fatalf("Error al crear usuario: %v", err)
	}

	// Obtener usuario por ID
	obtenido, err := usuarioCrud.verificarUsuario(usuario.Username,usuario.Contrasena)
	if err != nil {
		t.Fatalf("Error al obtener usuario por ID: %v", err)
	}
	if obtenido.Username != usuario.Username {
		t.Errorf("El nombre de usuario obtenido no coincide: %s vs %s", obtenido.Username, usuario.Username)
	}
}
