package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"ankidemy/server/services"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type trackingSRSDAO struct {
	createPrerequisiteCalled bool
}

func (d *trackingSRSDAO) GetReviewHistory(userID uint, nodeID *uint, nodeType *string, limit int) ([]models.ReviewHistory, error) {
	return nil, nil
}

func (d *trackingSRSDAO) GetDomainProgress(userID uint, domainID uint) ([]models.NodeProgress, error) {
	return nil, nil
}

func (d *trackingSRSDAO) GetDomainStats(userID uint, domainID uint, requestID string) (*models.DomainProgressSummary, error) {
	return &models.DomainProgressSummary{}, nil
}

func (d *trackingSRSDAO) CreateSession(session *models.StudySession) error {
	return nil
}

func (d *trackingSRSDAO) GetSession(sessionID uint) (*models.StudySession, error) {
	return nil, nil
}

func (d *trackingSRSDAO) EndSession(sessionID uint) error {
	return nil
}

func (d *trackingSRSDAO) GetUserSessions(userID uint, limit int) ([]models.StudySession, error) {
	return nil, nil
}

func (d *trackingSRSDAO) CreatePrerequisite(prerequisite *models.NodePrerequisite) error {
	d.createPrerequisiteCalled = true
	return nil
}

func (d *trackingSRSDAO) GetPrerequisitesByDomain(domainID uint) ([]models.NodePrerequisite, error) {
	return nil, nil
}

func newPhase06TestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}

	if err := db.AutoMigrate(
		&models.Domain{},
		&models.DomainPermission{},
		&models.MetaDefinition{},
		&models.Definition{},
		&models.MetaExercise{},
		&models.Exercise{},
		&models.MetaQuest{},
		&models.QuestVersion{},
		&models.QuestEvent{},
		&models.Source{},
		&models.NodeRelation{},
		&models.NodePrerequisite{},
		&models.UserMetaDefinitionStats{},
		&models.UserDefinitionVersionStats{},
		&models.UserMetaExerciseStats{},
		&models.UserExerciseVersionStats{},
	); err != nil {
		t.Fatalf("migrate sqlite schema: %v", err)
	}

	return db
}

func mustCreateModel(t *testing.T, db *gorm.DB, value any) {
	t.Helper()
	if err := db.Create(value).Error; err != nil {
		t.Fatalf("create model %T: %v", value, err)
	}
}

func TestVerifyAnswerReturnsNotFoundForUnauthorizedDomain(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newPhase06TestDB(t)
	domain := &models.Domain{Name: "Private", Privacy: "private", OwnerID: 11}
	mustCreateModel(t, db, domain)
	exercise := &models.Exercise{
		Code:           "EX-1",
		Name:           "Exercise",
		Statement:      "Solve",
		DomainID:       domain.ID,
		OwnerID:        11,
		MetaExerciseID: 99,
		Verifiable:     true,
		Result:         "42",
		Difficulty:     3,
	}
	mustCreateModel(t, db, exercise)

	handler := &ExerciseHandler{
		exerciseDAO:   dao.NewExerciseDAO(db),
		domainDAO:     dao.NewDomainDAO(db),
		permissionDAO: dao.NewDomainPermissionDAO(db),
	}

	c, recorder := testJSONContext(http.MethodPost, fmt.Sprintf("/api/exercises/%d/verify", exercise.ID), `{"answer":"42"}`)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", exercise.ID)}}
	c.Set("userID", uint(77))

	handler.VerifyAnswer(c)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %s", recorder.Code, recorder.Body.String())
	}
	if strings.TrimSpace(recorder.Body.String()) != `{"error":"Exercise not found"}` {
		t.Fatalf("unexpected body: %s", recorder.Body.String())
	}
}

