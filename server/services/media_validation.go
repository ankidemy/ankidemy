package services

import (
	"io"
	"net/http"
	"os"
	"strings"
)

const contentTypeSampleSize = 512

// DetectContentTypeFromReader inspects up to 512 bytes and returns the detected content type.
func DetectContentTypeFromReader(reader io.Reader) (string, []byte, error) {
	sample := make([]byte, contentTypeSampleSize)
	n, err := io.ReadFull(reader, sample)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return "", nil, err
	}
	sample = sample[:n]
	return http.DetectContentType(sample), sample, nil
}

// DetectFileContentType opens a file and detects its content type from bytes, not extension.
func DetectFileContentType(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	contentType, _, err := DetectContentTypeFromReader(file)
	return contentType, err
}

// IsImageContentType reports whether the detected content type is an image.
func IsImageContentType(contentType string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "image/")
}
