package dao

import (
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"ankidemy/server/models"
)

// ReadModelEventDAO handles durable read-model events.
type ReadModelEventDAO struct {
	db *gorm.DB
}

func NewReadModelEventDAO(db *gorm.DB) *ReadModelEventDAO {
	return &ReadModelEventDAO{db: db}
}

func (d *ReadModelEventDAO) Enqueue(event *models.ReadModelEvent) error {
	return d.enqueueWithDB(d.db, event)
}

func (d *ReadModelEventDAO) EnqueueTx(tx *gorm.DB, event *models.ReadModelEvent) error {
	return d.enqueueWithDB(tx, event)
}

func (d *ReadModelEventDAO) enqueueWithDB(db *gorm.DB, event *models.ReadModelEvent) error {
	if strings.TrimSpace(event.DedupeKey) == "" {
		return gorm.ErrInvalidData
	}
	if event.NotBefore.IsZero() {
		event.NotBefore = time.Now().UTC()
	}

	return db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "dedupe_key"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"event_type":  event.EventType,
			"user_id":     event.UserID,
			"domain_id":   event.DomainID,
			"payload":     event.Payload,
			"not_before":  event.NotBefore,
			"retry_count": 0,
			"last_error":  "",
			"updated_at":  time.Now().UTC(),
		}),
	}).Create(event).Error
}

func (d *ReadModelEventDAO) ListReady(limit int, now time.Time) ([]models.ReadModelEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	var events []models.ReadModelEvent
	err := d.db.Where("not_before <= ?", now.UTC()).
		Order("not_before ASC, id ASC").
		Limit(limit).
		Find(&events).Error
	return events, err
}

func (d *ReadModelEventDAO) DeleteByID(id uint) error {
	return d.db.Delete(&models.ReadModelEvent{}, id).Error
}

func (d *ReadModelEventDAO) Reschedule(id uint, retryDelay time.Duration, errMessage string) error {
	if retryDelay <= 0 {
		retryDelay = 5 * time.Second
	}
	nextRun := time.Now().UTC().Add(retryDelay)
	return d.db.Model(&models.ReadModelEvent{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"not_before":  nextRun,
			"retry_count": gorm.Expr("retry_count + 1"),
			"last_error":  errMessage,
			"updated_at":  time.Now().UTC(),
		}).Error
}
