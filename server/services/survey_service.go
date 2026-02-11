package services

import (
	"encoding/json"
	"errors"
	"math/rand"
	"strconv"
	"time"

	"gorm.io/gorm"
	"ankidemy/server/dao"
	"ankidemy/server/models"
)

type SurveyQueueItem struct {
	QuestID           uint                          `json:"questId"`
	QuestCode         string                        `json:"questCode"`
	QuestName         string                        `json:"questName"`
	QuestKind         string                        `json:"questKind"`
	SelectedVersionID uint                          `json:"selectedVersionId"`
	Versions          []models.QuestVersionResponse `json:"versions"`
	NextDueAt         *time.Time                    `json:"nextDueAt,omitempty"`
	Active            bool                          `json:"active"`
	Visibility        string                        `json:"visibility"`
	IsOverdue         bool                          `json:"isOverdue"`
	RelevantNodes     []RelationNodeRef             `json:"relevantNodes,omitempty"`
}

type RelationNodeRef struct {
	NodeType string `json:"nodeType"`
	NodeID   uint   `json:"nodeId"`
	Code     string `json:"code"`
}

type SurveyService struct {
	db              *gorm.DB
	metaQuestDAO    *dao.MetaQuestDAO
	relationDAO     *dao.NodeRelationDAO
	settingsDAO     *dao.UserDomainSettingsDAO
	codeRegistryDAO *dao.CodeRegistryDAO
}

func NewSurveyService(db *gorm.DB) *SurveyService {
	rand.Seed(time.Now().UnixNano())
	return &SurveyService{
		db:              db,
		metaQuestDAO:    dao.NewMetaQuestDAO(db),
		relationDAO:     dao.NewNodeRelationDAO(db),
		settingsDAO:     dao.NewUserDomainSettingsDAO(db),
		codeRegistryDAO: dao.NewCodeRegistryDAO(db),
	}
}

// EnsureQuestNextDue updates/persists state.NextDueAt based on the quest schedule.
// This is intentionally used outside of Survey flows so the UI can show a correct "Next due".
func (s *SurveyService) EnsureQuestNextDue(userID uint, meta *models.MetaQuest, state *models.UserMetaQuestState) (*models.UserMetaQuestState, error) {
	if meta == nil || state == nil {
		return state, nil
	}

	now := time.Now().UTC()
	settings, err := s.settingsDAO.GetOrCreate(userID, meta.DomainID)
	if err != nil {
		return state, err
	}
	userLoc, _ := time.LoadLocation(coalesceTimezone(settings.Timezone))
	return s.ensureQuestNextDueWithContext(meta, state, now, userLoc)
}

func (s *SurveyService) ensureQuestNextDueWithContext(meta *models.MetaQuest, state *models.UserMetaQuestState, now time.Time, userLoc *time.Location) (*models.UserMetaQuestState, error) {
	if meta == nil || state == nil {
		return state, nil
	}

	if !state.Active {
		if state.NextDueAt != nil {
			state.NextDueAt = nil
			_ = s.metaQuestDAO.UpdateUserState(state)
		}
		return state, nil
	}

	// Snooze takes precedence.
	if state.SnoozedUntil != nil && state.SnoozedUntil.After(now) {
		desired := state.SnoozedUntil.UTC()
		if state.NextDueAt == nil || !desired.Equal(*state.NextDueAt) {
			state.NextDueAt = &desired
			_ = s.metaQuestDAO.UpdateUserState(state)
		}
		return state, nil
	}

	// If the quest is already due/overdue, keep NextDueAt as-is so it stays visible in the queue
	// until the user takes an action (complete/skip/snooze/deactivate).
	if state.NextDueAt != nil && !state.NextDueAt.After(now) {
		return state, nil
	}

	// At this point NextDueAt is nil or in the future: safe to (re)compute without "advancing away" a due quest.
	var desired *time.Time
	if state.LastCompletedAt != nil {
		next, err := s.computeNextDue(meta, state, now, userLoc)
		if err != nil {
			return state, err
		}
		desired = next
	} else {
		// Initialize from dtstart so newly created one-off reminders become due at their scheduled time.
		scheduleType, err := parseScheduleType(meta.Schedule)
		if err != nil {
			return state, err
		}
		switch scheduleType {
		case "rrule":
			sched, err := parseRRuleSchedule(meta.Schedule)
			if err != nil {
				return state, err
			}
			loc, _ := time.LoadLocation(coalesceTimezone(sched.Timezone))
			dtstart, err := parseScheduleTime(sched.Dtstart, loc)
			if err != nil {
				return state, err
			}
			utc := dtstart.In(time.UTC)
			desired = &utc
		case "habit":
			sched, err := parseHabitSchedule(meta.Schedule)
			if err != nil {
				return state, err
			}
			loc, _ := time.LoadLocation(coalesceTimezone(sched.Timezone))
			dtstart, err := parseScheduleTime(sched.Dtstart, loc)
			if err != nil {
				return state, err
			}
			utc := dtstart.In(time.UTC)
			desired = &utc
		case "daily_pool":
			desired = nil
		default:
			return state, errors.New("unsupported schedule type")
		}
	}

	// Never clear a future NextDueAt here; only explicit events should clear or advance it.
	if desired == nil {
		return state, nil
	}
	if state.NextDueAt == nil || !desired.Equal(*state.NextDueAt) {
		state.NextDueAt = desired
		_ = s.metaQuestDAO.UpdateUserState(state)
	}
	return state, nil
}

