package handlers

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ankidemy/server/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type fakeProgressStore struct {
	trackDefinitionReviewCalled bool
	updateDomainProgressCalled  bool
	trackExerciseAttemptCalled  bool
}

func (f *fakeProgressStore) GetUserDomainProgress(userID uint) ([]models.UserDomainProgress, error) {
	return nil, nil
}

func (f *fakeProgressStore) GetUserDefinitionProgress(userID, domainID uint) ([]models.UserDefinitionProgress, error) {
	return nil, nil
}

func (f *fakeProgressStore) GetUserExerciseProgress(userID, domainID uint) ([]models.UserExerciseProgress, error) {
	return nil, nil
}

func (f *fakeProgressStore) TrackDefinitionReview(userID, definitionID uint, result models.ReviewResult, timeTaken int) error {
	f.trackDefinitionReviewCalled = true
	return nil
}

func (f *fakeProgressStore) UpdateDomainProgress(userID, domainID uint) error {
	f.updateDomainProgressCalled = true
	return nil
}

func (f *fakeProgressStore) TrackExerciseAttempt(userID, exerciseID uint, correct bool, timeTaken int) error {
	f.trackExerciseAttemptCalled = true
	return nil
}

func (f *fakeProgressStore) GetDefinitionsForReview(userID, domainID uint, limit int) ([]models.Definition, error) {
	return nil, nil
}

func (f *fakeProgressStore) EndStudySession(sessionID uint) error {
	return nil
}

func (f *fakeProgressStore) GetStudySessions(userID uint) ([]models.StudySession, error) {
	return nil, nil
}

func (f *fakeProgressStore) GetSessionDetails(sessionID uint) (*models.StudySession, []models.SessionDefinition, []models.SessionExercise, error) {
	return nil, nil, nil, nil
}

type fakeDefinitionFinder struct {
	definition *models.Definition
	err        error
}

func (f fakeDefinitionFinder) FindByID(id uint) (*models.Definition, error) {
	return f.definition, f.err
}

type fakeExerciseStore struct {
	exercise     *models.Exercise
	err          error
	verifyCalled bool
	verifyResult bool
	verifyErr    error
}

func (f *fakeExerciseStore) FindByID(id uint) (*models.Exercise, error) {
	return f.exercise, f.err
}

func (f *fakeExerciseStore) VerifyExerciseAnswer(exerciseID uint, answer string) (bool, error) {
	f.verifyCalled = true
	return f.verifyResult, f.verifyErr
}

type fakeSRSService struct {
	submitReviewCalled     bool
	getDueReviewsCalled    bool
	updateNodeStatusCalled bool
}

func (f *fakeSRSService) SubmitReview(userID uint, request *models.ReviewRequest) (*models.ReviewResponse, error) {
	f.submitReviewCalled = true
	return &models.ReviewResponse{Success: true}, nil
}

func (f *fakeSRSService) GetDueReviews(userID uint, domainID uint, nodeType string, requestID string) ([]models.NodeProgress, error) {
	f.getDueReviewsCalled = true
	return nil, nil
}

func (f *fakeSRSService) GetDueReviewsCompact(userID uint, domainID uint, nodeType string, requestID string) ([]models.DueReviewCompact, error) {
	return nil, nil
}

func (f *fakeSRSService) GetReviewQueue(userID uint, domainID uint, sessionType string, mode string, exercisesPerDefinition int, requestID string) ([]models.ReviewQueueItem, error) {
	return nil, nil
}

func (f *fakeSRSService) UpdateNodeStatus(userID uint, nodeID uint, nodeType string, status string) error {
	f.updateNodeStatusCalled = true
	return nil
}

func (f *fakeSRSService) InvalidateDomainReviewCaches(domainID uint) {}

type fakeSRSDAO struct {
	createSessionCalled bool
}

func (f *fakeSRSDAO) GetReviewHistory(userID uint, nodeID *uint, nodeType *string, limit int) ([]models.ReviewHistory, error) {
	return nil, nil
}

func (f *fakeSRSDAO) GetDomainProgress(userID uint, domainID uint) ([]models.NodeProgress, error) {
	return nil, nil
}

func (f *fakeSRSDAO) GetDomainStats(userID uint, domainID uint, requestID string) (*models.DomainProgressSummary, error) {
	return &models.DomainProgressSummary{}, nil
}

func (f *fakeSRSDAO) CreateSession(session *models.StudySession) error {
	f.createSessionCalled = true
	return nil
}

func (f *fakeSRSDAO) GetSession(sessionID uint) (*models.StudySession, error) {
	return nil, nil
}

func (f *fakeSRSDAO) EndSession(sessionID uint) error {
	return nil
}

func (f *fakeSRSDAO) GetUserSessions(userID uint, limit int) ([]models.StudySession, error) {
	return nil, nil
}

func (f *fakeSRSDAO) CreatePrerequisite(prerequisite *models.NodePrerequisite) error {
	return nil
}

func (f *fakeSRSDAO) GetPrerequisitesByDomain(domainID uint) ([]models.NodePrerequisite, error) {
	return nil, nil
}

type fakeNodeAccessResolver struct {
	resolved map[string]*resolvedNodeAccess
	err      error
}

func (f fakeNodeAccessResolver) ResolveNodeAccess(nodeType string, nodeID uint) (*resolvedNodeAccess, error) {
	if f.err != nil {
		return nil, f.err
	}
	key := fmt.Sprintf("%s:%d", nodeType, nodeID)
	resolved, ok := f.resolved[key]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return resolved, nil
}

