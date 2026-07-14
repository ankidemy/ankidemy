package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"sort"

	"ankidemy/server/dao"
	"ankidemy/server/models"
)

// The session engine runs study sessions server-side: it owns the queue, the
// frenzy round/credit simulation, and all stats. The client only renders the
// current item and posts grades.
//
// Frenzy sessions keep their repeat statistics session-scoped: version
// selection reads persistent stats *plus* a session overlay, but repeats never
// write persistent seen/correct counts — cramming the same card fifty times in
// one night must not distort long-term SRS data. The only persistent writes a
// frenzy session makes are the real SRS reviews of items that were due when
// graded (at most one per node per session).

var (
	// ErrSessionNotFound is returned when a session does not exist or does
	// not belong to the caller.
	ErrSessionNotFound = errors.New("session not found")
	// ErrSessionFinished is returned when grading a session that has ended.
	ErrSessionFinished = errors.New("session already finished")
)

type sessionVersionStats struct {
	Seen    int `json:"seen"`
	Correct int `json:"correct"`
}

type sessionRuntimeState struct {
	Mode                   string                          `json:"mode"`
	SessionType            string                          `json:"sessionType"`
	Order                  string                          `json:"order"`
	ExercisesPerDefinition int                             `json:"exercisesPerDefinition"`
	Round                  int                             `json:"round"`
	Queue                  []models.ReviewQueueItem        `json:"queue"`
	Pool                   map[string]models.ReviewQueueItem `json:"pool,omitempty"`
	PoolByNode             map[string][]string             `json:"poolByNode,omitempty"`
	Credits                map[string]float64              `json:"credits,omitempty"`
	Persisted              map[string]bool                 `json:"persisted"`
	SessionSeen            map[string]*sessionVersionStats `json:"sessionSeen,omitempty"`
	SessionDifficulty      map[uint]int                    `json:"sessionDifficulty,omitempty"`
	Completed              int                             `json:"completed"`
	Correct                int                             `json:"correct"`
	TotalPlanned           int                             `json:"totalPlanned"`
	CurrentVersionID       *uint                           `json:"currentVersionId,omitempty"`
	Done                   bool                            `json:"done"`
}

// SessionEngineItem is what the client renders: the current queue item with
// its selected version content, plus session progress counters.
type SessionEngineItem struct {
	Done              bool                    `json:"done"`
	Round             int                     `json:"round"`
	Completed         int                     `json:"completed"`
	Correct           int                     `json:"correct"`
	Remaining         int                     `json:"remaining"`
	TotalPlanned      int                     `json:"totalPlanned"`
	Item              *models.ReviewQueueItem `json:"item,omitempty"`
	DefinitionVersion *models.Definition      `json:"definitionVersion,omitempty"`
	ExerciseVersion   *models.Exercise        `json:"exerciseVersion,omitempty"`
	// LastReview carries the SRS result of the grade that produced this item
	// (credit flow for animations); nil when the grade was practice-only.
	LastReview *models.ReviewResponse `json:"lastReview,omitempty"`
}

// SessionEngineState is the response to starting a session.
type SessionEngineState struct {
	Session models.SessionResponse `json:"session"`
	Item    *SessionEngineItem     `json:"item"`
}

func queueNodeKey(item models.ReviewQueueItem) string {
	return fmt.Sprintf("%s_%d", item.NodeType, item.NodeID)
}

func queueItemKey(item models.ReviewQueueItem) string {
	if item.ExerciseMetaID != nil {
		return fmt.Sprintf("%s_%d_ex_%d", item.NodeType, item.NodeID, *item.ExerciseMetaID)
	}
	return fmt.Sprintf("%s_%d", item.NodeType, item.NodeID)
}

// reviewTargetOf returns the node the grade actually applies to: the attached
// exercise when present, otherwise the item's own node.
func reviewTargetOf(item models.ReviewQueueItem) (nodeID uint, nodeType string) {
	if item.ExerciseMetaID != nil {
		return *item.ExerciseMetaID, models.NodeTypeExercise
	}
	return item.NodeID, item.NodeType
}

func versionStatKey(nodeType string, versionID uint) string {
	return fmt.Sprintf("%s:%d", nodeType, versionID)
}

