package dao

import (
	"errors"
	"myapp/server/models"
	"strings"

	"golang.org/x/crypto/bcrypt"
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

// HashPassword hashes a plain text password
func HashPassword(password string) (string, error) {
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashedBytes), nil
}

// ComparePasswords compares a hashed password with a plain text password
func ComparePasswords(hashedPassword, plainPassword string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
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

// FindUserByUsername finds a user by their username
func (d *UserDAO) FindUserByUsername(username string) (*models.User, error) {
	var user models.User
	result := d.db.Where("username = ?", username).First(&user)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, result.Error
	}
	return &user, nil
}

// FindUserByID finds a user by ID
func (d *UserDAO) FindUserByID(id uint) (*models.User, error) {
	var user models.User
	result := d.db.First(&user, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, result.Error
	}
	return &user, nil
}

// isEmail checks if the given string is an email format
func isEmail(identifier string) bool {
	return strings.Contains(identifier, "@")
}

// AuthenticateUserByIdentifier verifies user credentials using either email or username
func (d *UserDAO) AuthenticateUserByIdentifier(identifier, password string) (*models.User, error) {
	var user *models.User
	var err error

	// Determine if identifier is email or username
	if isEmail(identifier) {
		// Try to find by email
		user, err = d.FindUserByEmail(identifier)
	} else {
		// Try to find by username
		user, err = d.FindUserByUsername(identifier)
	}

	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	// Compare provided password with stored hash
	if err := ComparePasswords(user.Password, password); err != nil {
		return nil, errors.New("invalid credentials")
	}

	return user, nil
}

// CreateUser creates a new user in the database
func (d *UserDAO) CreateUser(user *models.User) error {
	// Hash the user's password before storing
	if user.Password != "" {
		hashedPassword, err := HashPassword(user.Password)
		if err != nil {
			return err
		}
		user.Password = hashedPassword
	}

	return d.db.Create(user).Error
}

// UpdateUser updates a user's information
func (d *UserDAO) UpdateUser(user *models.User) error {
	// Don't update password if it's empty
	if user.Password == "" {
		return d.db.Model(user).Omit("Password").Updates(user).Error
	}
	
	// Hash password if it's being updated
	hashedPassword, err := HashPassword(user.Password)
	if err != nil {
		return err
	}
	user.Password = hashedPassword
	
	return d.db.Save(user).Error
}

// CreateAdminUser creates an admin user if one doesn't exist with the same email
func (d *UserDAO) CreateAdminUser(adminUser *models.User) error {
	// Check if an admin already exists
	var count int64
	d.db.Model(&models.User{}).Where("email = ?", adminUser.Email).Count(&count)
	if count > 0 {
		return nil // Admin already exists, no error
	}
	
	// Hash the password
	if adminUser.Password != "" {
		hashedPassword, err := HashPassword(adminUser.Password)
		if err != nil {
			return err
		}
		adminUser.Password = hashedPassword
	}
	
	// Set admin flag
	adminUser.IsAdmin = true
	
	return d.db.Create(adminUser).Error
}

// GetAllUsers returns all users
func (d *UserDAO) GetAllUsers() ([]models.User, error) {
	var users []models.User
	result := d.db.Find(&users)
	return users, result.Error
}

// DeleteUser deletes a user by ID
func (d *UserDAO) DeleteUser(id uint) error {
	return d.db.Delete(&models.User{}, id).Error
}

// AuthenticateUser verifies user credentials (legacy method for email-only login)
// Kept for backward compatibility
func (d *UserDAO) AuthenticateUser(email, password string) (*models.User, error) {
	user, err := d.FindUserByEmail(email)
	if err != nil {
		return nil, err
	}
	
	// Compare provided password with stored hash
	if err := ComparePasswords(user.Password, password); err != nil {
		return nil, errors.New("invalid credentials")
	}
	
	return user, nil
}