func TestMetaDefinitionNextVersionUnauthorizedDoesNotRecordSeenCount(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newPhase06TestDB(t)
	domain := &models.Domain{Name: "Private", Privacy: "private", OwnerID: 11}
	mustCreateModel(t, db, domain)
	meta := &models.MetaDefinition{Code: "MD-1", Name: "Meta definition", DomainID: domain.ID, OwnerID: 11}
	mustCreateModel(t, db, meta)
	version := &models.Definition{Code: meta.Code, Name: meta.Name, Prompt: "Describe it", DomainID: domain.ID, OwnerID: 11, MetaDefinitionID: meta.ID}
	mustCreateModel(t, db, version)

	handler := &MetaDefinitionHandler{
		metaDAO:       dao.NewMetaDefinitionDAO(db),
		domainDAO:     dao.NewDomainDAO(db),
		service:       services.NewMetaDefinitionService(db),
		permissionDAO: dao.NewDomainPermissionDAO(db),
	}

	c, recorder := testJSONContext(http.MethodGet, fmt.Sprintf("/api/meta-definitions/%d/next-version", meta.ID), "")
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", meta.ID)}}
	c.Set("userID", uint(77))

	handler.GetNextVersion(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %s", recorder.Code, recorder.Body.String())
	}

	var count int64
	if err := db.Model(&models.UserDefinitionVersionStats{}).Count(&count).Error; err != nil {
		t.Fatalf("count definition stats: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no seen-count rows, got %d", count)
	}
}

func TestMetaExerciseNextVersionUnauthorizedDoesNotRecordSeenCount(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newPhase06TestDB(t)
	domain := &models.Domain{Name: "Private", Privacy: "private", OwnerID: 11}
	mustCreateModel(t, db, domain)
	meta := &models.MetaExercise{Code: "ME-1", Name: "Meta exercise", DomainID: domain.ID, OwnerID: 11}
	mustCreateModel(t, db, meta)
	version := &models.Exercise{
		Code:           meta.Code,
		Name:           meta.Name,
		Statement:      "Solve it",
		DomainID:       domain.ID,
		OwnerID:        11,
		MetaExerciseID: meta.ID,
		Difficulty:     3,
	}
	mustCreateModel(t, db, version)

	handler := &MetaExerciseHandler{
		metaDAO:       dao.NewMetaExerciseDAO(db),
		domainDAO:     dao.NewDomainDAO(db),
		service:       services.NewMetaExerciseService(db),
		permissionDAO: dao.NewDomainPermissionDAO(db),
	}

	c, recorder := testJSONContext(http.MethodGet, fmt.Sprintf("/api/meta-exercises/%d/next-version", meta.ID), "")
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", meta.ID)}}
	c.Set("userID", uint(77))

	handler.GetNextVersion(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %s", recorder.Code, recorder.Body.String())
	}

	var count int64
	if err := db.Model(&models.UserExerciseVersionStats{}).Count(&count).Error; err != nil {
		t.Fatalf("count exercise stats: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no seen-count rows, got %d", count)
	}
}

func TestSurveyPostEventRejectsMismatchedQuestVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newPhase06TestDB(t)
	domain := &models.Domain{Name: "Private", Privacy: "private", OwnerID: 11}
	mustCreateModel(t, db, domain)

	schedule := json.RawMessage(`{"frequency":"daily"}`)
	metaQuestA := &models.MetaQuest{DomainID: domain.ID, OwnerID: 11, Code: "QA", Name: "Quest A", Kind: "habit", Schedule: schedule, Visibility: "domain"}
	metaQuestB := &models.MetaQuest{DomainID: domain.ID, OwnerID: 11, Code: "QB", Name: "Quest B", Kind: "habit", Schedule: schedule, Visibility: "domain"}
	mustCreateModel(t, db, metaQuestA)
	mustCreateModel(t, db, metaQuestB)

	versionB := &models.QuestVersion{MetaQuestID: metaQuestB.ID, Title: "Version B"}
	mustCreateModel(t, db, versionB)

	handler := &SurveyHandler{
		domainDAO:     dao.NewDomainDAO(db),
		permissionDAO: dao.NewDomainPermissionDAO(db),
		metaQuestDAO:  dao.NewMetaQuestDAO(db),
	}

	body := fmt.Sprintf(`{"metaQuestId":%d,"eventType":"completed","questVersionId":%d}`, metaQuestA.ID, versionB.ID)
	c, recorder := testJSONContext(http.MethodPost, "/api/survey/events", body)
	c.Set("userID", uint(11))

	handler.PostEvent(c)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "questVersionId does not belong") {
		t.Fatalf("unexpected body: %s", recorder.Body.String())
	}

	var count int64
	if err := db.Model(&models.QuestEvent{}).Count(&count).Error; err != nil {
		t.Fatalf("count quest events: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no quest events to be created, got %d", count)
	}
}