// StartEngineSession creates a session and builds its initial queue.
func (s *SRSService) StartEngineSession(userID uint, request *models.SessionRequest, requestID string) (*SessionEngineState, error) {
	mode := request.Mode
	if mode == "" {
		mode = "normal"
	}
	order := request.Order
	if order == "" {
		order = "impact"
	}
	exercisesPerDefinition := request.ExercisesPerDefinition
	if exercisesPerDefinition <= 0 {
		exercisesPerDefinition = 1
	}

	queue, err := s.buildReviewQueue(userID, request.DomainID, request.SessionType, mode, exercisesPerDefinition, requestID)
	if err != nil {
		return nil, err
	}

	state := &sessionRuntimeState{
		Mode:                   mode,
		SessionType:            request.SessionType,
		Order:                  order,
		ExercisesPerDefinition: exercisesPerDefinition,
		Round:                  1,
		Persisted:              map[string]bool{},
		SessionSeen:            map[string]*sessionVersionStats{},
		SessionDifficulty:      map[uint]int{},
	}
	s.installRoundQueue(state, queue, request.DomainID)
	state.TotalPlanned = len(state.Queue)

	session := &models.StudySession{
		UserID:      userID,
		DomainID:    request.DomainID,
		SessionType: request.SessionType,
		Mode:        mode,
	}
	if err := s.srsDao.CreateSession(session); err != nil {
		return nil, err
	}

	item, err := s.presentCurrentItem(userID, session, state, nil)
	if err != nil {
		return nil, err
	}
	if err := s.saveSessionState(session, state); err != nil {
		return nil, err
	}

	return &SessionEngineState{
		Session: models.SessionResponse{
			ID:          session.ID,
			DomainID:    session.DomainID,
			SessionType: session.SessionType,
			Mode:        session.Mode,
			StartTime:   session.StartTime,
		},
		Item: item,
	}, nil
}

// installRoundQueue orders a freshly built queue for the current round and
// (in frenzy) indexes the pool for credit-driven add/remove.
func (s *SRSService) installRoundQueue(state *sessionRuntimeState, queue []models.ReviewQueueItem, domainID uint) {
	switch {
	case state.Mode == "frenzy" && state.Round == 1:
		// Round 1 builds knowledge bottom-up: foundations first.
		queue = s.orderQueueByDependents(queue, domainID)
	case state.Mode == "frenzy":
		rand.Shuffle(len(queue), func(i, j int) { queue[i], queue[j] = queue[j], queue[i] })
	case state.Order == "foundations":
		queue = s.orderQueueByDependents(queue, domainID)
	}

	state.Queue = queue
	if state.Mode == "frenzy" {
		state.Pool = map[string]models.ReviewQueueItem{}
		state.PoolByNode = map[string][]string{}
		state.Credits = map[string]float64{}
		for _, item := range queue {
			nodeKey := queueNodeKey(item)
			itemKey := queueItemKey(item)
			state.Pool[itemKey] = item
			state.PoolByNode[nodeKey] = append(state.PoolByNode[nodeKey], itemKey)
		}
	}
}