func (s *SurveyService) GetQueue(domainID uint, userID uint) ([]SurveyQueueItem, error) {
	now := time.Now().UTC()
	quests, err := s.metaQuestDAO.ListVisible(domainID, userID)
	if err != nil {
		return nil, err
	}
	if len(quests) == 0 {
		return []SurveyQueueItem{}, nil
	}

	ids := make([]uint, 0, len(quests))
	for _, q := range quests {
		ids = append(ids, q.ID)
	}
	states, err := s.metaQuestDAO.ListUserStates(userID, ids)
	if err != nil {
		return nil, err
	}
	stateMap := map[uint]*models.UserMetaQuestState{}
	for i := range states {
		st := states[i]
		stateMap[st.MetaQuestID] = &st
	}

	settings, err := s.settingsDAO.GetOrCreate(userID, domainID)
	if err != nil {
		return nil, err
	}
	userLoc, _ := time.LoadLocation(coalesceTimezone(settings.Timezone))

	queue := make([]SurveyQueueItem, 0)

	// daily quests handled separately
	regular := make([]models.MetaQuest, 0)
	daily := make([]models.MetaQuest, 0)
	for _, q := range quests {
		if q.Kind == "daily" {
			daily = append(daily, q)
		} else {
			regular = append(regular, q)
		}
	}

	for _, q := range regular {
		state := stateMap[q.ID]
		if state == nil {
			var err error
			state, err = s.metaQuestDAO.EnsureUserState(userID, q.ID)
			if err != nil {
				return nil, err
			}
		}
		if !state.Active {
			continue
		}

		updated, err := s.ensureQuestNextDueWithContext(&q, state, now, userLoc)
		if err != nil {
			return nil, err
		}
		if updated != nil {
			state = updated
		}
		if state.NextDueAt == nil || state.NextDueAt.After(now) {
			continue
		}

		item, err := s.buildQueueItem(&q, state, userID)
		if err != nil {
			return nil, err
		}
		queue = append(queue, item)

		state.LastPresentedAt = &now
		_ = s.metaQuestDAO.UpdateUserState(state)
	}

	dailyItems, err := s.buildDailyQueue(daily, userID, domainID, settings, userLoc, now)
	if err != nil {
		return nil, err
	}
	queue = append(queue, dailyItems...)

	return queue, nil
}

func (s *SurveyService) buildQueueItem(meta *models.MetaQuest, state *models.UserMetaQuestState, userID uint) (SurveyQueueItem, error) {
	versions, err := s.metaQuestDAO.FindVersions(meta.ID)
	if err != nil {
		return SurveyQueueItem{}, err
	}
	if len(versions) == 0 {
		return SurveyQueueItem{}, errors.New("quest has no versions")
	}
	selected := versions[rand.Intn(len(versions))]
	versionsResp := make([]models.QuestVersionResponse, 0, len(versions))
	for _, v := range versions {
		versionsResp = append(versionsResp, models.QuestVersionResponse{
			ID:            v.ID,
			MetaQuestID:   v.MetaQuestID,
			Title:         v.Title,
			DescriptionMd: v.DescriptionMd,
			TaskList:      v.TaskList,
			ImagePath:     v.ImagePath,
			CreatedAt:     v.CreatedAt,
			UpdatedAt:     v.UpdatedAt,
		})
	}

	relevantNodes, err := s.getRelevantNodes(meta.DomainID, meta.ID, selected.ID)
	if err != nil {
		return SurveyQueueItem{}, err
	}

	item := SurveyQueueItem{
		QuestID:           meta.ID,
		QuestCode:         meta.Code,
		QuestName:         meta.Name,
		QuestKind:         meta.Kind,
		SelectedVersionID: selected.ID,
		Versions:          versionsResp,
		NextDueAt:         state.NextDueAt,
		Active:            state.Active,
		Visibility:        meta.Visibility,
		IsOverdue:         state.NextDueAt != nil && !state.NextDueAt.After(time.Now().UTC()),
		RelevantNodes:     relevantNodes,
	}
	return item, nil
}

