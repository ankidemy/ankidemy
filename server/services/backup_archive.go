package services

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
)

const (
	BackupArchiveMaxCompressedSize   int64   = 64 << 20
	BackupArchiveMaxEntrySize        uint64  = 16 << 20
	BackupArchiveMaxTotalSize        uint64  = 256 << 20
	BackupArchiveMaxFileCount        int     = 2048
	BackupArchiveMaxCompressionRatio float64 = 100
)

type ValidatedBackupArchive struct {
	Backup      *DomainBackup
	ImportData  *ImportData
	FilesByName map[string]*zip.File
}

func ValidateBackupArchive(reader *zip.Reader) (*ValidatedBackupArchive, error) {
	if reader == nil {
		return nil, errors.New("backup archive is required")
	}

	filesByName := make(map[string]*zip.File, len(reader.File))
	fileCount := 0
	var totalUncompressed uint64

	for _, file := range reader.File {
		if !isSafeBackupArchiveEntryName(file.Name) {
			return nil, fmt.Errorf("backup archive contains invalid entry %q", file.Name)
		}
		if !isAllowedBackupArchiveEntry(file.Name) {
			return nil, fmt.Errorf("backup archive entry %q is not allowed", file.Name)
		}
		if _, exists := filesByName[file.Name]; exists {
			return nil, fmt.Errorf("backup archive contains duplicate entry %q", file.Name)
		}
		filesByName[file.Name] = file

		if file.FileInfo().IsDir() {
			continue
		}
		fileCount++
		if fileCount > BackupArchiveMaxFileCount {
			return nil, fmt.Errorf("backup archive contains too many files")
		}
		if file.UncompressedSize64 > BackupArchiveMaxEntrySize {
			return nil, fmt.Errorf("backup archive entry %q exceeds the per-file limit", file.Name)
		}
		totalUncompressed += file.UncompressedSize64
		if totalUncompressed > BackupArchiveMaxTotalSize {
			return nil, fmt.Errorf("backup archive exceeds the total uncompressed size limit")
		}

		if file.CompressedSize64 == 0 {
			if file.UncompressedSize64 > 0 {
				return nil, fmt.Errorf("backup archive entry %q has invalid compression metadata", file.Name)
			}
			continue
		}
		ratio := float64(file.UncompressedSize64) / float64(file.CompressedSize64)
		if ratio > BackupArchiveMaxCompressionRatio {
			return nil, fmt.Errorf("backup archive entry %q exceeds the compression ratio limit", file.Name)
		}
	}

	backupJSON := filesByName["backup.json"]
	domainJSON := filesByName["domain.json"]
	if backupJSON == nil && domainJSON == nil {
		return nil, errors.New("backup archive is missing backup.json")
	}

	validated := &ValidatedBackupArchive{
		FilesByName: filesByName,
	}
	if backupJSON != nil {
		payload, err := readZipFileWithLimit(backupJSON, BackupArchiveMaxEntrySize)
		if err != nil {
			return nil, fmt.Errorf("failed to read backup.json: %w", err)
		}
		var parsed DomainBackup
		if err := json.Unmarshal(payload, &parsed); err != nil {
			return nil, errors.New("failed to parse backup.json")
		}
		NormalizeDomainBackupNodeTypes(&parsed)
		validated.Backup = &parsed
		validated.ImportData = &parsed.Data
		return validated, nil
	}

	payload, err := readZipFileWithLimit(domainJSON, BackupArchiveMaxEntrySize)
	if err != nil {
		return nil, fmt.Errorf("failed to read domain.json: %w", err)
	}
	var parsed ImportData
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return nil, errors.New("failed to parse domain.json")
	}
	validated.ImportData = &parsed
	return validated, nil
}

func readZipFileWithLimit(file *zip.File, maxSize uint64) ([]byte, error) {
	if file == nil {
		return nil, errors.New("zip entry is required")
	}
	if file.UncompressedSize64 > maxSize {
		return nil, fmt.Errorf("zip entry %q exceeds the read limit", file.Name)
	}

	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer func() { _ = reader.Close() }()

	limited := io.LimitReader(reader, int64(maxSize)+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if uint64(len(data)) > maxSize {
		return nil, fmt.Errorf("zip entry %q exceeds the read limit", file.Name)
	}
	return data, nil
}

func isAllowedBackupArchiveEntry(name string) bool {
	cleaned := strings.TrimSuffix(name, "/")
	if cleaned == "backup.json" || cleaned == "domain.json" {
		return true
	}
	return strings.HasPrefix(cleaned, "media/")
}

func isSafeBackupArchiveEntryName(name string) bool {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || strings.Contains(trimmed, "\\") || strings.HasPrefix(trimmed, "/") {
		return false
	}

	dir := strings.HasSuffix(trimmed, "/")
	cleaned := path.Clean(strings.TrimSuffix(trimmed, "/"))
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return false
	}
	if dir {
		return cleaned == strings.TrimSuffix(trimmed, "/")
	}
	return cleaned == trimmed
}