// orderQueueByDependents sorts queue nodes by how many other queue nodes
// transitively depend on them (descending) — foundational material first.
func (s *SRSService) orderQueueByDependents(queue []models.ReviewQueueItem, domainID uint) []models.ReviewQueueItem {
	if len(queue) < 2 {
		return queue
	}
	prerequisites, err := s.srsDao.GetPrerequisitesByDomain(domainID)
	if err != nil {
		return queue
	}
	graph := s.creditService.BuildGraph(prerequisites)

	// Group items by node, preserving first-seen order inside groups.
	groupOrder := make([]string, 0)
	groups := make(map[string][]models.ReviewQueueItem)
	rep := make(map[string]models.ReviewQueueItem)
	poolKeys := make(map[NodeKey]bool)
	for _, item := range queue {
		key := queueNodeKey(item)
		if _, ok := groups[key]; !ok {
			groupOrder = append(groupOrder, key)
			rep[key] = item
			poolKeys[makeNodeKey(item.NodeID, item.NodeType)] = true
		}
		groups[key] = append(groups[key], item)
	}

	dependentsInPool := func(item models.ReviewQueueItem) int {
		start, ok := graph[makeNodeKey(item.NodeID, item.NodeType)]
		if !ok {
			return 0
		}
		visited := map[NodeKey]bool{}
		stack := make([]NodeKey, 0, len(start.Dependents))
		for _, e := range start.Dependents {
			stack = append(stack, makeNodeKey(e.ID, e.Type))
		}
		count := 0
		for len(stack) > 0 {
			key := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if visited[key] {
				continue
			}
			visited[key] = true
			if poolKeys[key] {
				count++
			}
			if node, ok := graph[key]; ok {
				for _, e := range node.Dependents {
					next := makeNodeKey(e.ID, e.Type)
					if !visited[next] {
						stack = append(stack, next)
					}
				}
			}
		}
		return count
	}

	type scored struct {
		key        string
		dependents int
		code       string
	}
	scores := make([]scored, 0, len(groupOrder))
	for _, key := range groupOrder {
		item := rep[key]
		scores = append(scores, scored{key: key, dependents: dependentsInPool(item), code: item.NodeCode})
	}
	sort.SliceStable(scores, func(i, j int) bool {
		if scores[i].dependents != scores[j].dependents {
			return scores[i].dependents > scores[j].dependents
		}
		return scores[i].code < scores[j].code
	})

	ordered := make([]models.ReviewQueueItem, 0, len(queue))
	for _, sc := range scores {
		ordered = append(ordered, groups[sc.key]...)
	}
	return ordered
}

func (s *SRSService) loadEngineSession(userID uint, sessionID uint) (*models.StudySession, *sessionRuntimeState, error) {
	session, err := s.srsDao.GetSession(sessionID)
	if err != nil || session == nil || session.UserID != userID {
		return nil, nil, ErrSessionNotFound
	}
	state := &sessionRuntimeState{}
	if len(session.RuntimeState) == 0 {
		return nil, nil, ErrSessionNotFound
	}
	if err := json.Unmarshal(session.RuntimeState, state); err != nil {
		return nil, nil, fmt.Errorf("corrupt session state: %w", err)
	}
	// Maps marshaled with omitempty come back nil when empty.
	if state.Persisted == nil {
		state.Persisted = map[string]bool{}
	}
	if state.SessionSeen == nil {
		state.SessionSeen = map[string]*sessionVersionStats{}
	}
	if state.SessionDifficulty == nil {
		state.SessionDifficulty = map[uint]int{}
	}
	if state.Mode == "frenzy" {
		if state.Pool == nil {
			state.Pool = map[string]models.ReviewQueueItem{}
		}
		if state.PoolByNode == nil {
			state.PoolByNode = map[string][]string{}
		}
		if state.Credits == nil {
			state.Credits = map[string]float64{}
		}
	}
	return session, state, nil
}

func (s *SRSService) saveSessionState(session *models.StudySession, state *sessionRuntimeState) error {
	encoded, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return s.db.Model(&models.StudySession{}).
		Where("id = ?", session.ID).
		Update("runtime_state", json.RawMessage(encoded)).Error
}

// GetEngineSessionItem returns the session's current item without advancing.
func (s *SRSService) GetEngineSessionItem(userID uint, sessionID uint) (*SessionEngineItem, error) {
	session, state, err := s.loadEngineSession(userID, sessionID)
	if err != nil {
		return nil, err
	}
	item, err := s.presentCurrentItem(userID, session, state, nil)
	if err != nil {
		return nil, err
	}
	if err := s.saveSessionState(session, state); err != nil {
		return nil, err
	}
	return item, nil
}

