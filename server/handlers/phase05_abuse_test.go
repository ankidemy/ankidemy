package handlers

import (
	"errors"
	"net/http"
	"testing"

	"ankidemy/server/models"
	"github.com/gin-gonic/gin"
)

type fakeAuthUserStore struct {
	authenticateUser       *models.User
	authenticateErr        error
	findUserByEmailUser    *models.User
	findUserByEmailErr     error
	findUserByUsernameUser *models.User
	findUserByUsernameErr  error
	findUserByIDUser       *models.User
	findUserByIDErr        error
	createUserErr          error
}

func (f *fakeAuthUserStore) AuthenticateUserByIdentifier(identifier, password string) (*models.User, error) {
	return f.authenticateUser, f.authenticateErr
}

func (f *fakeAuthUserStore) FindUserByEmail(email string) (*models.User, error) {
	return f.findUserByEmailUser, f.findUserByEmailErr
}

func (f *fakeAuthUserStore) FindUserByUsername(username string) (*models.User, error) {
	return f.findUserByUsernameUser, f.findUserByUsernameErr
}

func (f *fakeAuthUserStore) FindUserByID(id uint) (*models.User, error) {
	return f.findUserByIDUser, f.findUserByIDErr
}

func (f *fakeAuthUserStore) CreateUser(user *models.User) error {
	return f.createUserErr
}

func TestRegisterUsesGenericConflictMessageForExistingEmail(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewAuthHandler(&fakeAuthUserStore{
		findUserByEmailUser: &models.User{ID: 1},
	})

	c, recorder := testJSONContext(http.MethodPost, "/api/auth/register", `{"username":"alice","email":"alice@example.com","password":"password123"}`)

	handler.Register(c)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", recorder.Code)
	}
	if got := recorder.Body.String(); got != `{"error":"Registration could not be completed"}` {
		t.Fatalf("unexpected response body: %s", got)
	}
}

func TestRegisterUsesGenericConflictMessageForExistingUsername(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewAuthHandler(&fakeAuthUserStore{
		findUserByEmailErr:     errors.New("user not found"),
		findUserByUsernameUser: &models.User{ID: 2},
	})

	c, recorder := testJSONContext(http.MethodPost, "/api/auth/register", `{"username":"alice","email":"alice@example.com","password":"password123"}`)

	handler.Register(c)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", recorder.Code)
	}
	if got := recorder.Body.String(); got != `{"error":"Registration could not be completed"}` {
		t.Fatalf("unexpected response body: %s", got)
	}
}

func TestRegisterUsesGenericConflictMessageForCreateRace(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewAuthHandler(&fakeAuthUserStore{
		findUserByEmailErr:    errors.New("user not found"),
		findUserByUsernameErr: errors.New("user not found"),
		createUserErr:         errors.New("duplicate key value violates unique constraint \"users_email_key\""),
	})

	c, recorder := testJSONContext(http.MethodPost, "/api/auth/register", `{"username":"alice","email":"alice@example.com","password":"password123"}`)

	handler.Register(c)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", recorder.Code)
	}
	if got := recorder.Body.String(); got != `{"error":"Registration could not be completed"}` {
		t.Fatalf("unexpected response body: %s", got)
	}
}
