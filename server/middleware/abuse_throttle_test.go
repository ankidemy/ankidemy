package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestAbuseThrottleReturnsTooManyRequestsAfterLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	limiter := NewAbuseLimiter()
	router := gin.New()
	router.POST("/limited", AbuseThrottle(limiter, RateLimitPolicy{
		Scope:       "test.scope",
		MaxRequests: 2,
		Window:      time.Minute,
	}), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	for i := 0; i < 2; i++ {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/limited", nil)
		req.RemoteAddr = "203.0.113.10:1234"
		router.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusNoContent {
			t.Fatalf("request %d: expected 204, got %d", i+1, recorder.Code)
		}
	}

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/limited", nil)
	req.RemoteAddr = "203.0.113.10:1234"
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Retry-After"); got == "" {
		t.Fatal("expected Retry-After header to be set")
	}
}

func TestAbuseThrottleUsesUserIDForProtectedRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	limiter := NewAbuseLimiter()
	router := gin.New()
	router.POST("/limited",
		func(c *gin.Context) {
			c.Set("userID", c.GetHeader("X-Test-User"))
			c.Next()
		},
		AbuseThrottle(limiter, RateLimitPolicy{
			Scope:       "test.scope",
			MaxRequests: 1,
			Window:      time.Minute,
		}),
		func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		},
	)

	firstUserRecorder := httptest.NewRecorder()
	firstUserReq := httptest.NewRequest(http.MethodPost, "/limited", nil)
	firstUserReq.RemoteAddr = "203.0.113.10:1234"
	firstUserReq.Header.Set("X-Test-User", "7")
	router.ServeHTTP(firstUserRecorder, firstUserReq)
	if firstUserRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected first user request to pass, got %d", firstUserRecorder.Code)
	}

	secondUserRecorder := httptest.NewRecorder()
	secondUserReq := httptest.NewRequest(http.MethodPost, "/limited", nil)
	secondUserReq.RemoteAddr = "203.0.113.10:1234"
	secondUserReq.Header.Set("X-Test-User", "8")
	router.ServeHTTP(secondUserRecorder, secondUserReq)
	if secondUserRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected second user request to pass independently, got %d", secondUserRecorder.Code)
	}

	repeatFirstUserRecorder := httptest.NewRecorder()
	repeatFirstUserReq := httptest.NewRequest(http.MethodPost, "/limited", nil)
	repeatFirstUserReq.RemoteAddr = "203.0.113.10:1234"
	repeatFirstUserReq.Header.Set("X-Test-User", "7")
	router.ServeHTTP(repeatFirstUserRecorder, repeatFirstUserReq)
	if repeatFirstUserRecorder.Code != http.StatusTooManyRequests {
		t.Fatalf("expected repeated first user request to be throttled, got %d", repeatFirstUserRecorder.Code)
	}
}
