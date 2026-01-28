package models

import (
	"time"

	"gorm.io/gorm"
)

// Source represents a capture/reference node (markdown + LaTeX).
type Source struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	DomainID   uint           `gorm:"column:domain_id;not null;index" json:"domainId"`
	OwnerID    uint           `gorm:"column:owner_id;not null;index" json:"ownerId"`
	Code       string         `gorm:"column:code;not null;size:80;index" json:"code"`
	Title      string         `gorm:"column:title;not null" json:"title"`
	ContentMd  string         `gorm:"column:content_md;not null;default:''" json:"contentMd"`
	BibtexKey  *string        `gorm:"column:bibtex_key" json:"bibtexKey,omitempty"`
	FilePath   *string        `gorm:"column:file_path" json:"filePath,omitempty"`
	XPosition  float64        `gorm:"column:x_position;default:0" json:"xPosition"`
	YPosition  float64        `gorm:"column:y_position;default:0" json:"yPosition"`
	Visibility string         `gorm:"column:visibility;not null;default:'private'" json:"visibility"`
	CreatedAt  time.Time      `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time      `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"column:deleted_at;index" json:"deletedAt,omitempty"`
}

func (Source) TableName() string { return "sources" }

type SourceCreateRequest struct {
	Code       string  `json:"code,omitempty"`
	Title      string  `json:"title"`
	ContentMd  string  `json:"contentMd,omitempty"`
	BibtexKey  *string `json:"bibtexKey,omitempty"`
	FilePath   *string `json:"filePath,omitempty"`
	XPosition  float64 `json:"xPosition,omitempty"`
	YPosition  float64 `json:"yPosition,omitempty"`
	Visibility string  `json:"visibility,omitempty"`
}

type SourceUpdateRequest struct {
	Code       *string  `json:"code,omitempty"`
	Title      *string  `json:"title,omitempty"`
	ContentMd  *string  `json:"contentMd,omitempty"`
	BibtexKey  **string `json:"bibtexKey,omitempty"`
	FilePath   **string `json:"filePath,omitempty"`
	XPosition  *float64 `json:"xPosition,omitempty"`
	YPosition  *float64 `json:"yPosition,omitempty"`
	Visibility *string  `json:"visibility,omitempty"`
}

type SourceResponse struct {
	ID         uint      `json:"id"`
	DomainID   uint      `json:"domainId"`
	OwnerID    uint      `json:"ownerId"`
	Code       string    `json:"code"`
	Title      string    `json:"title"`
	ContentMd  string    `json:"contentMd"`
	BibtexKey  *string   `json:"bibtexKey,omitempty"`
	FilePath   *string   `json:"filePath,omitempty"`
	XPosition  float64   `json:"xPosition"`
	YPosition  float64   `json:"yPosition"`
	Visibility string    `json:"visibility"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}