func TestRelationCreateRejectsCrossDomainNodes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newPhase06TestDB(t)
	domainA := &models.Domain{Name: "Domain A", Privacy: "private", OwnerID: 11}
	domainB := &models.Domain{Name: "Domain B", Privacy: "private", OwnerID: 11}
	mustCreateModel(t, db, domainA)
	mustCreateModel(t, db, domainB)

	from := &models.MetaDefinition{Code: "MD-A", Name: "Meta definition", DomainID: domainA.ID, OwnerID: 11}
	to := &models.MetaExercise{Code: "ME-B", Name: "Meta exercise", DomainID: domainB.ID, OwnerID: 11}
	mustCreateModel(t, db, from)
	mustCreateModel(t, db, to)

	handler := &RelationHandler{
		relationDAO:   dao.NewNodeRelationDAO(db),
		domainDAO:     dao.NewDomainDAO(db),
		permissionDAO: dao.NewDomainPermissionDAO(db),
		metaDefDAO:    dao.NewMetaDefinitionDAO(db),
		metaExDAO:     dao.NewMetaExerciseDAO(db),
		sourceDAO:     dao.NewSourceDAO(db),
		metaQuestDAO:  dao.NewMetaQuestDAO(db),
		nodeResolver:  newDBNodeAccessResolver(db),
	}

	body := fmt.Sprintf(`{"fromType":"definition","fromId":%d,"toType":"exercise","toId":%d,"relationType":"supports"}`, from.ID, to.ID)
	c, recorder := testJSONContext(http.MethodPost, fmt.Sprintf("/api/domains/%d/relations", domainA.ID), body)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", domainA.ID)}}
	c.Set("userID", uint(11))

	handler.CreateRelation(c)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %s", recorder.Code, recorder.Body.String())
	}

	var count int64
	if err := db.Model(&models.NodeRelation{}).Count(&count).Error; err != nil {
		t.Fatalf("count relations: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no relations to be created, got %d", count)
	}
}

func TestSRSCreatePrerequisiteRejectsCrossDomainPair(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newPhase06TestDB(t)
	domainA := &models.Domain{Name: "Domain A", Privacy: "private", OwnerID: 11}
	domainB := &models.Domain{Name: "Domain B", Privacy: "private", OwnerID: 11}
	mustCreateModel(t, db, domainA)
	mustCreateModel(t, db, domainB)

	node := &models.MetaDefinition{Code: "MD-A", Name: "Meta definition", DomainID: domainA.ID, OwnerID: 11}
	prerequisite := &models.MetaExercise{Code: "ME-B", Name: "Meta exercise", DomainID: domainB.ID, OwnerID: 11}
	mustCreateModel(t, db, node)
	mustCreateModel(t, db, prerequisite)

	trackingDAO := &trackingSRSDAO{}
	handler := &SRSHandler{
		db:                 db,
		domainDAO:          dao.NewDomainDAO(db),
		srsService:         &fakeSRSService{},
		srsDao:             trackingDAO,
		permissionDAO:      dao.NewDomainPermissionDAO(db),
		nodeAccessResolver: newDBNodeAccessResolver(db),
	}

	body := fmt.Sprintf(`{"nodeId":%d,"nodeType":"definition","prerequisiteId":%d,"prerequisiteType":"exercise","weight":0.5}`, node.ID, prerequisite.ID)
	c, recorder := testJSONContext(http.MethodPost, "/api/srs/prerequisites", body)
	c.Set("userID", uint(11))

	handler.CreatePrerequisite(c)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %s", recorder.Code, recorder.Body.String())
	}
	if trackingDAO.createPrerequisiteCalled {
		t.Fatal("expected prerequisite creation to be skipped")
	}

	var count int64
	if err := db.Model(&models.NodePrerequisite{}).Count(&count).Error; err != nil {
		t.Fatalf("count prerequisites: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no prerequisites to be created, got %d", count)
	}
}

