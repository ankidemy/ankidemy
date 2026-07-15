package middleware

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"ankidemy/server/models"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestContentManagedReadOnlyBlocksContentButAllowsLearningState(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.Domain{}, &models.ContentBinding{}, &models.MetaDefinition{}, &models.Source{}); err != nil {
		t.Fatal(err)
	}
	domain := models.Domain{Name: "Managed", Privacy: "private", OwnerID: 1}
	if err := db.Create(&domain).Error; err != nil {
		t.Fatal(err)
	}
	binding := models.ContentBinding{
		Provider: "org-roam", ProviderNotebookID: "managed", DomainID: domain.ID, OwnerID: 1,
		Config: []byte(`{}`), SchemaVersion: 1, ProtocolVersion: 1,
		AuthorizationState: "attached", ConnectionState: "online",
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatal(err)
	}
	definition := models.MetaDefinition{DomainID: domain.ID, OwnerID: 1, Code: "managed.one", Name: "Managed"}
	if err := db.Create(&definition).Error; err != nil {
		t.Fatal(err)
	}
	source := models.Source{DomainID: domain.ID, OwnerID: 1, Code: "managed.source", Title: "Managed source", Visibility: "private"}
	if err := db.Create(&source).Error; err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.Use(ContentManagedReadOnly(db))
	router.POST("/api/domains/:id/definitions", func(c *gin.Context) { c.Status(http.StatusCreated) })
	router.PUT("/api/domains/:id/graph/positions", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.PUT("/api/domains/:id/external-prerequisites/positions", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.PUT("/api/meta-definitions/:id", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.PATCH("/api/sources/:id", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.POST("/api/srs/reviews", func(c *gin.Context) { c.Status(http.StatusCreated) })

	for _, test := range []struct {
		method string
		path   string
		want   int
		body   string
	}{
		{http.MethodPost, "/api/domains/" + strconv.FormatUint(uint64(domain.ID), 10) + "/definitions", http.StatusConflict, `{}`},
		{http.MethodPut, "/api/meta-definitions/" + strconv.FormatUint(uint64(definition.ID), 10), http.StatusConflict, `{}`},
		{http.MethodPut, "/api/meta-definitions/" + strconv.FormatUint(uint64(definition.ID), 10), http.StatusNoContent, `{"xPosition":12,"yPosition":34}`},
		{http.MethodPatch, "/api/sources/" + strconv.FormatUint(uint64(source.ID), 10), http.StatusNoContent, `{"visibility":"domain"}`},
		{http.MethodPatch, "/api/sources/" + strconv.FormatUint(uint64(source.ID), 10), http.StatusConflict, `{"title":"blocked"}`},
		{http.MethodPut, "/api/domains/" + strconv.FormatUint(uint64(domain.ID), 10) + "/graph/positions", http.StatusNoContent, `{}`},
		{http.MethodPut, "/api/domains/" + strconv.FormatUint(uint64(domain.ID), 10) + "/external-prerequisites/positions", http.StatusNoContent, `{}`},
		{http.MethodPost, "/api/srs/reviews", http.StatusCreated, `{}`},
	} {
		request := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != test.want {
			t.Fatalf("%s %s: got %d want %d body=%s", test.method, test.path, response.Code, test.want, response.Body.String())
		}
	}

	if err := db.Model(&binding).Update("authorization_state", "detached").Error; err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPut, "/api/meta-definitions/"+strconv.FormatUint(uint64(definition.ID), 10), strings.NewReader(`{}`))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("detached domain remained read-only: %d %s", response.Code, response.Body.String())
	}

	if err := db.Migrator().DropTable(&models.ContentBinding{}); err != nil {
		t.Fatal(err)
	}
	request = httptest.NewRequest(http.MethodPost, "/api/domains/"+strconv.FormatUint(uint64(domain.ID), 10)+"/definitions", strings.NewReader(`{}`))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("binding lookup failure was not closed: %d %s", response.Code, response.Body.String())
	}
}