func (s *SurveyService) getRelevantNodes(domainID uint, metaQuestID uint, versionID uint) ([]RelationNodeRef, error) {
	contextKey := "quest_version:" + strconv.FormatUint(uint64(versionID), 10)
	relations, err := s.relationDAO.ListByContext(domainID, contextKey)
	if err != nil {
		return nil, err
	}
	if len(relations) == 0 {
		return []RelationNodeRef{}, nil
	}
	refs := make([]RelationNodeRef, 0, len(relations))
	for _, rel := range relations {
		if rel.FromType != "meta_quest" || rel.FromID != metaQuestID {
			continue
		}
		code, _ := s.resolveCode(domainID, rel.ToType, rel.ToID)
		refs = append(refs, RelationNodeRef{
			NodeType: rel.ToType,
			NodeID:   rel.ToID,
			Code:     code,
		})
	}
	return refs, nil
}

func (s *SurveyService) resolveCode(domainID uint, nodeType string, nodeID uint) (string, error) {
	var entry models.DomainNodeCode
	if err := s.db.Where("domain_id = ? AND node_type = ? AND node_id = ?", domainID, nodeType, nodeID).First(&entry).Error; err != nil {
		return "", err
	}
	return entry.Code, nil
}

func (s *SurveyService) computeAndPersistNextDue(meta *models.MetaQuest, state *models.UserMetaQuestState, now time.Time, userLoc *time.Location) (*models.UserMetaQuestState, error) {
	nextDue, err := s.computeNextDue(meta, state, now, userLoc)
	if err != nil {
		return nil, err
	}
	if nextDue == nil && state.NextDueAt == nil {
		return state, nil
	}
	changed := (nextDue == nil && state.NextDueAt != nil) ||
		(nextDue != nil && (state.NextDueAt == nil || !nextDue.Equal(*state.NextDueAt)))
	if changed {
		state.NextDueAt = nextDue
		if err := s.metaQuestDAO.UpdateUserState(state); err != nil {
			return nil, err
		}
	}
	return state, nil
}

func (s *SurveyService) computeNextDue(meta *models.MetaQuest, state *models.UserMetaQuestState, now time.Time, userLoc *time.Location) (*time.Time, error) {
	scheduleType, err := parseScheduleType(meta.Schedule)
	if err != nil {
		return nil, err
	}

	if state.SnoozedUntil != nil && state.SnoozedUntil.After(now) {
		return state.SnoozedUntil, nil
	}

	switch scheduleType {
	case "rrule":
		sched, err := parseRRuleSchedule(meta.Schedule)
		if err != nil {
			return nil, err
		}
		loc, _ := time.LoadLocation(coalesceTimezone(sched.Timezone))
		dtstart, err := parseScheduleTime(sched.Dtstart, loc)
		if err != nil {
			return nil, err
		}
		spec := parseRRuleSpec(sched.RRule)
		after := now
		if state.LastCompletedAt != nil && state.LastCompletedAt.After(after) {
			after = *state.LastCompletedAt
		}
		exdates := parseDateList(sched.Exdate, loc)
		rdates := parseDateList(sched.Rdate, loc)
		next := nextOccurrence(spec, dtstart, after, exdates, rdates)
		if next == nil {
			return nil, nil
		}
		utc := next.In(time.UTC)
		return &utc, nil
	case "habit":
		sched, err := parseHabitSchedule(meta.Schedule)
		if err != nil {
			return nil, err
		}
		loc, _ := time.LoadLocation(coalesceTimezone(sched.Timezone))
		dtstart, err := parseScheduleTime(sched.Dtstart, loc)
		if err != nil {
			return nil, err
		}
		ensureHabitPeriod(state, sched, now, userLoc)
		spec := parseRRuleSpec(sched.RRule)
		after := now
		if state.LastCompletedAt != nil && state.LastCompletedAt.After(after) {
			after = *state.LastCompletedAt
		}
		next := nextOccurrence(spec, dtstart, after, nil, nil)
		if next == nil {
			return nil, nil
		}
		utc := next.In(time.UTC)
		return &utc, nil
	case "daily_pool":
		return nil, nil
	default:
		return nil, errors.New("unsupported schedule type")
	}
}