// presentCurrentItem selects (or reuses) the version for the head-of-queue
// item and packages the engine response. Selecting a version counts as a
// presentation: persistent seen in normal mode, session-scoped in frenzy.
func (s *SRSService) presentCurrentItem(
	userID uint,
	session *models.StudySession,
	state *sessionRuntimeState,
	lastReview *models.ReviewResponse,
) (*SessionEngineItem, error) {
	response := &SessionEngineItem{
		Done:         state.Done || len(state.Queue) == 0,
		Round:        state.Round,
		Completed:    state.Completed,
		Correct:      state.Correct,
		Remaining:    len(state.Queue),
		TotalPlanned: state.TotalPlanned,
		LastReview:   lastReview,
	}
	if response.Done {
		state.Done = true
		return response, nil
	}

	current := state.Queue[0]
	response.Item = &current

	targetID, targetType := reviewTargetOf(current)

	// Re-presenting the same item (e.g. after a client refresh) must not
	// count as a new presentation: reuse the already-selected version.
	if state.CurrentVersionID != nil {
		if targetType == models.NodeTypeExercise {
			var version models.Exercise
			if err := s.db.First(&version, *state.CurrentVersionID).Error; err == nil && version.MetaExerciseID == targetID {
				response.ExerciseVersion = &version
				return response, nil
			}
		} else {
			var version models.Definition
			if err := s.db.First(&version, *state.CurrentVersionID).Error; err == nil && version.MetaDefinitionID == targetID {
				response.DefinitionVersion = &version
				return response, nil
			}
		}
		// Version disappeared (deleted while reviewing): fall through and
		// select a fresh one.
		state.CurrentVersionID = nil
	}

	if targetType == models.NodeTypeExercise {
		version, err := s.selectExerciseVersion(userID, targetID, state)
		if err != nil {
			// Version-less nodes are skipped rather than blocking the session.
			state.Queue = state.Queue[1:]
			return s.presentCurrentItem(userID, session, state, lastReview)
		}
		response.ExerciseVersion = version
		state.CurrentVersionID = &version.ID
	} else {
		version, err := s.selectDefinitionVersion(userID, targetID, state)
		if err != nil {
			state.Queue = state.Queue[1:]
			return s.presentCurrentItem(userID, session, state, lastReview)
		}
		response.DefinitionVersion = version
		state.CurrentVersionID = &version.ID
	}

	return response, nil
}

// selectDefinitionVersion picks a definition version. Normal mode delegates
// to the persistent selector (min seen → max failures → random, increments
// persistent seen). Frenzy overlays session-scoped stats on top of the
// persistent ones and only increments the session counters.
func (s *SRSService) selectDefinitionVersion(userID uint, definitionID uint, state *sessionRuntimeState) (*models.Definition, error) {
	if state.Mode != "frenzy" {
		return NewMetaDefinitionService(s.db).SuggestVersion(userID, definitionID)
	}

	metaDao := dao.NewMetaDefinitionDAO(s.db)
	_, versions, err := metaDao.FindByID(definitionID)
	if err != nil {
		return nil, err
	}
	if len(versions) == 0 {
		return nil, errors.New("no versions available")
	}

	type candidate struct {
		version  models.Definition
		seen     int
		failures int
	}
	candidates := make([]candidate, 0, len(versions))
	for _, v := range versions {
		var persistent models.UserDefinitionVersionStats
		_ = s.db.Where("user_id = ? AND definition_id = ?", userID, v.ID).Limit(1).Find(&persistent).Error
		seen := persistent.SeenCount
		failures := persistent.SeenCount - persistent.CorrectCount
		if overlay, ok := state.SessionSeen[versionStatKey(models.NodeTypeDefinition, v.ID)]; ok {
			seen += overlay.Seen
			failures += overlay.Seen - overlay.Correct
		}
		candidates = append(candidates, candidate{version: v, seen: seen, failures: failures})
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].seen != candidates[j].seen {
			return candidates[i].seen < candidates[j].seen
		}
		return candidates[i].failures > candidates[j].failures
	})
	minSeen := candidates[0].seen
	maxFailures := candidates[0].failures
	pool := make([]candidate, 0)
	for _, c := range candidates {
		if c.seen == minSeen && c.failures == maxFailures {
			pool = append(pool, c)
		}
	}
	chosen := pool[rand.Intn(len(pool))]

	key := versionStatKey(models.NodeTypeDefinition, chosen.version.ID)
	if state.SessionSeen[key] == nil {
		state.SessionSeen[key] = &sessionVersionStats{}
	}
	state.SessionSeen[key].Seen++

	return &chosen.version, nil
}

