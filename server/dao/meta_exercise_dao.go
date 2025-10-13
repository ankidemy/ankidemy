package dao

import (
    "errors"
    "myapp/server/models"
    "gorm.io/gorm"
)

// MetaExerciseDAO handles DB operations for meta exercises and versions
type MetaExerciseDAO struct{ db *gorm.DB }

func NewMetaExerciseDAO(db *gorm.DB) *MetaExerciseDAO { return &MetaExerciseDAO{db: db} }

// Create a meta exercise and its prerequisites
func (d *MetaExerciseDAO) Create(meta *models.MetaExercise, prerequisiteIDs []uint, weights map[uint]float64) error {
    return d.db.Transaction(func(tx *gorm.DB) error {
        if err := tx.Create(meta).Error; err != nil { return err }

        // Attach prerequisites (definition -> meta_exercise)
        for _, pid := range prerequisiteIDs {
            var cnt int64
            if err := tx.Model(&models.Definition{}).Where("id = ?", pid).Count(&cnt).Error; err != nil { return err }
            if cnt == 0 { continue }
            w := 1.0
            if weights != nil {
                if val, ok := weights[pid]; ok {
                    if val < 0.01 { w = 0.01 } else if val > 1.0 { w = 1.0 } else { w = val }
                }
            }
            p := &models.NodePrerequisite{ NodeID: meta.ID, NodeType: "meta_exercise", PrerequisiteID: pid, PrerequisiteType: "definition", Weight: w }
            _ = tx.Create(p).Error
        }
        return nil
    })
}

// Update meta and reset prerequisites
func (d *MetaExerciseDAO) Update(meta *models.MetaExercise, prerequisiteIDs []uint, weights map[uint]float64) error {
    return d.db.Transaction(func(tx *gorm.DB) error {
        if err := tx.Save(meta).Error; err != nil { return err }
        if err := tx.Where("node_id = ? AND node_type = ?", meta.ID, "meta_exercise").Delete(&models.NodePrerequisite{}).Error; err != nil { return err }
        for _, pid := range prerequisiteIDs {
            var cnt int64
            if err := tx.Model(&models.Definition{}).Where("id = ?", pid).Count(&cnt).Error; err != nil { return err }
            if cnt == 0 { continue }
            w := 1.0
            if weights != nil { if val, ok := weights[pid]; ok { if val < 0.01 { w = 0.01 } else if val > 1.0 { w = 1.0 } else { w = val } } }
            p := &models.NodePrerequisite{ NodeID: meta.ID, NodeType: "meta_exercise", PrerequisiteID: pid, PrerequisiteType: "definition", Weight: w }
            _ = tx.Create(p).Error
        }
        return nil
    })
}

// AddVersion creates a new Exercise row under a MetaExercise
func (d *MetaExerciseDAO) AddVersion(metaID uint, req *models.ExerciseVersionRequest) (*models.Exercise, error) {
    // Load meta for mirroring fields
    var meta models.MetaExercise
    if err := d.db.First(&meta, metaID).Error; err != nil { return nil, err }
    ex := &models.Exercise{
        Code: meta.Code,
        Name: meta.Name,
        Statement: req.Statement,
        Description: req.Description,
        Notes: req.Notes,
        Hints: req.Hints,
        DomainID: meta.DomainID,
        OwnerID: meta.OwnerID,
        MetaExerciseID: meta.ID,
        Verifiable: req.Verifiable,
        Result: req.Result,
        Difficulty: req.Difficulty,
        XPosition: meta.XPosition,
        YPosition: meta.YPosition,
    }
    if err := d.db.Create(ex).Error; err != nil { return nil, err }
    return ex, nil
}

// UpdateVersion updates an existing Exercise version (statement/solution/etc)
func (d *MetaExerciseDAO) UpdateVersion(versionID uint, req *models.ExerciseVersionRequest) (*models.Exercise, error) {
    var ex models.Exercise
    if err := d.db.First(&ex, versionID).Error; err != nil { return nil, err }
    if req.Statement != "" { ex.Statement = req.Statement }
    ex.Description = req.Description
    ex.Notes = req.Notes
    ex.Hints = req.Hints
    ex.Verifiable = req.Verifiable
    ex.Result = req.Result
    if req.Difficulty >= 1 && req.Difficulty <= 7 { ex.Difficulty = req.Difficulty }
    if err := d.db.Save(&ex).Error; err != nil { return nil, err }
    return &ex, nil
}

