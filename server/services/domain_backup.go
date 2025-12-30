package services

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"myapp/server/models"
)

type DomainBackup struct {
	SchemaVersion int                `json:"schemaVersion"`
	ExportedAt    time.Time          `json:"exportedAt"`
	Domain        DomainBackupDomain `json:"domain"`
	OwnerUsername string             `json:"ownerUsername"`
	Data          ImportData         `json:"data"`
	SRS           *DomainSRSBackup   `json:"srs,omitempty"`
}

type DomainBackupDomain struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Privacy     string `json:"privacy"`
}

type DomainSRSBackup struct {
	Username string        `json:"username"`
	Progress []SRSProgress `json:"progress,omitempty"`
}

type SRSProgress struct {
	NodeType           string     `json:"nodeType"`
	Code               string     `json:"code"`
	Status             string     `json:"status"`
	EasinessFactor     float64    `json:"easinessFactor"`
	IntervalDays       float64    `json:"intervalDays"`
	Repetitions        int        `json:"repetitions"`
	LastReview         *time.Time `json:"lastReview,omitempty"`
	NextReview         *time.Time `json:"nextReview,omitempty"`
	BlockNegativeUntil *time.Time `json:"blockNegativeUntil,omitempty"`
	AccumulatedCredit  float64    `json:"accumulatedCredit"`
	CreditPostponed    bool       `json:"creditPostponed"`
	TotalReviews       int        `json:"totalReviews"`
	SuccessfulReviews  int        `json:"successfulReviews"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

func (s *ImportService) ExportDomainBackup(domainID uint) (*DomainBackup, error) {
	domain, err := s.domainDAO.FindByID(domainID)
	if err != nil {
		return nil, err
	}

	owner, err := s.userDAO.FindUserByID(domain.OwnerID)
	if err != nil {
		return nil, err
	}

	data, err := s.ExportDomain(domainID)
	if err != nil {
		return nil, err
	}

	progress, err := s.exportDomainSRSProgress(domainID, domain.OwnerID)
	if err != nil {
		return nil, err
	}

	backup := &DomainBackup{
		SchemaVersion: 1,
		ExportedAt:    time.Now().UTC(),
		Domain: DomainBackupDomain{
			Name:        domain.Name,
			Description: domain.Description,
			Privacy:     domain.Privacy,
		},
		OwnerUsername: owner.Username,
		Data:          *data,
	}

	if len(progress) > 0 {
		backup.SRS = &DomainSRSBackup{
			Username: owner.Username,
			Progress: progress,
		}
	}

	return backup, nil
}

func (s *ImportService) ImportDomainSRSProgress(domainID, userID uint, progress []SRSProgress) error {
	if len(progress) == 0 {
		return nil
	}

	metaDefs, metaExs, err := s.loadExistingMetaMaps(domainID)
	if err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		for _, item := range progress {
			nodeType := item.NodeType
			var nodeID uint
			switch nodeType {
			case "definition":
				if md, ok := metaDefs[item.Code]; ok {
					nodeID = md.ID
				}
			case "exercise":
				if me, ok := metaExs[item.Code]; ok {
					nodeID = me.ID
				}
			default:
				continue
			}

			if nodeID == 0 {
				continue
			}

			var existing models.UserNodeProgress
			err := tx.Where("user_id = ? AND node_id = ? AND node_type = ?", userID, nodeID, nodeType).
				First(&existing).Error
			if err != nil {
				if !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
				newProgress := &models.UserNodeProgress{
					UserID:             userID,
					NodeID:             nodeID,
					NodeType:           nodeType,
					Status:             item.Status,
					EasinessFactor:     item.EasinessFactor,
					IntervalDays:       item.IntervalDays,
					Repetitions:        item.Repetitions,
					LastReview:         item.LastReview,
					NextReview:         item.NextReview,
					BlockNegativeUntil: item.BlockNegativeUntil,
					AccumulatedCredit:  item.AccumulatedCredit,
					CreditPostponed:    item.CreditPostponed,
					TotalReviews:       item.TotalReviews,
					SuccessfulReviews:  item.SuccessfulReviews,
					CreatedAt:          item.CreatedAt,
					UpdatedAt:          item.UpdatedAt,
				}
				if err := tx.Create(newProgress).Error; err != nil {
					return fmt.Errorf("failed to create progress for %s: %v", item.Code, err)
				}
				_ = tx.Model(&models.UserNodeProgress{}).
					Where("id = ?", newProgress.ID).
					Updates(map[string]interface{}{
						"created_at": item.CreatedAt,
						"updated_at": item.UpdatedAt,
					}).Error
				continue
			}

			updates := map[string]interface{}{
				"status":               item.Status,
				"easiness_factor":      item.EasinessFactor,
				"interval_days":        item.IntervalDays,
				"repetitions":          item.Repetitions,
				"last_review":          item.LastReview,
				"next_review":          item.NextReview,
				"block_negative_until": item.BlockNegativeUntil,
				"accumulated_credit":   item.AccumulatedCredit,
				"credit_postponed":     item.CreditPostponed,
				"total_reviews":        item.TotalReviews,
				"successful_reviews":   item.SuccessfulReviews,
				"created_at":           item.CreatedAt,
				"updated_at":           item.UpdatedAt,
			}
			if err := tx.Model(&models.UserNodeProgress{}).
				Where("id = ?", existing.ID).
				Updates(updates).Error; err != nil {
				return fmt.Errorf("failed to update progress for %s: %v", item.Code, err)
			}
		}
		return nil
	})
}

func (s *ImportService) exportDomainSRSProgress(domainID, userID uint) ([]SRSProgress, error) {
	type progressRow struct {
		Code               string     `gorm:"column:code"`
		Status             string     `gorm:"column:status"`
		EasinessFactor     float64    `gorm:"column:easiness_factor"`
		IntervalDays       float64    `gorm:"column:interval_days"`
		Repetitions        int        `gorm:"column:repetitions"`
		LastReview         *time.Time `gorm:"column:last_review"`
		NextReview         *time.Time `gorm:"column:next_review"`
		BlockNegativeUntil *time.Time `gorm:"column:block_negative_until"`
		AccumulatedCredit  float64    `gorm:"column:accumulated_credit"`
		CreditPostponed    bool       `gorm:"column:credit_postponed"`
		TotalReviews       int        `gorm:"column:total_reviews"`
		SuccessfulReviews  int        `gorm:"column:successful_reviews"`
		CreatedAt          time.Time  `gorm:"column:created_at"`
		UpdatedAt          time.Time  `gorm:"column:updated_at"`
	}

	defQuery := `
		SELECT
			md.code as code,
			unp.status as status,
			unp.easiness_factor,
			unp.interval_days,
			unp.repetitions,
			unp.last_review,
			unp.next_review,
			unp.block_negative_until,
			unp.accumulated_credit,
			unp.credit_postponed,
			unp.total_reviews,
			unp.successful_reviews,
			unp.created_at,
			unp.updated_at
		FROM user_node_progress unp
		JOIN meta_definitions md ON md.id = unp.node_id
		WHERE unp.user_id = ? AND unp.node_type = 'definition' AND md.domain_id = ?
	`
	exQuery := `
		SELECT
			me.code as code,
			unp.status as status,
			unp.easiness_factor,
			unp.interval_days,
			unp.repetitions,
			unp.last_review,
			unp.next_review,
			unp.block_negative_until,
			unp.accumulated_credit,
			unp.credit_postponed,
			unp.total_reviews,
			unp.successful_reviews,
			unp.created_at,
			unp.updated_at
		FROM user_node_progress unp
		JOIN meta_exercises me ON me.id = unp.node_id
		WHERE unp.user_id = ? AND unp.node_type = 'exercise' AND me.domain_id = ?
	`

	var defRows []progressRow
	if err := s.db.Raw(defQuery, userID, domainID).Scan(&defRows).Error; err != nil {
		return nil, err
	}
	var exRows []progressRow
	if err := s.db.Raw(exQuery, userID, domainID).Scan(&exRows).Error; err != nil {
		return nil, err
	}

	results := make([]SRSProgress, 0, len(defRows)+len(exRows))
	for _, row := range defRows {
		results = append(results, SRSProgress{
			NodeType:           "definition",
			Code:               row.Code,
			Status:             row.Status,
			EasinessFactor:     row.EasinessFactor,
			IntervalDays:       row.IntervalDays,
			Repetitions:        row.Repetitions,
			LastReview:         row.LastReview,
			NextReview:         row.NextReview,
			BlockNegativeUntil: row.BlockNegativeUntil,
			AccumulatedCredit:  row.AccumulatedCredit,
			CreditPostponed:    row.CreditPostponed,
			TotalReviews:       row.TotalReviews,
			SuccessfulReviews:  row.SuccessfulReviews,
			CreatedAt:          row.CreatedAt,
			UpdatedAt:          row.UpdatedAt,
		})
	}
	for _, row := range exRows {
		results = append(results, SRSProgress{
			NodeType:           "exercise",
			Code:               row.Code,
			Status:             row.Status,
			EasinessFactor:     row.EasinessFactor,
			IntervalDays:       row.IntervalDays,
			Repetitions:        row.Repetitions,
			LastReview:         row.LastReview,
			NextReview:         row.NextReview,
			BlockNegativeUntil: row.BlockNegativeUntil,
			AccumulatedCredit:  row.AccumulatedCredit,
			CreditPostponed:    row.CreditPostponed,
			TotalReviews:       row.TotalReviews,
			SuccessfulReviews:  row.SuccessfulReviews,
			CreatedAt:          row.CreatedAt,
			UpdatedAt:          row.UpdatedAt,
		})
	}

	return results, nil
}
