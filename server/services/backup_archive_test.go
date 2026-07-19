package services

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func buildZipArchive(t *testing.T, files map[string][]byte) *zip.Reader {
	t.Helper()

	buf := &bytes.Buffer{}
	writer := zip.NewWriter(buf)
	for name, payload := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatalf("create zip entry %q: %v", name, err)
		}
		if _, err := entry.Write(payload); err != nil {
			t.Fatalf("write zip entry %q: %v", name, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close zip writer: %v", err)
	}

	reader, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("open zip reader: %v", err)
	}
	return reader
}

func TestValidateBackupArchiveParsesBackupJSON(t *testing.T) {
	reader := buildZipArchive(t, map[string][]byte{
		"backup.json":                      []byte(`{"schemaVersion":2,"domain":{"name":"Demo","privacy":"private"},"data":{"quests":{"Q1":{"code":"Q1","kind":"todo","schedule":{},"versions":[{"title":"Quest","imagePath":"/api/media/1/private/1-demo/image.png"}]}}}}`),
		"media/1/private/1-demo/image.png": []byte("\x89PNG\r\n\x1a\npng"),
	})

	validated, err := ValidateBackupArchive(reader)
	if err != nil {
		t.Fatalf("expected archive to validate, got %v", err)
	}
	if validated.Backup == nil {
		t.Fatal("expected parsed backup payload")
	}
	if validated.ImportData == nil {
		t.Fatal("expected parsed import data")
	}
	if _, ok := validated.FilesByName["backup.json"]; !ok {
		t.Fatal("expected filesByName to contain backup.json")
	}
}

func TestValidateBackupArchiveRejectsPathTraversal(t *testing.T) {
	reader := buildZipArchive(t, map[string][]byte{
		"backup.json":      []byte(`{"schemaVersion":2,"domain":{"name":"Demo","privacy":"private"},"data":{}}`),
		"../media/bad.png": []byte("bad"),
	})

	_, err := ValidateBackupArchive(reader)
	if err == nil {
		t.Fatal("expected invalid archive to fail")
	}
	if !strings.Contains(err.Error(), "invalid entry") {
		t.Fatalf("expected invalid entry error, got %v", err)
	}
}

func TestValidateBackupArchiveRejectsUnexpectedEntries(t *testing.T) {
	reader := buildZipArchive(t, map[string][]byte{
		"backup.json": []byte(`{"schemaVersion":2,"domain":{"name":"Demo","privacy":"private"},"data":{}}`),
		"notes.txt":   []byte("unexpected"),
	})

	_, err := ValidateBackupArchive(reader)
	if err == nil {
		t.Fatal("expected unexpected archive entry to fail")
	}
	if !strings.Contains(err.Error(), "not allowed") {
		t.Fatalf("expected not allowed error, got %v", err)
	}
}
