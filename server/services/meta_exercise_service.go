package services

import (
    "errors"
    "math/rand"
    "time"
    "gorm.io/gorm"
    "myapp/server/dao"
    "myapp/server/models"
)

type MetaExerciseService struct{
    db *gorm.DB
}

func NewMetaExerciseService(db *gorm.DB) *MetaExerciseService { return &MetaExerciseService{db: db} }

// SuggestVersion returns a suggested version according to rules:
// 1) Prefer versions with difficulty >= last_correct_difficulty
// 2) Among those, prefer the least seen (min seen_count)
// 3) Break ties randomly; if none match, fallback to any by least seen
func (s *MetaExerciseService) SuggestVersion(userID uint, metaExerciseID uint) (*models.Exercise, error) {
    metaDao := dao.NewMetaExerciseDAO(s.db)
    _, versions, err := metaDao.FindByID(metaExerciseID)
    if err != nil { return nil, err }
    if len(versions) == 0 { return nil, errors.New("no versions available") }

    // Get last_correct_difficulty
    var stats models.UserMetaExerciseStats
    tx1 := s.db.Where("user_id = ? AND meta_exercise_id = ?", userID, metaExerciseID).Limit(1).Find(&stats)
    _ = tx1.Error
    last := 1
    if stats.ID != 0 { last = stats.LastCorrectDifficulty }

    // Load seen counts
    type vs struct{ Ex models.Exercise; Seen int }
    candidates := make([]vs, 0, len(versions))
    for _, v := range versions {
        var vus models.UserExerciseVersionStats
        _ = s.db.Where("user_id = ? AND exercise_id = ?", userID, v.ID).Limit(1).Find(&vus).Error
        candidates = append(candidates, vs{Ex: v, Seen: vus.SeenCount})
    }

    // Filter by difficulty >= last
    filtered := make([]vs, 0)
    for _, c := range candidates { if c.Ex.Difficulty >= last { filtered = append(filtered, c) } }
    pickset := filtered
    if len(pickset) == 0 { pickset = candidates }

    // Find minimal seen
    minSeen := 1<<30
    for _, c := range pickset { if c.Seen < minSeen { minSeen = c.Seen } }
    pool := make([]vs, 0)
    for _, c := range pickset { if c.Seen == minSeen { pool = append(pool, c) } }

    rand.Seed(time.Now().UnixNano())
    chosen := pool[rand.Intn(len(pool))]

    // Mark as seen (presentation)
    now := time.Now()
    var row models.UserExerciseVersionStats
    tx := s.db.Where("user_id = ? AND exercise_id = ?", userID, chosen.Ex.ID).Limit(1).Find(&row)
    if tx.Error != nil || tx.RowsAffected == 0 {
        row = models.UserExerciseVersionStats{ UserID: userID, ExerciseID: chosen.Ex.ID, SeenCount: 1, LastSeenAt: &now }
    } else {
        row.SeenCount += 1
        row.LastSeenAt = &now
    }
    _ = s.db.Save(&row).Error

    return &chosen.Ex, nil
}

// RecordVersionOutcome updates per-version and meta stats after a review
func (s *MetaExerciseService) RecordVersionOutcome(userID uint, metaExerciseID uint, versionID *uint, success bool, difficulty *int) {
    now := time.Now()
    if versionID != nil {
        var row models.UserExerciseVersionStats
        tx := s.db.Where("user_id = ? AND exercise_id = ?", userID, *versionID).Limit(1).Find(&row)
        if tx.Error == nil && tx.RowsAffected > 0 {
            if success { row.CorrectCount += 1; row.LastCorrectAt = &now }
            _ = s.db.Save(&row).Error
        }
    }
    if success && difficulty != nil {
        var meta models.UserMetaExerciseStats
        tx := s.db.Where("user_id = ? AND meta_exercise_id = ?", userID, metaExerciseID).Limit(1).Find(&meta)
        if tx.Error != nil || tx.RowsAffected == 0 {
            meta = models.UserMetaExerciseStats{ UserID: userID, MetaExerciseID: metaExerciseID, LastCorrectDifficulty: *difficulty }
        } else {
            if *difficulty > meta.LastCorrectDifficulty { meta.LastCorrectDifficulty = *difficulty }
        }
        _ = s.db.Save(&meta).Error
    }
}
