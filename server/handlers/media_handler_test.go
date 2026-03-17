package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestServeMediaFileSetsInlineHeadersForImages(t *testing.T) {
	gin.SetMode(gin.TestMode)

	dir := t.TempDir()
	filePath := filepath.Join(dir, "image.png")
	pngBytes := []byte{
		0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n',
		0x00, 0x00, 0x00, 0x0d, 'I', 'H', 'D', 'R',
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
		0x89, 0x00, 0x00, 0x00, 0x0d, 'I', 'D', 'A',
		'T', 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
		0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92,
		0xef, 0x00, 0x00, 0x00, 0x00, 'I', 'E', 'N', 'D',
		0xae, 'B', 0x60, 0x82,
	}
	if err := os.WriteFile(filePath, pngBytes, 0o644); err != nil {
		t.Fatalf("write image: %v", err)
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/media/test", nil)

	if err := serveMediaFile(c, filePath, "image.png"); err != nil {
		t.Fatalf("serve image: %v", err)
	}

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("expected nosniff header, got %q", got)
	}
	if got := recorder.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "inline;") {
		t.Fatalf("expected inline disposition, got %q", got)
	}
	if got := recorder.Header().Get("Content-Type"); !strings.HasPrefix(got, "image/png") {
		t.Fatalf("expected image/png content type, got %q", got)
	}
}

func TestServeMediaFileForcesAttachmentForNonImages(t *testing.T) {
	gin.SetMode(gin.TestMode)

	dir := t.TempDir()
	filePath := filepath.Join(dir, "payload.bin")
	if err := os.WriteFile(filePath, []byte("not-an-image"), 0o644); err != nil {
		t.Fatalf("write payload: %v", err)
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/media/test", nil)

	if err := serveMediaFile(c, filePath, "payload.bin"); err != nil {
		t.Fatalf("serve payload: %v", err)
	}

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("expected nosniff header, got %q", got)
	}
	if got := recorder.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment;") {
		t.Fatalf("expected attachment disposition, got %q", got)
	}
	if got := recorder.Header().Get("Content-Type"); got == "" {
		t.Fatal("expected detected content type")
	}
}