func testJSONContext(method, target, body string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(method, target, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return c, recorder
}

func TestProgressReviewDefinitionRejectsUnauthorizedBeforeSideEffects(t *testing.T) {
	gin.SetMode(gin.TestMode)

	progress := &fakeProgressStore{}
	handler := &ProgressHandler{
		progressDAO: progress,
		domainDAO: fakeDomainFinder{
			domain: &models.Domain{ID: 42, OwnerID: 11, Privacy: "private"},
		},
		definitionDAO: fakeDefinitionFinder{
			definition: &models.Definition{DomainID: 42},
		},
		permissionDAO: fakePermissionLookup{},
	}

	c, recorder := testJSONContext(http.MethodPost, "/api/progress/definitions/9/review", `{"result":"good","timeTaken":3}`)
	c.Params = gin.Params{{Key: "id", Value: "9"}}
	c.Set("userID", uint(7))

	handler.ReviewDefinition(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	if progress.trackDefinitionReviewCalled {
		t.Fatal("expected definition review tracking to be skipped")
	}
	if progress.updateDomainProgressCalled {
		t.Fatal("expected domain progress update to be skipped")
	}
}

func TestProgressAttemptExerciseRejectsUnauthorizedBeforeSideEffects(t *testing.T) {
	gin.SetMode(gin.TestMode)

	progress := &fakeProgressStore{}
	exercises := &fakeExerciseStore{
		exercise: &models.Exercise{DomainID: 42, Verifiable: true},
	}
	handler := &ProgressHandler{
		progressDAO: progress,
		domainDAO: fakeDomainFinder{
			domain: &models.Domain{ID: 42, OwnerID: 11, Privacy: "private"},
		},
		exerciseDAO:   exercises,
		permissionDAO: fakePermissionLookup{},
	}

	c, recorder := testJSONContext(http.MethodPost, "/api/progress/exercises/9/attempt", `{"answer":"42","timeTaken":5}`)
	c.Params = gin.Params{{Key: "id", Value: "9"}}
	c.Set("userID", uint(7))

	handler.AttemptExercise(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	if exercises.verifyCalled {
		t.Fatal("expected answer verification to be skipped")
	}
	if progress.trackExerciseAttemptCalled {
		t.Fatal("expected exercise attempt tracking to be skipped")
	}
	if progress.updateDomainProgressCalled {
		t.Fatal("expected domain progress update to be skipped")
	}
}

func TestSRSSubmitReviewRejectsViewerBeforeServiceCall(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := &fakeSRSService{}
	handler := &SRSHandler{
		domainDAO: fakeDomainFinder{
			domain: &models.Domain{ID: 42, OwnerID: 11, Privacy: "private"},
		},
		srsService:    service,
		permissionDAO: fakePermissionLookup{role: "viewer", exists: true},
		nodeAccessResolver: fakeNodeAccessResolver{
			resolved: map[string]*resolvedNodeAccess{
				"meta_definition:9": {DomainID: 42},
			},
		},
	}

	c, recorder := testJSONContext(http.MethodPost, "/api/srs/reviews", `{"nodeId":9,"nodeType":"definition","success":true,"quality":4}`)
	c.Set("userID", uint(7))

	handler.SubmitReview(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	if service.submitReviewCalled {
		t.Fatal("expected SubmitReview service call to be skipped")
	}
}

func TestSRSUpdateNodeStatusRejectsViewerBeforeServiceCall(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := &fakeSRSService{}
	handler := &SRSHandler{
		domainDAO: fakeDomainFinder{
			domain: &models.Domain{ID: 42, OwnerID: 11, Privacy: "private"},
		},
		srsService:    service,
		permissionDAO: fakePermissionLookup{role: "viewer", exists: true},
		nodeAccessResolver: fakeNodeAccessResolver{
			resolved: map[string]*resolvedNodeAccess{
				"meta_exercise:9": {DomainID: 42},
			},
		},
	}

	c, recorder := testJSONContext(http.MethodPut, "/api/srs/nodes/status", `{"nodeId":9,"nodeType":"exercise","status":"grasped"}`)
	c.Set("userID", uint(7))

	handler.UpdateNodeStatus(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	if service.updateNodeStatusCalled {
		t.Fatal("expected UpdateNodeStatus service call to be skipped")
	}
}

func TestSRSGetDueReviewsRejectsUnauthorizedBeforeServiceCall(t *testing.T) {
	gin.SetMode(gin.TestMode)

	service := &fakeSRSService{}
	handler := &SRSHandler{
		domainDAO: fakeDomainFinder{
			domain: &models.Domain{ID: 42, OwnerID: 11, Privacy: "private"},
		},
		srsService:    service,
		permissionDAO: fakePermissionLookup{},
	}

	c, recorder := testJSONContext(http.MethodGet, "/api/srs/domains/42/due", "")
	c.Params = gin.Params{{Key: "domainId", Value: "42"}}
	c.Set("userID", uint(7))

	handler.GetDueReviews(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	if service.getDueReviewsCalled {
		t.Fatal("expected GetDueReviews service call to be skipped")
	}
}

func TestSRSStartSessionRejectsUnauthorizedBeforeCreateSession(t *testing.T) {
	gin.SetMode(gin.TestMode)

	store := &fakeSRSDAO{}
	handler := &SRSHandler{
		domainDAO: fakeDomainFinder{
			domain: &models.Domain{ID: 42, OwnerID: 11, Privacy: "private"},
		},
		srsDao:        store,
		permissionDAO: fakePermissionLookup{},
	}

	c, recorder := testJSONContext(http.MethodPost, "/api/srs/sessions", `{"domainId":42,"sessionType":"mixed"}`)
	c.Set("userID", uint(7))

	handler.StartSession(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	if store.createSessionCalled {
		t.Fatal("expected session creation to be skipped")
	}
}