// selectExerciseVersion mirrors selectDefinitionVersion for exercises,
// respecting the difficulty ladder (persistent, raised session-locally in
// frenzy).
func (s *SRSService) selectExerciseVersion(userID uint, exerciseID uint, state *sessionRuntimeState) (*models.Exercise, error) {
	if state.Mode != "frenzy" {
		return NewMetaExerciseService(s.db).SuggestVersion(userID, exerciseID)
	}

	metaDao := dao.NewMetaExerciseDAO(s.db)
	_, versions, err := metaDao.FindByID(exerciseID)
	if err != nil {
		return nil, err
	}
	if len(versions) == 0 {
		return nil, errors.New("no versions available")
	}

	ladder := 1
	var persistentStats models.UserMetaExerciseStats
	tx := s.db.Where("user_id = ? AND meta_exercise_id = ?", userID, exerciseID).Limit(1).Find(&persistentStats)
	if tx.Error == nil && tx.RowsAffected > 0 {
		ladder = persistentStats.LastCorrectDifficulty
	}
	if sessionLadder, ok := state.SessionDifficulty[exerciseID]; ok && sessionLadder > ladder {
		ladder = sessionLadder
	}

	type candidate struct {
		version models.Exercise
		seen    int
	}
	all := make([]candidate, 0, len(versions))
	for _, v := range versions {
		var persistent models.UserExerciseVersionStats
		_ = s.db.Where("user_id = ? AND exercise_id = ?", userID, v.ID).Limit(1).Find(&persistent).Error
		seen := persistent.SeenCount
		if overlay, ok := state.SessionSeen[versionStatKey(models.NodeTypeExercise, v.ID)]; ok {
			seen += overlay.Seen
		}
		all = append(all, candidate{version: v, seen: seen})
	}

	eligible := make([]candidate, 0, len(all))
	for _, c := range all {
		if c.version.Difficulty >= ladder {
			eligible = append(eligible, c)
		}
	}
	if len(eligible) == 0 {
		eligible = all
	}
	minSeen := eligible[0].seen
	for _, c := range eligible {
		if c.seen < minSeen {
			minSeen = c.seen
		}
	}
	pool := make([]candidate, 0)
	for _, c := range eligible {
		if c.seen == minSeen {
			pool = append(pool, c)
		}
	}
	chosen := pool[rand.Intn(len(pool))]

	key := versionStatKey(models.NodeTypeExercise, chosen.version.ID)
	if state.SessionSeen[key] == nil {
		state.SessionSeen[key] = &sessionVersionStats{}
	}
	state.SessionSeen[key].Seen++

	return &chosen.version, nil
}

