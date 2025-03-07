package dao

import (
	"testing"
)

func TestInitDB(t *testing.T) {
	// Intentamos inicializar la base de datos
	db,err := InitDB()

	// Verificamos que la conexión no sea nil
	if db == nil {
		t.Fatal("La conexión a la base de datos no debería ser nil después de InitDB")
	}

	// Verificamos que la base de datos pueda responder a un ping
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("Error al obtener la conexión de base de datos: %v", err)
	}

	if err := sqlDB.Ping(); err != nil {
		t.Fatalf("Error al hacer ping a la base de datos: %v", err)
	}
}
