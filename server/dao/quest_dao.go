package dao

import (
	"errors"
	"fmt"
	"gorm.io/gorm"
	"ankidemy/server/models"
)

// MetaQuestDAO handles meta quests and versions.
type MetaQuestDAO struct {
	db *gorm.DB
}

func NewMetaQuestDAO(db *gorm.DB) *MetaQuestDAO {
	return &MetaQuestDAO{db: db}
}

func (d *MetaQuestDAO) Create(meta *models.MetaQuest, initialVersion *models.QuestVersion, ownerID uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(meta).Error; err != nil {
			return err
		}
		registry := NewCodeRegistryDAO(tx)
		if err := registry.ReserveCode(tx, meta.DomainID, meta.Code, "meta_quest", meta.ID); err != nil {
			return err
		}
		if initialVersion != nil {
			initialVersion.MetaQuestID = meta.ID
			if err := tx.Create(initialVersion).Error; err != nil {
				return err
			}
		}
		// Ensure owner has state row
		state := &models.UserMetaQuestState{
			UserID:      ownerID,
			MetaQuestID: meta.ID,
			Active:      true,
		}
		if err := tx.FirstOrCreate(state, "user_id = ? AND meta_quest_id = ?", ownerID, meta.ID).Error; err != nil {
			return err
		}
		return nil
	})
}

func (d *MetaQuestDAO) Update(meta *models.MetaQuest, codeChanged bool) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(meta).Error; err != nil {
			return err
		}
		if codeChanged {
			registry := NewCodeRegistryDAO(tx)
			if err := registry.UpdateCode(tx, meta.DomainID, "meta_quest", meta.ID, meta.Code); err != nil {
				return err
			}
		}
		return nil
	})
}

func (d *MetaQuestDAO) Delete(meta *models.MetaQuest) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.MetaQuest{}, meta.ID).Error; err != nil {
			return err
		}
		registry := NewCodeRegistryDAO(tx)
		return registry.ReleaseCode(tx, meta.DomainID, "meta_quest", meta.ID)
	})
}

func (d *MetaQuestDAO) FindByID(id uint) (*models.MetaQuest, []models.QuestVersion, error) {
	var meta models.MetaQuest
	if err := d.db.First(&meta, id).Error; err != nil {
		return nil, nil, err
	}
	var versions []models.QuestVersion
	if err := d.db.Where("meta_quest_id = ?", meta.ID).Order("id ASC").Find(&versions).Error; err != nil {
		return &meta, nil, err
	}
	return &meta, versions, nil
}

func (d *MetaQuestDAO) ListVisible(domainID uint, userID uint) ([]models.MetaQuest, error) {
	var quests []models.MetaQuest
	if err := d.db.Where("domain_id = ? AND (visibility = 'domain' OR owner_id = ?)", domainID, userID).
		Find(&quests).Error; err != nil {
		return nil, err
	}
	return quests, nil
}

func (d *MetaQuestDAO) ListByDomain(domainID uint) ([]models.MetaQuest, error) {
	var quests []models.MetaQuest
	if err := d.db.Where("domain_id = ?", domainID).Find(&quests).Error; err != nil {
		return nil, err
	}
	return quests, nil
}

func (d *MetaQuestDAO) AddVersion(metaQuestID uint, version *models.QuestVersion) error {
	version.MetaQuestID = metaQuestID
	return d.db.Create(version).Error
}

func (d *MetaQuestDAO) UpdateVersion(version *models.QuestVersion) error {
	return d.db.Save(version).Error
}

func (d *MetaQuestDAO) DeleteVersion(versionID uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		var version models.QuestVersion
		if err := tx.First(&version, versionID).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&models.QuestVersion{}).Where("meta_quest_id = ?", version.MetaQuestID).Count(&count).Error; err != nil {
			return err
		}
		if count <= 1 {
			return errors.New("cannot delete last version")
		}
		return tx.Delete(&models.QuestVersion{}, versionID).Error
	})
}

func (d *MetaQuestDAO) FindVersionByID(versionID uint) (*models.QuestVersion, error) {
	var version models.QuestVersion
	if err := d.db.First(&version, versionID).Error; err != nil {
		return nil, err
	}
	return &version, nil
}

func (d *MetaQuestDAO) FindVersions(metaQuestID uint) ([]models.QuestVersion, error) {
	var versions []models.QuestVersion
	if err := d.db.Where("meta_quest_id = ?", metaQuestID).Order("id ASC").Find(&versions).Error; err != nil {
		return nil, err
	}
	return versions, nil
}

func (d *MetaQuestDAO) GetUserState(userID uint, metaQuestID uint) (*models.UserMetaQuestState, error) {
	var state models.UserMetaQuestState
	if err := d.db.Where("user_id = ? AND meta_quest_id = ?", userID, metaQuestID).First(&state).Error; err != nil {
		return nil, err
	}
	return &state, nil
}

func (d *MetaQuestDAO) UpsertUserState(state *models.UserMetaQuestState) error {
	return d.db.Save(state).Error
}

func (d *MetaQuestDAO) EnsureUserState(userID uint, metaQuestID uint) (*models.UserMetaQuestState, error) {
	state := &models.UserMetaQuestState{
		UserID:      userID,
		MetaQuestID: metaQuestID,
		Active:      true,
	}
	if err := d.db.FirstOrCreate(state, "user_id = ? AND meta_quest_id = ?", userID, metaQuestID).Error; err != nil {
		return nil, err
	}
	return state, nil
}

func (d *MetaQuestDAO) ListUserStates(userID uint, metaQuestIDs []uint) ([]models.UserMetaQuestState, error) {
	if len(metaQuestIDs) == 0 {
		return []models.UserMetaQuestState{}, nil
	}
	var states []models.UserMetaQuestState
	if err := d.db.Where("user_id = ? AND meta_quest_id IN ?", userID, metaQuestIDs).Find(&states).Error; err != nil {
		return nil, err
	}
	return states, nil
}

func (d *MetaQuestDAO) CreateEvent(event *models.QuestEvent) error {
	return d.db.Create(event).Error
}

func (d *MetaQuestDAO) CreateDailyDraw(draw *models.UserDailyQuestDraw) error {
	return d.db.Create(draw).Error
}

func (d *MetaQuestDAO) FindDailyDraw(userID uint, domainID uint, dateKey string) (*models.UserDailyQuestDraw, error) {
	var draw models.UserDailyQuestDraw
	if err := d.db.Where("user_id = ? AND domain_id = ? AND date_key = ?", userID, domainID, dateKey).First(&draw).Error; err != nil {
		return nil, err
	}
	return &draw, nil
}

func (d *MetaQuestDAO) UpdateUserState(state *models.UserMetaQuestState) error {
	if state.ID == 0 {
		return fmt.Errorf("user_meta_quest_state missing ID")
	}
	return d.db.Save(state).Error
}