func ensureHabitPeriod(state *models.UserMetaQuestState, sched *HabitSchedule, now time.Time, userLoc *time.Location) {
	if sched == nil {
		return
	}
	currentKey := now.In(userLoc).Format("2006-01-02")
	if state.CurrentPeriodKey == nil || *state.CurrentPeriodKey != currentKey {
		if state.CurrentPeriodKey != nil {
			if state.CurrentPeriodCount < sched.RequiredCompletionsPerPeriod {
				state.CurrentStreak = 0
			}
		}
		state.CurrentPeriodKey = &currentKey
		state.CurrentPeriodCount = 0
	}
}

func (s *SurveyService) buildDailyQueue(daily []models.MetaQuest, userID uint, domainID uint, settings *models.UserDomainSettings, userLoc *time.Location, now time.Time) ([]SurveyQueueItem, error) {
	if len(daily) == 0 {
		return []SurveyQueueItem{}, nil
	}
	dateKey := now.In(userLoc).Format("2006-01-02")
	draw, err := s.metaQuestDAO.FindDailyDraw(userID, domainID, dateKey)
	if err == nil && draw != nil {
		return s.queueFromDraw(draw, daily, userID)
	}

	eligible := make([]models.MetaQuest, 0)
	stateMap := map[uint]*models.UserMetaQuestState{}
	ids := make([]uint, 0, len(daily))
	for _, q := range daily {
		ids = append(ids, q.ID)
	}
	states, err := s.metaQuestDAO.ListUserStates(userID, ids)
	if err != nil {
		return nil, err
	}
	for i := range states {
		st := states[i]
		stateMap[st.MetaQuestID] = &st
	}

	for _, q := range daily {
		state := stateMap[q.ID]
		if state == nil {
			state, err = s.metaQuestDAO.EnsureUserState(userID, q.ID)
			if err != nil {
				return nil, err
			}
			stateMap[q.ID] = state
		}
		if !state.Active {
			continue
		}
		cooldown := settings.DailyQuestCooldownDays
		if sched, err := parseDailySchedule(q.Schedule); err == nil {
			if sched.CooldownDaysOverride != nil {
				cooldown = *sched.CooldownDaysOverride
			}
		}
		if state.LastShownAt != nil {
			delta := daysBetween(state.LastShownAt.In(userLoc), now.In(userLoc))
			if delta < cooldown {
				continue
			}
		}
		eligible = append(eligible, q)
	}

	if len(eligible) == 0 {
		return []SurveyQueueItem{}, nil
	}

	rand.Shuffle(len(eligible), func(i, j int) { eligible[i], eligible[j] = eligible[j], eligible[i] })
	limit := settings.DailyQuestLimit
	if limit <= 0 {
		limit = 1
	}
	if len(eligible) > limit {
		eligible = eligible[:limit]
	}

	questIDs := make([]uint, 0, len(eligible))
	for _, q := range eligible {
		questIDs = append(questIDs, q.ID)
		state := stateMap[q.ID]
		if state == nil {
			state, _ = s.metaQuestDAO.EnsureUserState(userID, q.ID)
		}
		if state != nil {
			state.LastShownAt = &now
			state.LastPresentedAt = &now
			_ = s.metaQuestDAO.UpdateUserState(state)
		}
	}

	payload, _ := json.Marshal(questIDs)
	draw = &models.UserDailyQuestDraw{
		UserID:   userID,
		DomainID: domainID,
		DateKey:  dateKey,
		QuestIDs: payload,
	}
	_ = s.metaQuestDAO.CreateDailyDraw(draw)

	return s.queueFromDraw(draw, eligible, userID)
}

