package handlers

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ankidemy/server/models"
	"ankidemy/server/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

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

func (f *fakeSRSService) DeriveExerciseStatusesForDomain(domainID uint) error { return nil }

func (f *fakeSRSService) StartEngineSession(userID uint, request *models.SessionRequest, requestID string) (*services.SessionEngineState, error) {
	return &services.SessionEngineState{}, nil
}

func (f *fakeSRSService) GetEngineSessionItem(userID uint, sessionID uint) (*services.SessionEngineItem, error) {
	return &services.SessionEngineItem{}, nil
}

func (f *fakeSRSService) GradeEngineSession(userID uint, sessionID uint, grade *models.SessionGradeRequest, requestID string) (*services.SessionEngineItem, error) {
	return &services.SessionEngineItem{}, nil
}

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
				"definition:9": {DomainID: 42},
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
				"definition:9": {DomainID: 42},
			},
		},
	}

	c, recorder := testJSONContext(http.MethodPut, "/api/srs/nodes/status", `{"nodeId":9,"nodeType":"definition","status":"grasped"}`)
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
