package dao

import (
	"ankidemy/server/models"
	"errors"
	"fmt"
	"gorm.io/gorm"
)

// QuestDAO handles quests and versions.
type QuestDAO struct {
	db *gorm.DB
}

func NewQuestDAO(db *gorm.DB) *QuestDAO {
	return &QuestDAO{db: db}
}

func (d *QuestDAO) Create(meta *models.Quest, initialVersion *models.QuestVersion, ownerID uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(meta).Error; err != nil {
			return err
		}
		registry := NewCodeRegistryDAO(tx)
		if err := registry.ReserveCode(tx, meta.DomainID, meta.Code, "quest", meta.ID); err != nil {
			return err
		}
		if initialVersion != nil {
			initialVersion.QuestID = meta.ID
			if err := tx.Create(initialVersion).Error; err != nil {
				return err
			}
		}
		// Ensure owner has state row
		state := &models.UserQuestState{
			UserID:  ownerID,
			QuestID: meta.ID,
			Active:  true,
		}
		if err := tx.FirstOrCreate(state, "user_id = ? AND quest_id = ?", ownerID, meta.ID).Error; err != nil {
			return err
		}
		return nil
	})
}

func (d *QuestDAO) Update(meta *models.Quest, codeChanged bool) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(meta).Error; err != nil {
			return err
		}
		if codeChanged {
			registry := NewCodeRegistryDAO(tx)
			if err := registry.UpdateCode(tx, meta.DomainID, "quest", meta.ID, meta.Code); err != nil {
				return err
			}
		}
		return nil
	})
}

func (d *QuestDAO) Delete(meta *models.Quest) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.Quest{}, meta.ID).Error; err != nil {
			return err
		}
		registry := NewCodeRegistryDAO(tx)
		return registry.ReleaseCode(tx, meta.DomainID, "quest", meta.ID)
	})
}

func (d *QuestDAO) FindByID(id uint) (*models.Quest, []models.QuestVersion, error) {
	var meta models.Quest
	if err := d.db.First(&meta, id).Error; err != nil {
		return nil, nil, err
	}
	var versions []models.QuestVersion
	if err := d.db.Where("quest_id = ?", meta.ID).Order("id ASC").Find(&versions).Error; err != nil {
		return &meta, nil, err
	}
	return &meta, versions, nil
}

func (d *QuestDAO) ListVisible(domainID uint, userID uint) ([]models.Quest, error) {
	var quests []models.Quest
	if err := d.db.Where("domain_id = ? AND (visibility = 'domain' OR owner_id = ?)", domainID, userID).
		Find(&quests).Error; err != nil {
		return nil, err
	}
	return quests, nil
}

func (d *QuestDAO) ListByDomain(domainID uint) ([]models.Quest, error) {
	var quests []models.Quest
	if err := d.db.Where("domain_id = ?", domainID).Find(&quests).Error; err != nil {
		return nil, err
	}
	return quests, nil
}

func (d *QuestDAO) AddVersion(questID uint, version *models.QuestVersion) error {
	version.QuestID = questID
	return d.db.Create(version).Error
}

func (d *QuestDAO) UpdateVersion(version *models.QuestVersion) error {
	return d.db.Save(version).Error
}

func (d *QuestDAO) DeleteVersion(versionID uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		var version models.QuestVersion
		if err := tx.First(&version, versionID).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&models.QuestVersion{}).Where("quest_id = ?", version.QuestID).Count(&count).Error; err != nil {
			return err
		}
		if count <= 1 {
			return errors.New("cannot delete last version")
		}
		return tx.Delete(&models.QuestVersion{}, versionID).Error
	})
}

func (d *QuestDAO) FindVersionByID(versionID uint) (*models.QuestVersion, error) {
	var version models.QuestVersion
	if err := d.db.First(&version, versionID).Error; err != nil {
		return nil, err
	}
	return &version, nil
}

func (d *QuestDAO) FindVersions(questID uint) ([]models.QuestVersion, error) {
	var versions []models.QuestVersion
	if err := d.db.Where("quest_id = ?", questID).Order("id ASC").Find(&versions).Error; err != nil {
		return nil, err
	}
	return versions, nil
}

func (d *QuestDAO) GetUserState(userID uint, questID uint) (*models.UserQuestState, error) {
	var state models.UserQuestState
	if err := d.db.Where("user_id = ? AND quest_id = ?", userID, questID).First(&state).Error; err != nil {
		return nil, err
	}
	return &state, nil
}

func (d *QuestDAO) UpsertUserState(state *models.UserQuestState) error {
	return d.db.Save(state).Error
}

func (d *QuestDAO) EnsureUserState(userID uint, questID uint) (*models.UserQuestState, error) {
	state := &models.UserQuestState{
		UserID:  userID,
		QuestID: questID,
		Active:  true,
	}
	if err := d.db.FirstOrCreate(state, "user_id = ? AND quest_id = ?", userID, questID).Error; err != nil {
		return nil, err
	}
	return state, nil
}

func (d *QuestDAO) ListUserStates(userID uint, questIDs []uint) ([]models.UserQuestState, error) {
	if len(questIDs) == 0 {
		return []models.UserQuestState{}, nil
	}
	var states []models.UserQuestState
	if err := d.db.Where("user_id = ? AND quest_id IN ?", userID, questIDs).Find(&states).Error; err != nil {
		return nil, err
	}
	return states, nil
}

func (d *QuestDAO) CreateEvent(event *models.QuestEvent) error {
	return d.db.Create(event).Error
}

func (d *QuestDAO) CreateDailyDraw(draw *models.UserDailyQuestDraw) error {
	return d.db.Create(draw).Error
}

func (d *QuestDAO) FindDailyDraw(userID uint, domainID uint, dateKey string) (*models.UserDailyQuestDraw, error) {
	var draw models.UserDailyQuestDraw
	if err := d.db.Where("user_id = ? AND domain_id = ? AND date_key = ?", userID, domainID, dateKey).First(&draw).Error; err != nil {
		return nil, err
	}
	return &draw, nil
}

func (d *QuestDAO) UpdateUserState(state *models.UserQuestState) error {
	if state.ID == 0 {
		return fmt.Errorf("user_quest_state missing ID")
	}
	return d.db.Save(state).Error
}
