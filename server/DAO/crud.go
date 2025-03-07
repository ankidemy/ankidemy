package dao

// Operaciones de CRUD para las tablas de bd
type CRUD[T any] interface {
	GetAll() ([]T, error)
	GetByID(id uint) (*T, error)
	Create(item *T) error
	Update(item *T) error
	Delete(id uint) error
}
