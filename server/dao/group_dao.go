package dao

import (
	"errors"

	"ankidemy/server/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GroupDAO handles operations related to node groups.
type GroupDAO struct {
	db *gorm.DB
}

func NewGroupDAO(db *gorm.DB) *GroupDAO {
	return &GroupDAO{db: db}
}

func (d *GroupDAO) FindByID(id uint) (*models.NodeGroup, error) {
	var group models.NodeGroup
	if err := d.db.First(&group, id).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

func (d *GroupDAO) ListByDomainID(domainID uint) ([]models.NodeGroup, []models.NodeGroupSeed, []models.NodeGroupMember, error) {
	var groups []models.NodeGroup
	if err := d.db.Where("domain_id = ?", domainID).Order("id ASC").Find(&groups).Error; err != nil {
		return nil, nil, nil, err
	}
	if len(groups) == 0 {
		return []models.NodeGroup{}, []models.NodeGroupSeed{}, []models.NodeGroupMember{}, nil
	}

	groupIDs := make([]uint, 0, len(groups))
	for _, g := range groups {
		groupIDs = append(groupIDs, g.ID)
	}

	var seeds []models.NodeGroupSeed
	if err := d.db.Where("group_id IN ?", groupIDs).Find(&seeds).Error; err != nil {
		return nil, nil, nil, err
	}

	var members []models.NodeGroupMember
	if err := d.db.Where("group_id IN ?", groupIDs).Find(&members).Error; err != nil {
		return nil, nil, nil, err
	}

	return groups, seeds, members, nil
}

func (d *GroupDAO) Create(group *models.NodeGroup, seeds []models.NodeGroupSeed, members []models.NodeGroupMember) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(group).Error; err != nil {
			return err
		}

		for i := range seeds {
			seeds[i].GroupID = group.ID
		}
		if len(seeds) > 0 {
			if err := tx.Create(&seeds).Error; err != nil {
				return err
			}
		}

		for i := range members {
			members[i].GroupID = group.ID
		}
		if len(members) > 0 {
			if err := tx.Create(&members).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

func (d *GroupDAO) Update(group *models.NodeGroup, seeds *[]models.NodeGroupSeed, members *[]models.NodeGroupMember) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.NodeGroup{}).Where("id = ?", group.ID).Updates(map[string]interface{}{
			"name":       group.Name,
			"is_exact":   group.IsExact,
			"x_position": group.XPosition,
			"y_position": group.YPosition,
		}).Error; err != nil {
			return err
		}

		if seeds != nil {
			if err := tx.Where("group_id = ?", group.ID).Delete(&models.NodeGroupSeed{}).Error; err != nil {
				return err
			}
			for i := range *seeds {
				(*seeds)[i].GroupID = group.ID
			}
			if len(*seeds) > 0 {
				if err := tx.Create(seeds).Error; err != nil {
					return err
				}
			}
		}

		if members != nil {
			if err := tx.Where("group_id = ?", group.ID).Delete(&models.NodeGroupMember{}).Error; err != nil {
				return err
			}
			for i := range *members {
				(*members)[i].GroupID = group.ID
			}
			if len(*members) > 0 {
				if err := tx.Create(members).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})
}

func (d *GroupDAO) Delete(groupID uint) error {
	return d.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("group_id = ?", groupID).Delete(&models.NodeGroupSeed{}).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ?", groupID).Delete(&models.NodeGroupMember{}).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ?", groupID).Delete(&models.UserGroupState{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.NodeGroup{}, groupID).Error; err != nil {
			return err
		}
		return nil
	})
}

func (d *GroupDAO) UpdatePositions(domainID uint, positions map[uint]struct{ X, Y float64 }) error {
	if len(positions) == 0 {
		return nil
	}
	return d.db.Transaction(func(tx *gorm.DB) error {
		for groupID, pos := range positions {
			res := tx.Model(&models.NodeGroup{}).
				Where("id = ? AND domain_id = ?", groupID, domainID).
				Updates(map[string]interface{}{
					"x_position": pos.X,
					"y_position": pos.Y,
				})
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return errors.New("group not found")
			}
		}
		return nil
	})
}

func (d *GroupDAO) UpsertUserState(userID uint, groupID uint, collapsed bool) error {
	state := models.UserGroupState{
		UserID:    userID,
		GroupID:   groupID,
		Collapsed: collapsed,
	}
	return d.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "group_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"collapsed", "updated_at"}),
	}).Create(&state).Error
}

func (d *GroupDAO) ListUserStates(userID uint, groupIDs []uint) ([]models.UserGroupState, error) {
	if len(groupIDs) == 0 {
		return []models.UserGroupState{}, nil
	}
	var states []models.UserGroupState
	if err := d.db.Where("user_id = ? AND group_id IN ?", userID, groupIDs).Find(&states).Error; err != nil {
		return nil, err
	}
	return states, nil
}