func (s *SurveyService) queueFromDraw(draw *models.UserDailyQuestDraw, daily []models.MetaQuest, userID uint) ([]SurveyQueueItem, error) {
	var ids []uint
	if err := json.Unmarshal(draw.QuestIDs, &ids); err != nil {
		return []SurveyQueueItem{}, nil
	}
	dailyMap := map[uint]models.MetaQuest{}
	for _, q := range daily {
		dailyMap[q.ID] = q
	}
	out := make([]SurveyQueueItem, 0, len(ids))
	for _, id := range ids {
		q, ok := dailyMap[id]
		if !ok {
			continue
		}
		state, err := s.metaQuestDAO.EnsureUserState(userID, q.ID)
		if err != nil {
			return nil, err
		}
		item, err := s.buildQueueItem(&q, state, userID)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *SurveyService) ApplyEvent(userID uint, req *models.QuestEventRequest) error {
	meta, _, err := s.metaQuestDAO.FindByID(req.MetaQuestID)
	if err != nil {
		return err
	}
	state, err := s.metaQuestDAO.EnsureUserState(userID, meta.ID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	happenedAt := now
	if req.HappenedAt != nil {
		happenedAt = req.HappenedAt.UTC()
	}

	event := &models.QuestEvent{
		UserID:         userID,
		MetaQuestID:    meta.ID,
		QuestVersionID: req.QuestVersionID,
		EventType:      req.EventType,
		HappenedAt:     happenedAt,
		Note:           req.Note,
		Payload:        req.Payload,
	}
	if err := s.metaQuestDAO.CreateEvent(event); err != nil {
		return err
	}

	settings, err := s.settingsDAO.GetOrCreate(userID, meta.DomainID)
	if err != nil {
		return err
	}
	userLoc, _ := time.LoadLocation(coalesceTimezone(settings.Timezone))

	switch req.EventType {
	case "completed":
		state.LastCompletedAt = &happenedAt
		autoDeactivated := false
		if meta.Kind == "habit" {
			sched, err := parseHabitSchedule(meta.Schedule)
			if err != nil {
				return err
			}
			ensureHabitPeriod(state, sched, happenedAt, userLoc)
			prevCount := state.CurrentPeriodCount
			state.CurrentPeriodCount++
			if prevCount < sched.RequiredCompletionsPerPeriod && state.CurrentPeriodCount >= sched.RequiredCompletionsPerPeriod {
				state.CurrentStreak++
				if sched.ConsecutivePeriodsToAutoDeactivate > 0 && state.CurrentStreak >= sched.ConsecutivePeriodsToAutoDeactivate {
					if state.Active {
						state.Active = false
						autoDeactivated = true
					}
				}
			}
		}
		state.SnoozedUntil = nil
		if state.Active {
			nextDue, err := s.computeNextDue(meta, state, happenedAt, userLoc)
			if err != nil {
				return err
			}
			state.NextDueAt = nextDue
		} else {
			state.NextDueAt = nil
		}
		if autoDeactivated {
			payload, _ := json.Marshal(map[string]interface{}{
				"auto":      true,
				"streak":    state.CurrentStreak,
				"periodKey": state.CurrentPeriodKey,
				"questKind": meta.Kind,
			})
			_ = s.metaQuestDAO.CreateEvent(&models.QuestEvent{
				UserID:         userID,
				MetaQuestID:    meta.ID,
				QuestVersionID: req.QuestVersionID,
				EventType:      "deactivated",
				HappenedAt:     happenedAt,
				Payload:        payload,
			})
		}
	case "skipped":
		nextDue, err := s.computeNextDue(meta, state, happenedAt, userLoc)
		if err != nil {
			return err
		}
		state.NextDueAt = nextDue
	case "snoozed":
		var payload struct {
			SnoozedUntil string `json:"snoozedUntil"`
		}
		if len(req.Payload) > 0 {
			_ = json.Unmarshal(req.Payload, &payload)
		}
		if payload.SnoozedUntil != "" {
			if t, err := time.Parse(time.RFC3339, payload.SnoozedUntil); err == nil {
				state.SnoozedUntil = &t
				state.NextDueAt = &t
			}
		}
	case "deactivated":
		state.Active = false
		state.NextDueAt = nil
	case "reactivated":
		state.Active = true
		nextDue, err := s.computeNextDue(meta, state, happenedAt, userLoc)
		if err != nil {
			return err
		}
		state.NextDueAt = nextDue
	case "version_swapped":
		// no state change
	}

	return s.metaQuestDAO.UpdateUserState(state)
}
