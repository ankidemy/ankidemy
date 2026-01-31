package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"myapp/server/models"
)

type DomainBackup struct {
	SchemaVersion int                `json:"schemaVersion"`
	ExportedAt    time.Time          `json:"exportedAt"`
	Domain        DomainBackupDomain `json:"domain"`
	OwnerUsername string             `json:"ownerUsername"`
	Data          ImportData         `json:"data"`
	UserState     *DomainUserStateBackup `json:"userState,omitempty"`
	SRS           *DomainSRSBackup       `json:"srs,omitempty"`
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

type DomainUserStateBackup struct {
	Username           string                 `json:"username"`
	PrivateSources     map[string]ImportSourceNode `json:"privateSources,omitempty"`
	PrivateQuests      map[string]ImportMetaQuestNode `json:"privateQuests,omitempty"`
	PrivateRelations   []ImportRelation       `json:"privateRelations,omitempty"`
	QuestStates        []QuestStateBackup     `json:"questStates,omitempty"`
	QuestEvents        []QuestEventBackup     `json:"questEvents,omitempty"`
	UserDomainSettings *UserDomainSettingsBackup `json:"userDomainSettings,omitempty"`
	SRSProgress        []SRSProgress          `json:"srsProgress,omitempty"`
}

type UserDomainSettingsBackup struct {
	Timezone              string `json:"timezone"`
	DailyQuestLimit       int    `json:"dailyQuestLimit"`
	DailyQuestCooldownDays int   `json:"dailyQuestCooldownDays"`
	Preferences           json.RawMessage `json:"preferences,omitempty"`
}

type QuestStateBackup struct {
	MetaQuestCode      string     `json:"metaQuestCode"`
	Active             bool       `json:"active"`
	NextDueAt          *time.Time `json:"nextDueAt,omitempty"`
	SnoozedUntil       *time.Time `json:"snoozedUntil,omitempty"`
	LastPresentedAt    *time.Time `json:"lastPresentedAt,omitempty"`
	LastCompletedAt    *time.Time `json:"lastCompletedAt,omitempty"`
	CurrentStreak       int       `json:"currentStreak"`
	CurrentPeriodKey    *string   `json:"currentPeriodKey,omitempty"`
	CurrentPeriodCount  int       `json:"currentPeriodCount"`
	LastShownAt         *time.Time `json:"lastShownAt,omitempty"`
}

type QuestEventBackup struct {
	MetaQuestCode     string     `json:"metaQuestCode"`
	QuestVersionIndex *int       `json:"questVersionIndex,omitempty"`
	EventType         string     `json:"eventType"`
	HappenedAt        time.Time  `json:"happenedAt"`
	Note              *string    `json:"note,omitempty"`
	Payload           json.RawMessage `json:"payload,omitempty"`
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

func (s *ImportService) ExportDomainBackup(domainID uint, userID uint) (*DomainBackup, error) {
	domain, err := s.domainDAO.FindByID(domainID)
	if err != nil {
		return nil, err
	}

	owner, err := s.userDAO.FindUserByID(domain.OwnerID)
	if err != nil {
		return nil, err
	}

	requestingUser, err := s.userDAO.FindUserByID(userID)
	if err != nil {
		return nil, err
	}

	data, err := s.ExportDomain(domainID)
	if err != nil {
		return nil, err
	}

	progress, err := s.exportDomainSRSProgress(domainID, userID)
	if err != nil {
		return nil, err
	}

	backup := &DomainBackup{
		SchemaVersion: 2,
		ExportedAt:    time.Now().UTC(),
		Domain: DomainBackupDomain{
			Name:        domain.Name,
			Description: domain.Description,
			Privacy:     domain.Privacy,
		},
		OwnerUsername: owner.Username,
		Data:          *data,
	}

	userState, err := s.exportUserState(domainID, userID)
	if err != nil {
		return nil, err
	}
	userState.Username = requestingUser.Username
	userState.SRSProgress = progress
	backup.UserState = userState

	if len(progress) > 0 {
		backup.SRS = &DomainSRSBackup{
			Username: requestingUser.Username,
			Progress: progress,
		}
	}

	return backup, nil
}

func (s *ImportService) exportUserState(domainID uint, userID uint) (*DomainUserStateBackup, error) {
	state := &DomainUserStateBackup{
		PrivateSources: make(map[string]ImportSourceNode),
		PrivateQuests:  make(map[string]ImportMetaQuestNode),
	}

	var privateSources []models.Source
	if err := s.db.Where("domain_id = ? AND owner_id = ? AND visibility = 'private'", domainID, userID).Find(&privateSources).Error; err != nil {
		return nil, err
	}
	for _, src := range privateSources {
		state.PrivateSources[src.Code] = ImportSourceNode{
			Code:      src.Code,
			Title:     src.Title,
			ContentMd: src.ContentMd,
			BibtexKey: src.BibtexKey,
			FilePath:  src.FilePath,
			XPosition: src.XPosition,
			YPosition: src.YPosition,
		}
	}

	var privateQuests []models.MetaQuest
	if err := s.db.Where("domain_id = ? AND owner_id = ? AND visibility = 'private'", domainID, userID).Find(&privateQuests).Error; err != nil {
		return nil, err
	}
	for _, q := range privateQuests {
		var versions []models.QuestVersion
		if err := s.db.Where("meta_quest_id = ?", q.ID).Order("id ASC").Find(&versions).Error; err != nil {
			return nil, err
		}
		vnodes := make([]ImportQuestVersion, 0, len(versions))
		for _, v := range versions {
			vnodes = append(vnodes, ImportQuestVersion{
				Title:         v.Title,
				DescriptionMd: v.DescriptionMd,
				TaskList:      v.TaskList,
				ImagePath:     v.ImagePath,
			})
		}
		state.PrivateQuests[q.Code] = ImportMetaQuestNode{
			Code:      q.Code,
			Kind:      q.Kind,
			Schedule:  q.Schedule,
			XPosition: q.XPosition,
			YPosition: q.YPosition,
			Versions:  vnodes,
		}
	}

	// Private relations (links involving private sources or private quests)
	privateSourceIDs := make([]uint, 0, len(privateSources))
	privateQuestIDs := make([]uint, 0, len(privateQuests))
	for _, src := range privateSources {
		privateSourceIDs = append(privateSourceIDs, src.ID)
	}
	for _, q := range privateQuests {
		privateQuestIDs = append(privateQuestIDs, q.ID)
	}
	if len(privateSourceIDs) > 0 || len(privateQuestIDs) > 0 {
		var codes []models.DomainNodeCode
		if err := s.db.Where("domain_id = ?", domainID).Find(&codes).Error; err != nil {
			return nil, err
		}
		codeMap := map[string]map[uint]string{}
		for _, c := range codes {
			if codeMap[c.NodeType] == nil {
				codeMap[c.NodeType] = map[uint]string{}
			}
			codeMap[c.NodeType][c.NodeID] = c.Code
		}

		var relations []models.NodeRelation
		query := s.db.Where("domain_id = ?", domainID)
		if len(privateSourceIDs) > 0 && len(privateQuestIDs) > 0 {
			query = query.Where("(from_type = 'source' AND from_id IN ?) OR (to_type = 'source' AND to_id IN ?) OR (from_type = 'meta_quest' AND from_id IN ?) OR (to_type = 'meta_quest' AND to_id IN ?)",
				privateSourceIDs, privateSourceIDs, privateQuestIDs, privateQuestIDs)
		} else if len(privateSourceIDs) > 0 {
			query = query.Where("(from_type = 'source' AND from_id IN ?) OR (to_type = 'source' AND to_id IN ?)", privateSourceIDs, privateSourceIDs)
		} else if len(privateQuestIDs) > 0 {
			query = query.Where("(from_type = 'meta_quest' AND from_id IN ?) OR (to_type = 'meta_quest' AND to_id IN ?)", privateQuestIDs, privateQuestIDs)
		}
		if err := query.Find(&relations).Error; err != nil {
			return nil, err
		}
		state.PrivateRelations = make([]ImportRelation, 0, len(relations))
		for _, rel := range relations {
			fromCode := codeMap[rel.FromType][rel.FromID]
			toCode := codeMap[rel.ToType][rel.ToID]
			if fromCode == "" || toCode == "" {
				continue
			}
			state.PrivateRelations = append(state.PrivateRelations, ImportRelation{
				FromType:     rel.FromType,
				FromCode:     fromCode,
				ToType:       rel.ToType,
				ToCode:       toCode,
				RelationType: rel.RelationType,
				ContextKey:   rel.ContextKey,
			})
		}
	}

	// User quest states
	type stateRow struct {
		models.UserMetaQuestState
		Code string
	}
	rows := []stateRow{}
	if err := s.db.Table("user_meta_quest_state ums").
		Select("ums.*, mq.code").
		Joins("JOIN meta_quests mq ON mq.id = ums.meta_quest_id").
		Where("ums.user_id = ? AND mq.domain_id = ?", userID, domainID).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	state.QuestStates = make([]QuestStateBackup, 0, len(rows))
	for _, row := range rows {
		state.QuestStates = append(state.QuestStates, QuestStateBackup{
			MetaQuestCode:     row.Code,
			Active:            row.Active,
			NextDueAt:         row.NextDueAt,
			SnoozedUntil:      row.SnoozedUntil,
			LastPresentedAt:   row.LastPresentedAt,
			LastCompletedAt:   row.LastCompletedAt,
			CurrentStreak:     row.CurrentStreak,
			CurrentPeriodKey:  row.CurrentPeriodKey,
			CurrentPeriodCount: row.CurrentPeriodCount,
			LastShownAt:       row.LastShownAt,
		})
	}

	// Quest events
	type eventRow struct {
		models.QuestEvent
		Code string
	}
	events := []eventRow{}
	if err := s.db.Table("quest_events qe").
		Select("qe.*, mq.code").
		Joins("JOIN meta_quests mq ON mq.id = qe.meta_quest_id").
		Where("qe.user_id = ? AND mq.domain_id = ?", userID, domainID).
		Order("qe.happened_at ASC").
		Scan(&events).Error; err != nil {
		return nil, err
	}

	versionIndexByID := map[uint]int{}
	var versions []models.QuestVersion
	if err := s.db.Joins("JOIN meta_quests mq ON mq.id = quest_versions.meta_quest_id").
		Where("mq.domain_id = ?", domainID).
		Order("quest_versions.id ASC").
		Find(&versions).Error; err == nil {
		for idx, v := range versions {
			versionIndexByID[v.ID] = idx
		}
	}
	state.QuestEvents = make([]QuestEventBackup, 0, len(events))
	for _, ev := range events {
		var indexPtr *int
		if ev.QuestVersionID != nil {
			if idx, ok := versionIndexByID[*ev.QuestVersionID]; ok {
				indexPtr = &idx
			}
		}
		state.QuestEvents = append(state.QuestEvents, QuestEventBackup{
			MetaQuestCode:     ev.Code,
			QuestVersionIndex: indexPtr,
			EventType:         ev.EventType,
			HappenedAt:        ev.HappenedAt,
			Note:              ev.Note,
			Payload:           ev.Payload,
		})
	}

	// User domain settings
	var settings models.UserDomainSettings
	if err := s.db.Where("user_id = ? AND domain_id = ?", userID, domainID).First(&settings).Error; err == nil {
		state.UserDomainSettings = &UserDomainSettingsBackup{
			Timezone:               settings.Timezone,
			DailyQuestLimit:        settings.DailyQuestLimit,
			DailyQuestCooldownDays: settings.DailyQuestCooldownDays,
			Preferences:            settings.Preferences,
		}
	}

	return state, nil
}

func (s *ImportService) ImportUserState(domainID uint, userID uint, state *DomainUserStateBackup) error {
	if state == nil {
		return nil
	}

	existingCodeMap, err := s.loadExistingCodeMap(domainID)
	if err != nil {
		return err
	}
	codesInUse := map[string]bool{}
	for code := range existingCodeMap {
		codesInUse[code] = true
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// Private sources
		privateSourceAssigned := make(map[string]string)
		for _, src := range state.PrivateSources {
			code := src.Code
			if code == "" {
				continue
			}
			assigned := code
			if codesInUse[assigned] {
				assigned = uniqueCodeFor(assigned, codesInUse)
			}
			source := &models.Source{
				DomainID:   domainID,
				OwnerID:    userID,
				Code:       assigned,
				Title:      src.Title,
				ContentMd:  src.ContentMd,
				BibtexKey:  src.BibtexKey,
				FilePath:   src.FilePath,
				XPosition:  src.XPosition,
				YPosition:  src.YPosition,
				Visibility: "private",
			}
			if err := tx.Create(source).Error; err != nil {
				return err
			}
			if err := tx.Create(&models.DomainNodeCode{
				DomainID: domainID,
				Code:     assigned,
				NodeType: "source",
				NodeID:   source.ID,
			}).Error; err != nil {
				return err
			}
			codesInUse[assigned] = true
			existingCodeMap[assigned] = models.DomainNodeCode{
				DomainID: domainID,
				Code:     assigned,
				NodeType: "source",
				NodeID:   source.ID,
			}
			privateSourceAssigned[code] = assigned
		}

		// Private quests
		privateQuestAssigned := make(map[string]string)
		for _, q := range state.PrivateQuests {
			code := q.Code
			if code == "" {
				continue
			}
			assigned := code
			if codesInUse[assigned] {
				assigned = uniqueCodeFor(assigned, codesInUse)
			}
			name := assigned
			if len(q.Versions) > 0 {
				firstTitle := strings.TrimSpace(q.Versions[0].Title)
				if firstTitle != "" {
					name = firstTitle
				}
			}
			meta := &models.MetaQuest{
				DomainID:   domainID,
				OwnerID:    userID,
				Code:       assigned,
				Name:       name,
				Kind:       q.Kind,
				Schedule:   q.Schedule,
				XPosition:  q.XPosition,
				YPosition:  q.YPosition,
				Visibility: "private",
			}
			if err := tx.Create(meta).Error; err != nil {
				return err
			}
			if err := tx.Create(&models.DomainNodeCode{
				DomainID: domainID,
				Code:     assigned,
				NodeType: "meta_quest",
				NodeID:   meta.ID,
			}).Error; err != nil {
				return err
			}
			for _, v := range q.Versions {
				qv := &models.QuestVersion{
					MetaQuestID:   meta.ID,
					Title:         v.Title,
					DescriptionMd: v.DescriptionMd,
					TaskList:      v.TaskList,
					ImagePath:     v.ImagePath,
				}
				if err := tx.Create(qv).Error; err != nil {
					return err
				}
			}
			codesInUse[assigned] = true
			existingCodeMap[assigned] = models.DomainNodeCode{
				DomainID: domainID,
				Code:     assigned,
				NodeType: "meta_quest",
				NodeID:   meta.ID,
			}
			privateQuestAssigned[code] = assigned
		}

		// User domain settings
		if state.UserDomainSettings != nil {
			settings := &models.UserDomainSettings{
				UserID:                userID,
				DomainID:              domainID,
				Timezone:              state.UserDomainSettings.Timezone,
				DailyQuestLimit:       state.UserDomainSettings.DailyQuestLimit,
				DailyQuestCooldownDays: state.UserDomainSettings.DailyQuestCooldownDays,
				Preferences:           state.UserDomainSettings.Preferences,
			}
			if err := tx.Save(settings).Error; err != nil {
				return err
			}
		}

		// Quest states
		for _, qs := range state.QuestStates {
			questCode := qs.MetaQuestCode
			if mapped, ok := privateQuestAssigned[questCode]; ok {
				questCode = mapped
			}
			entry, ok := existingCodeMap[questCode]
			if !ok || entry.NodeType != "meta_quest" {
				continue
			}
			stateRow := &models.UserMetaQuestState{
				UserID:            userID,
				MetaQuestID:       entry.NodeID,
				Active:            qs.Active,
				NextDueAt:         qs.NextDueAt,
				SnoozedUntil:      qs.SnoozedUntil,
				LastPresentedAt:   qs.LastPresentedAt,
				LastCompletedAt:   qs.LastCompletedAt,
				CurrentStreak:     qs.CurrentStreak,
				CurrentPeriodKey:  qs.CurrentPeriodKey,
				CurrentPeriodCount: qs.CurrentPeriodCount,
				LastShownAt:       qs.LastShownAt,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "user_id"}, {Name: "meta_quest_id"}},
				UpdateAll: true,
			}).Create(stateRow).Error; err != nil {
				return err
			}
		}

		// Quest events
		for _, ev := range state.QuestEvents {
			questCode := ev.MetaQuestCode
			if mapped, ok := privateQuestAssigned[questCode]; ok {
				questCode = mapped
			}
			entry, ok := existingCodeMap[questCode]
			if !ok || entry.NodeType != "meta_quest" {
				continue
			}
			var versionID *uint
			if ev.QuestVersionIndex != nil {
				var versions []models.QuestVersion
				if err := tx.Where("meta_quest_id = ?", entry.NodeID).Order("id ASC").Find(&versions).Error; err == nil {
					if *ev.QuestVersionIndex >= 0 && *ev.QuestVersionIndex < len(versions) {
						id := versions[*ev.QuestVersionIndex].ID
						versionID = &id
					}
				}
			}
			event := &models.QuestEvent{
				UserID:        userID,
				MetaQuestID:   entry.NodeID,
				QuestVersionID: versionID,
				EventType:     ev.EventType,
				HappenedAt:    ev.HappenedAt,
				Note:          ev.Note,
				Payload:       ev.Payload,
			}
			if err := tx.Create(event).Error; err != nil {
				return err
			}
		}

		// SRS progress
		if len(state.SRSProgress) > 0 {
			if err := s.ImportDomainSRSProgress(domainID, userID, state.SRSProgress); err != nil {
				return err
			}
		}

		// Private relations
		if len(state.PrivateRelations) > 0 {
			for _, rel := range state.PrivateRelations {
				fromCode := rel.FromCode
				toCode := rel.ToCode
				if rel.FromType == "source" {
					if mapped, ok := privateSourceAssigned[fromCode]; ok {
						fromCode = mapped
					}
				}
				if rel.FromType == "meta_quest" {
					if mapped, ok := privateQuestAssigned[fromCode]; ok {
						fromCode = mapped
					}
				}
				if rel.ToType == "source" {
					if mapped, ok := privateSourceAssigned[toCode]; ok {
						toCode = mapped
					}
				}
				if rel.ToType == "meta_quest" {
					if mapped, ok := privateQuestAssigned[toCode]; ok {
						toCode = mapped
					}
				}
				fromEntry, ok := existingCodeMap[fromCode]
				if !ok || fromEntry.NodeType != rel.FromType {
					continue
				}
				toEntry, ok := existingCodeMap[toCode]
				if !ok || toEntry.NodeType != rel.ToType {
					continue
				}

				var existing models.NodeRelation
				err := tx.Where("domain_id = ? AND from_type = ? AND from_id = ? AND to_type = ? AND to_id = ? AND relation_type = ? AND context_key = ?",
					domainID, rel.FromType, fromEntry.NodeID, rel.ToType, toEntry.NodeID, rel.RelationType, rel.ContextKey).
					First(&existing).Error
				if err == nil {
					continue
				}
				if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
				nr := &models.NodeRelation{
					DomainID:     domainID,
					FromType:     rel.FromType,
					FromID:       fromEntry.NodeID,
					ToType:       rel.ToType,
					ToID:         toEntry.NodeID,
					RelationType: rel.RelationType,
					ContextKey:   rel.ContextKey,
					CreatedBy:    userID,
				}
				if err := tx.Create(nr).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})
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