// DeleteVersion removes an Exercise version
func (d *MetaExerciseDAO) DeleteVersion(versionID uint) error {
    return d.db.Delete(&models.Exercise{}, versionID).Error
}

// FindByID returns meta and versions
func (d *MetaExerciseDAO) FindByID(id uint) (*models.MetaExercise, []models.Exercise, error) {
    var meta models.MetaExercise
    if err := d.db.First(&meta, id).Error; err != nil { return nil, nil, err }
    var versions []models.Exercise
    if err := d.db.Where("meta_exercise_id = ?", id).Order("id ASC").Find(&versions).Error; err != nil { return nil, nil, err }
    return &meta, versions, nil
}

func (d *MetaExerciseDAO) FindByCodeAndDomain(code string, domainID uint) (*models.MetaExercise, []models.Exercise, error) {
    var meta models.MetaExercise
    res := d.db.Where("code = ? AND domain_id = ?", code, domainID).First(&meta)
    if res.Error != nil {
        if errors.Is(res.Error, gorm.ErrRecordNotFound) { return nil, nil, errors.New("meta exercise not found") }
        return nil, nil, res.Error
    }
    var versions []models.Exercise
    if err := d.db.Where("meta_exercise_id = ?", meta.ID).Order("id ASC").Find(&versions).Error; err != nil { return nil, nil, err }
    return &meta, versions, nil
}

func (d *MetaExerciseDAO) GetByDomainID(domainID uint) ([]models.MetaExercise, error) {
    var metas []models.MetaExercise
    if err := d.db.Where("domain_id = ?", domainID).Find(&metas).Error; err != nil { return nil, err }
    return metas, nil
}

// ConvertToResponse builds a response including prerequisite codes/weights and optionally versions
func (d *MetaExerciseDAO) ConvertToResponse(meta *models.MetaExercise, versions []models.Exercise, includeVersions bool) (models.MetaExerciseResponse, error) {
    // prerequisites
    var codes []string
    if err := d.db.Raw(`
        SELECT d.code FROM node_prerequisites np
        JOIN definitions d ON d.id = np.prerequisite_id
        WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'definition'
        ORDER BY d.code`, meta.ID).Scan(&codes).Error; err != nil { return models.MetaExerciseResponse{}, err }
    // weights
    type row struct{ Code string; Weight float64 }
    var rows []row
    if err := d.db.Raw(`
        SELECT d.code, np.weight FROM node_prerequisites np
        JOIN definitions d ON d.id = np.prerequisite_id
        WHERE np.node_id = ? AND np.node_type = 'meta_exercise' AND np.prerequisite_type = 'definition'
        ORDER BY d.code`, meta.ID).Scan(&rows).Error; err != nil { return models.MetaExerciseResponse{}, err }
    weights := make(map[string]float64, len(rows))
    for _, r := range rows { weights[r.Code] = r.Weight }

    resp := models.MetaExerciseResponse{
        ID: meta.ID,
        Code: meta.Code,
        Name: meta.Name,
        DomainID: meta.DomainID,
        OwnerID: meta.OwnerID,
        XPosition: meta.XPosition,
        YPosition: meta.YPosition,
        CreatedAt: meta.CreatedAt,
        UpdatedAt: meta.UpdatedAt,
        Prerequisites: codes,
        PrerequisiteWeights: weights,
        VersionCount: len(versions),
    }
    if includeVersions {
        resp.Versions = make([]models.ExerciseResponse, 0, len(versions))
        for _, v := range versions {
            resp.Versions = append(resp.Versions, models.ExerciseResponse{
                ID: v.ID,
                Code: v.Code,
                Name: v.Name,
                Statement: v.Statement,
                Description: v.Description,
                Notes: v.Notes,
                Hints: v.Hints,
                DomainID: v.DomainID,
                OwnerID: v.OwnerID,
                Verifiable: v.Verifiable,
                Result: v.Result,
                Difficulty: v.Difficulty,
                XPosition: v.XPosition,
                YPosition: v.YPosition,
                CreatedAt: v.CreatedAt,
                UpdatedAt: v.UpdatedAt,
            })
        }
    }
    return resp, nil
}

