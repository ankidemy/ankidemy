package dao

import (
	"errors"
	"myapp/server/models"

	"gorm.io/gorm"
)

// UserDAO handles database operations for users
type UserDAO struct {
	db *gorm.DB
}

// NewUserDAO creates a new UserDAO instance
func NewUserDAO(db *gorm.DB) *UserDAO {
	return &UserDAO{db: db}
}

// FindUserByEmail finds a user by their email address
func (d *UserDAO) FindUserByEmail(email string) (*models.User, error) {
	var user models.User
	result := d.db.Where("email = ?", email).First(&user)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, result.Error
	}
	return &user, nil
}

// CreateUser creates a new user in the database
func (d *UserDAO) CreateUser(user *models.User) error {
	return d.db.Create(user).Error
}

// CreateAdminUser creates an admin user if one doesn't exist with the same email
func (d *UserDAO) CreateAdminUser(adminUser *models.User) error {
	var count int64
	d.db.Model(&models.User{}).Where("email = ?", adminUser.Email).Count(&count)
	if count == 0 {
		return d.db.Create(adminUser).Error
	}
	return nil // Admin already exists, no error
}

// GetAllUsers returns all users
func (d *UserDAO) GetAllUsers() ([]models.User, error) {
	var users []models.User
	result := d.db.Find(&users)
	return users, result.Error
}