func TestSRSUpdatePrerequisiteRejectsMalformedLegacyRow(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newPhase06TestDB(t)
	domain := &models.Domain{Name: "Domain A", Privacy: "private", OwnerID: 11}
	mustCreateModel(t, db, domain)

	node := &models.MetaDefinition{Code: "MD-A", Name: "Meta definition", DomainID: domain.ID, OwnerID: 11}
	mustCreateModel(t, db, node)

	prerequisite := &models.NodePrerequisite{
		NodeID:           node.ID,
		NodeType:         "definition",
		PrerequisiteID:   999,
		PrerequisiteType: "exercise",
		Weight:           0.5,
	}
	mustCreateModel(t, db, prerequisite)

	handler := &SRSHandler{
		db:                 db,
		domainDAO:          dao.NewDomainDAO(db),
		srsService:         &fakeSRSService{},
		srsDao:             &trackingSRSDAO{},
		permissionDAO:      dao.NewDomainPermissionDAO(db),
		nodeAccessResolver: newDBNodeAccessResolver(db),
	}

	c, recorder := testJSONContext(http.MethodPut, fmt.Sprintf("/api/srs/prerequisites/%d", prerequisite.ID), `{"weight":0.9}`)
	c.Params = gin.Params{{Key: "prerequisiteId", Value: fmt.Sprintf("%d", prerequisite.ID)}}
	c.Set("userID", uint(11))

	handler.UpdatePrerequisite(c)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %s", recorder.Code, recorder.Body.String())
	}

	var persisted models.NodePrerequisite
	if err := db.First(&persisted, prerequisite.ID).Error; err != nil {
		t.Fatalf("reload prerequisite: %v", err)
	}
	if persisted.Weight != 0.5 {
		t.Fatalf("expected malformed prerequisite weight to stay 0.5, got %v", persisted.Weight)
	}
}

func TestSRSDeletePrerequisiteRejectsMalformedLegacyRow(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db := newPhase06TestDB(t)
	domain := &models.Domain{Name: "Domain A", Privacy: "private", OwnerID: 11}
	mustCreateModel(t, db, domain)

	node := &models.MetaDefinition{Code: "MD-A", Name: "Meta definition", DomainID: domain.ID, OwnerID: 11}
	mustCreateModel(t, db, node)

	prerequisite := &models.NodePrerequisite{
		NodeID:           node.ID,
		NodeType:         "definition",
		PrerequisiteID:   999,
		PrerequisiteType: "exercise",
		Weight:           0.5,
	}
	mustCreateModel(t, db, prerequisite)

	handler := &SRSHandler{
		db:                 db,
		domainDAO:          dao.NewDomainDAO(db),
		srsService:         &fakeSRSService{},
		srsDao:             &trackingSRSDAO{},
		permissionDAO:      dao.NewDomainPermissionDAO(db),
		nodeAccessResolver: newDBNodeAccessResolver(db),
	}

	c, recorder := testJSONContext(http.MethodDelete, fmt.Sprintf("/api/srs/prerequisites/%d", prerequisite.ID), "")
	c.Params = gin.Params{{Key: "prerequisiteId", Value: fmt.Sprintf("%d", prerequisite.ID)}}
	c.Set("userID", uint(11))

	handler.DeletePrerequisite(c)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %s", recorder.Code, recorder.Body.String())
	}

	var count int64
	if err := db.Model(&models.NodePrerequisite{}).Where("id = ?", prerequisite.ID).Count(&count).Error; err != nil {
		t.Fatalf("count malformed prerequisite: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected malformed prerequisite to remain, got count=%d", count)
	}
}
