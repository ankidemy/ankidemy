package services

import (
	"errors"
	"math/rand"
	"time"
	"gorm.io/gorm"
	"ankidemy/server/dao"
	"ankidemy/server/models"
)

type MetaDefinitionService struct {
	db *gorm.DB
}

func NewMetaDefinitionService(db *gorm.DB) *MetaDefinitionService {
	return &MetaDefinitionService{db: db}
}

// SuggestVersion returns a suggested version according to rules:
// 1) Prefer versions with minimal seen_count
// 2) Among those, prioritize highest failure count (seen_count - correct_count)
// 3) Break ties randomly
func (s *MetaDefinitionService) SuggestVersion(userID uint, metaDefinitionID uint) (*models.Definition, error) {
	metaDao := dao.NewMetaDefinitionDAO(s.db)
	_, versions, err := metaDao.FindByID(metaDefinitionID)
	if err != nil {
		return nil, err
	}
	if len(versions) == 0 {
		return nil, errors.New("no versions available")
	}

	// Load seen counts for all versions
	type vs struct {
		Def          models.Definition
		Seen         int
		FailureCount int
	}
	candidates := make([]vs, 0, len(versions))
	for _, v := range versions {
		var vus models.UserDefinitionVersionStats
		_ = s.db.Where("user_id = ? AND definition_id = ?", userID, v.ID).Limit(1).Find(&vus).Error
		failureCount := vus.SeenCount - vus.CorrectCount
		candidates = append(candidates, vs{Def: v, Seen: vus.SeenCount, FailureCount: failureCount})
	}

	// Find minimal seen count
	minSeen := 1 << 30
	for _, c := range candidates {
		if c.Seen < minSeen {
			minSeen = c.Seen
		}
	}

	// Filter to versions with minimal seen count
	minSeenCandidates := make([]vs, 0)
	for _, c := range candidates {
		if c.Seen == minSeen {
			minSeenCandidates = append(minSeenCandidates, c)
		}
	}

	// Among those, find max failure count
	maxFailure := -1
	for _, c := range minSeenCandidates {
		if c.FailureCount > maxFailure {
			maxFailure = c.FailureCount
		}
	}

	// Filter to versions with max failure count
	pool := make([]vs, 0)
	for _, c := range minSeenCandidates {
		if c.FailureCount == maxFailure {
			pool = append(pool, c)
		}
	}

	// Random selection among ties
	rand.Seed(time.Now().UnixNano())
	chosen := pool[rand.Intn(len(pool))]

	// Mark as seen (presentation) - increment seen count
	now := time.Now()
	var row models.UserDefinitionVersionStats
	tx := s.db.Where("user_id = ? AND definition_id = ?", userID, chosen.Def.ID).Limit(1).Find(&row)
	if tx.Error != nil || tx.RowsAffected == 0 {
		row = models.UserDefinitionVersionStats{
			UserID:       userID,
			DefinitionID: chosen.Def.ID,
			SeenCount:    1,
			LastSeenAt:   &now,
		}
	} else {
		row.SeenCount += 1
		row.LastSeenAt = &now
	}
	_ = s.db.Save(&row).Error

	return &chosen.Def, nil
}

// RecordVersionOutcome updates per-version and meta stats after a review
func (s *MetaDefinitionService) RecordVersionOutcome(userID uint, metaDefinitionID uint, versionID *uint, success bool) {
	now := time.Now()
	if versionID != nil {
		var row models.UserDefinitionVersionStats
		tx := s.db.Where("user_id = ? AND definition_id = ?", userID, *versionID).Limit(1).Find(&row)
		if tx.Error == nil && tx.RowsAffected > 0 {
			if success {
				row.CorrectCount += 1
				row.LastCorrectAt = &now
			}
			_ = s.db.Save(&row).Error
		}
	}

	if success {
		var meta models.UserMetaDefinitionStats
		tx := s.db.Where("user_id = ? AND meta_definition_id = ?", userID, metaDefinitionID).Limit(1).Find(&meta)
		if tx.Error != nil || tx.RowsAffected == 0 {
			meta = models.UserMetaDefinitionStats{
				UserID:           userID,
				MetaDefinitionID: metaDefinitionID,
				LastCorrectAt:    &now,
			}
		} else {
			meta.LastCorrectAt = &now
		}
		_ = s.db.Save(&meta).Error
	}
}