// GradeEngineSession grades the current item and returns the next one.
func (s *SRSService) GradeEngineSession(userID uint, sessionID uint, grade *models.SessionGradeRequest, requestID string) (*SessionEngineItem, error) {
	session, state, err := s.loadEngineSession(userID, sessionID)
	if err != nil {
		return nil, err
	}
	if state.Done || session.EndTime != nil {
		return nil, ErrSessionFinished
	}
	if len(state.Queue) == 0 {
		state.Done = true
		_ = s.saveSessionState(session, state)
		return &SessionEngineItem{Done: true, Round: state.Round, Completed: state.Completed, Correct: state.Correct}, nil
	}

	current := state.Queue[0]
	targetID, targetType := reviewTargetOf(current)
	success := grade.Quality >= ReviewSuccessThreshold
	versionID := state.CurrentVersionID

	var lastReview *models.ReviewResponse

	if !grade.Skip {
		state.Completed++
		if success {
			state.Correct++
		}

		// Session-scoped correctness overlay (frenzy version selection).
		if versionID != nil && state.Mode == "frenzy" {
			key := versionStatKey(targetType, *versionID)
			if state.SessionSeen[key] == nil {
				state.SessionSeen[key] = &sessionVersionStats{}
			}
			if success {
				state.SessionSeen[key].Correct++
			}
			if success && targetType == models.NodeTypeExercise {
				var version models.Exercise
				if err := s.db.Select("difficulty").First(&version, *versionID).Error; err == nil {
					if version.Difficulty > state.SessionDifficulty[targetID] {
						state.SessionDifficulty[targetID] = version.Difficulty
					}
				}
			}
		}

		nodeKey := fmt.Sprintf("%s_%d", targetType, targetID)
		if current.IsDue && !state.Persisted[nodeKey] {
			// Real SRS review: SM-2 + credit propagation + persistent
			// outcome stats. The service re-checks due-ness, so repeats
			// within the session can never double-count.
			request := &models.ReviewRequest{
				NodeID:    targetID,
				NodeType:  targetType,
				Quality:   grade.Quality,
				TimeTaken: grade.TimeTaken,
				SessionID: &session.ID,
				VersionID: versionID,
			}
			response, err := s.submitReview(userID, request, true)
			if err != nil && !errors.Is(err, ErrNodeNotReviewable) {
				return nil, err
			}
			if response != nil {
				state.Persisted[nodeKey] = true
				if response.Counted {
					lastReview = response
				}
			}
		} else if state.Mode != "frenzy" && versionID != nil {
			// Normal-mode practice on a non-due item still feeds persistent
			// version stats (seen counts, difficulty ladder, solved state).
			s.recordVersionOutcome(userID, &models.ReviewRequest{
				NodeID:    targetID,
				NodeType:  targetType,
				Quality:   grade.Quality,
				VersionID: versionID,
			}, success)
		}
	}

	// Advance the queue.
	state.Queue = state.Queue[1:]
	state.CurrentVersionID = nil

	if state.Mode == "frenzy" && !grade.Skip {
		if !success {
			state.Queue = append(state.Queue, current)
		}
		s.applyFrenzyCredits(state, current, success, session.DomainID)
	}

	// Frenzy rounds restart when the queue empties.
	if state.Mode == "frenzy" && len(state.Queue) == 0 {
		state.Round++
		queue, err := s.buildReviewQueue(userID, session.DomainID, state.SessionType, "frenzy", state.ExercisesPerDefinition, requestID)
		if err != nil {
			return nil, err
		}
		if len(queue) == 0 {
			state.Done = true
		} else {
			s.installRoundQueue(state, queue, session.DomainID)
			state.TotalPlanned = len(state.Queue)
			state.Completed = 0
			state.Correct = 0
		}
	}

	item, err := s.presentCurrentItem(userID, session, state, lastReview)
	if err != nil {
		return nil, err
	}
	if err := s.saveSessionState(session, state); err != nil {
		return nil, err
	}
	return item, nil
}

// applyFrenzyCredits runs the same BFS credit propagation the real SRS uses,
// but against the session-local credit map: a node reaching +1 drops out of
// the round, a node reaching -1 gets its items re-queued.
func (s *SRSService) applyFrenzyCredits(state *sessionRuntimeState, gradedItem models.ReviewQueueItem, success bool, domainID uint) {
	prerequisites, err := s.srsDao.GetPrerequisitesByDomain(domainID)
	if err != nil {
		return
	}
	graph := s.creditService.BuildGraph(prerequisites)

	targetID, targetType := reviewTargetOf(gradedItem)
	credits := s.creditService.PropagateCredit(targetID, targetType, success, graph)

	queueKeys := make(map[string]bool, len(state.Queue))
	for _, item := range state.Queue {
		queueKeys[queueItemKey(item)] = true
	}

	for _, credit := range credits {
		if credit.Type != "implicit" {
			continue
		}
		nodeKey := fmt.Sprintf("%s_%d", credit.NodeType, credit.NodeID)
		itemKeys, inPool := state.PoolByNode[nodeKey]
		if !inPool {
			continue
		}
		state.Credits[nodeKey] += credit.Credit

		if state.Credits[nodeKey] >= 1 {
			for _, itemKey := range itemKeys {
				queueKeys[itemKey] = false
			}
		} else if state.Credits[nodeKey] <= -1 {
			for _, itemKey := range itemKeys {
				if queueKeys[itemKey] {
					continue
				}
				if item, ok := state.Pool[itemKey]; ok {
					state.Queue = append(state.Queue, item)
					queueKeys[itemKey] = true
				}
			}
		}
	}

	filtered := state.Queue[:0]
	for _, item := range state.Queue {
		if queueKeys[queueItemKey(item)] {
			filtered = append(filtered, item)
		}
	}
	state.Queue = filtered
}

// EndEngineSession closes a session owned by the user.
func (s *SRSService) EndEngineSession(userID uint, sessionID uint) error {
	session, err := s.srsDao.GetSession(sessionID)
	if err != nil || session == nil || session.UserID != userID {
		return ErrSessionNotFound
	}
	if session.EndTime != nil {
		return nil
	}
	return s.srsDao.EndSession(sessionID)
}
