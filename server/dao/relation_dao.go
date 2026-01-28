package dao

import (
	"strconv"

	"gorm.io/gorm"
	"myapp/server/models"
)

// NodeRelationDAO handles typed relations between nodes.
type NodeRelationDAO struct {
	db *gorm.DB
}

func NewNodeRelationDAO(db *gorm.DB) *NodeRelationDAO {
	return &NodeRelationDAO{db: db}
}

func (d *NodeRelationDAO) Create(relation *models.NodeRelation) error {
	return d.db.Create(relation).Error
}

func (d *NodeRelationDAO) Delete(id uint) error {
	return d.db.Delete(&models.NodeRelation{}, id).Error
}

func (d *NodeRelationDAO) FindByID(id uint) (*models.NodeRelation, error) {
	var relation models.NodeRelation
	if err := d.db.First(&relation, id).Error; err != nil {
		return nil, err
	}
	return &relation, nil
}

func (d *NodeRelationDAO) ListByDomain(domainID uint) ([]models.NodeRelation, error) {
	var relations []models.NodeRelation
	if err := d.db.Where("domain_id = ?", domainID).Find(&relations).Error; err != nil {
		return nil, err
	}
	return relations, nil
}

func (d *NodeRelationDAO) ReplaceQuestVersionRelations(domainID uint, metaQuestID uint, versionID uint, relations []models.NodeRelation) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		contextKey := "quest_version:" + strconv.FormatUint(uint64(versionID), 10)
		if err := tx.Where("domain_id = ? AND from_type = ? AND from_id = ? AND context_key = ?", domainID, "meta_quest", metaQuestID, contextKey).
			Delete(&models.NodeRelation{}).Error; err != nil {
			return err
		}
		for i := range relations {
			relations[i].ContextKey = contextKey
			if err := tx.Create(&relations[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (d *NodeRelationDAO) ListByContext(domainID uint, contextKey string) ([]models.NodeRelation, error) {
	var relations []models.NodeRelation
	if err := d.db.Where("domain_id = ? AND context_key = ?", domainID, contextKey).Find(&relations).Error; err != nil {
		return nil, err
	}
	return relations, nil
}
