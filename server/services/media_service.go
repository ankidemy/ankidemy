package services

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const MediaRoot = "media"
const MediaURLPrefix = "/api/media/"

// BuildDomainFolder creates a stable folder name for a domain.
func BuildDomainFolder(domainID uint, domainName string) string {
	slug := slugify(domainName)
	if slug == "" {
		return fmt.Sprintf("%d", domainID)
	}
	return fmt.Sprintf("%d-%s", domainID, slug)
}

// BuildMediaDir returns the filesystem directory for storing media.
func BuildMediaDir(ownerID uint, visibility, domainFolder string) string {
	return filepath.Join(MediaRoot, fmt.Sprintf("%d", ownerID), visibility, domainFolder)
}

// BuildMediaURL returns the URL path for a stored media file.
func BuildMediaURL(ownerID uint, visibility, domainFolder, filename string) string {
	return path.Join(MediaURLPrefix, fmt.Sprintf("%d", ownerID), visibility, domainFolder, filename)
}

// MediaURLToPath converts a stored media URL/path into a filesystem path.
func MediaURLToPath(mediaPath string) (string, error) {
	if strings.TrimSpace(mediaPath) == "" {
		return "", nil
	}

	cleaned := strings.TrimSpace(mediaPath)
	if strings.HasPrefix(cleaned, "http://") || strings.HasPrefix(cleaned, "https://") {
		parsed, err := url.Parse(cleaned)
		if err != nil {
			return "", err
		}
		cleaned = parsed.Path
	}

	cleaned = strings.TrimPrefix(cleaned, "/")
	if strings.HasPrefix(cleaned, strings.TrimPrefix(MediaURLPrefix, "/")) {
		cleaned = strings.TrimPrefix(cleaned, strings.TrimPrefix(MediaURLPrefix, "/"))
	}
	cleaned = strings.TrimPrefix(cleaned, "/")

	parts := strings.Split(cleaned, "/")
	if len(parts) != 4 {
		return "", errors.New("invalid media path")
	}
	for _, part := range parts[:4] {
		if part == "" || part == "." || part == ".." || strings.Contains(part, "..") {
			return "", errors.New("invalid media path segment")
		}
	}

	userID := parts[0]
	visibility := parts[1]
	domainFolder := parts[2]
	filename := parts[3]

	return filepath.Join(MediaRoot, userID, visibility, domainFolder, filename), nil
}

// DeleteMediaFile removes a media file if it exists.
func DeleteMediaFile(mediaPath string) error {
	filePath, err := MediaURLToPath(mediaPath)
	if err != nil || filePath == "" {
		return err
	}
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func slugify(input string) string {
	lowered := strings.ToLower(strings.TrimSpace(input))
	var b strings.Builder
	prevDash := false
	for i := 0; i < len(lowered); i++ {
		ch := lowered[i]
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			b.WriteByte(ch)
			prevDash = false
			continue
		}
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	return out
}
