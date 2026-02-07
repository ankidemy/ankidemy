package services

import (
	"errors"
	"gorm.io/gorm"
	"math/rand"
	"myapp/server/dao"
	"myapp/server/models"
	"sort"
	"time"
)

type MetaExerciseService struct {
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
	if err != nil {
		return nil, err
	}
	if len(versions) == 0 {
		return nil, errors.New("no versions available")
	}

	// Get last_correct_difficulty
	var stats models.UserMetaExerciseStats
	tx1 := s.db.Where("user_id = ? AND meta_exercise_id = ?", userID, metaExerciseID).Limit(1).Find(&stats)
	_ = tx1.Error
	last := 1
	if stats.ID != 0 {
		last = stats.LastCorrectDifficulty
	}

	// Load seen counts
	type vs struct {
		Ex   models.Exercise
		Seen int
	}
	candidates := make([]vs, 0, len(versions))
	for _, v := range versions {
		var vus models.UserExerciseVersionStats
		_ = s.db.Where("user_id = ? AND exercise_id = ?", userID, v.ID).Limit(1).Find(&vus).Error
		candidates = append(candidates, vs{Ex: v, Seen: vus.SeenCount})
	}

	// Filter by difficulty >= last
	filtered := make([]vs, 0)
	for _, c := range candidates {
		if c.Ex.Difficulty >= last {
			filtered = append(filtered, c)
		}
	}
	pickset := filtered
	if len(pickset) == 0 {
		pickset = candidates
	}

	// Find minimal seen
	minSeen := 1 << 30
	for _, c := range pickset {
		if c.Seen < minSeen {
			minSeen = c.Seen
		}
	}
	pool := make([]vs, 0)
	for _, c := range pickset {
		if c.Seen == minSeen {
			pool = append(pool, c)
		}
	}

	rand.Seed(time.Now().UnixNano())
	chosen := pool[rand.Intn(len(pool))]

	// Mark as seen (presentation)
	now := time.Now()
	var row models.UserExerciseVersionStats
	tx := s.db.Where("user_id = ? AND exercise_id = ?", userID, chosen.Ex.ID).Limit(1).Find(&row)
	if tx.Error != nil || tx.RowsAffected == 0 {
		row = models.UserExerciseVersionStats{UserID: userID, ExerciseID: chosen.Ex.ID, SeenCount: 1, LastSeenAt: &now}
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
			if success {
				row.CorrectCount += 1
				row.LastCorrectAt = &now
			}
			_ = s.db.Save(&row).Error
		}
	}
	if success && difficulty != nil {
		var meta models.UserMetaExerciseStats
		tx := s.db.Where("user_id = ? AND meta_exercise_id = ?", userID, metaExerciseID).Limit(1).Find(&meta)
		if tx.Error != nil || tx.RowsAffected == 0 {
			meta = models.UserMetaExerciseStats{UserID: userID, MetaExerciseID: metaExerciseID, LastCorrectDifficulty: *difficulty}
		} else {
			if *difficulty > meta.LastCorrectDifficulty {
				meta.LastCorrectDifficulty = *difficulty
			}
		}
		_ = s.db.Save(&meta).Error
	}
}

// SelectExerciseForDefinition returns an eligible meta-exercise + version to test a definition.
func (s *MetaExerciseService) SelectExerciseForDefinition(userID uint, definitionID uint) (*models.MetaExercise, *models.Exercise, error) {
	exercises, err := s.SelectExercisesForDefinition(userID, definitionID, 1)
	if err != nil || len(exercises) == 0 {
		return nil, nil, err
	}
	version, err := s.SuggestVersion(userID, exercises[0].ID)
	if err != nil {
		return nil, nil, err
	}
	return &exercises[0], version, nil
}

// SelectExercisesForDefinition returns up to count eligible meta-exercises + versions to test a definition.
// Selection rules:
// - Exercise must depend on the definition and all definition prereqs must be grasped.
// - All exercise prerequisites (recursively) must be solved at least once.
// - Prefer easier difficulty first; within a difficulty prefer unseen exercises, then least seen.
func (s *MetaExerciseService) SelectExercisesForDefinition(userID uint, definitionID uint, count int) ([]models.MetaExercise, error) {
	if count <= 0 {
		count = 1
	}

	// Find meta-exercises that list this definition as a prerequisite.
	var candidateIDs []uint
	err := s.db.Model(&models.NodePrerequisite{}).
		Where("node_type = ? AND prerequisite_id = ? AND prerequisite_type IN ?", "meta_exercise", definitionID, []string{"meta_definition", "definition"}).
		Pluck("node_id", &candidateIDs).Error
	if err != nil {
		return nil, err
	}
	if len(candidateIDs) == 0 {
		return nil, nil
	}
	idSet := make(map[uint]struct{}, len(candidateIDs))
	uniqueIDs := make([]uint, 0, len(candidateIDs))
	for _, id := range candidateIDs {
		if _, ok := idSet[id]; ok {
			continue
		}
		idSet[id] = struct{}{}
		uniqueIDs = append(uniqueIDs, id)
	}
	candidateIDs = uniqueIDs

	// Load prerequisites for candidate exercises.
	var prereqs []models.NodePrerequisite
	if err := s.db.Where("node_type = ? AND node_id IN ?", "meta_exercise", candidateIDs).Find(&prereqs).Error; err != nil {
		return nil, err
	}

	defPrereqsByEx := make(map[uint][]uint)
	exPrereqsByEx := make(map[uint][]uint)
	defPrereqIDs := make(map[uint]struct{})

	for _, p := range prereqs {
		switch p.PrerequisiteType {
		case "meta_definition", "definition":
			defPrereqsByEx[p.NodeID] = append(defPrereqsByEx[p.NodeID], p.PrerequisiteID)
			defPrereqIDs[p.PrerequisiteID] = struct{}{}
		case "meta_exercise", "exercise":
			exPrereqsByEx[p.NodeID] = append(exPrereqsByEx[p.NodeID], p.PrerequisiteID)
		}
	}

	// Determine which definition prerequisites are grasped.
	graspedDefs := make(map[uint]struct{})
	if len(defPrereqIDs) > 0 {
		defIDs := make([]uint, 0, len(defPrereqIDs))
		for id := range defPrereqIDs {
			defIDs = append(defIDs, id)
		}
		var rows []struct{ NodeID uint }
		if err := s.db.Model(&models.UserNodeProgress{}).
			Select("node_id").
			Where("user_id = ? AND node_type = ? AND status = ? AND node_id IN ?", userID, "definition", "grasped", defIDs).
			Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			graspedDefs[row.NodeID] = struct{}{}
		}
	}

	// Solved exercises are tracked via per-user meta exercise stats.
	solvedSet := make(map[uint]struct{})
	var solvedIDs []uint
	if err := s.db.Model(&models.UserMetaExerciseStats{}).
		Where("user_id = ?", userID).
		Pluck("meta_exercise_id", &solvedIDs).Error; err != nil {
		return nil, err
	}
	for _, id := range solvedIDs {
		solvedSet[id] = struct{}{}
	}

	// Aggregate difficulty for each meta-exercise (min difficulty across versions).
	type diffRow struct {
		MetaExerciseID uint
		MinDifficulty  int
	}
	var diffRows []diffRow
	if err := s.db.Raw(`
		SELECT meta_exercise_id, MIN(COALESCE(NULLIF(difficulty, 0), 1)) as min_difficulty
		FROM exercises
		WHERE meta_exercise_id IN ?
		GROUP BY meta_exercise_id
	`, candidateIDs).Scan(&diffRows).Error; err != nil {
		return nil, err
	}
	diffMap := make(map[uint]int, len(diffRows))
	for _, row := range diffRows {
		diffMap[row.MetaExerciseID] = row.MinDifficulty
	}

	// Aggregate seen counts for each meta-exercise.
	type seenRow struct {
		MetaExerciseID uint
		SeenCount      int
	}
	var seenRows []seenRow
	if err := s.db.Raw(`
		SELECT e.meta_exercise_id as meta_exercise_id,
			   COALESCE(SUM(uevs.seen_count), 0) as seen_count
		FROM exercises e
		LEFT JOIN user_exercise_version_stats uevs
			ON uevs.exercise_id = e.id AND uevs.user_id = ?
		WHERE e.meta_exercise_id IN ?
		GROUP BY e.meta_exercise_id
	`, userID, candidateIDs).Scan(&seenRows).Error; err != nil {
		return nil, err
	}
	seenMap := make(map[uint]int, len(seenRows))
	for _, row := range seenRows {
		seenMap[row.MetaExerciseID] = row.SeenCount
	}

	definitionsGrasped := func(defIDs []uint) bool {
		for _, id := range defIDs {
			if _, ok := graspedDefs[id]; !ok {
				return false
			}
		}
		return true
	}

	prereqSolvedMemo := make(map[uint]bool)
	var checkExercisePrereqs func(exID uint, stack map[uint]bool) bool
	checkExercisePrereqs = func(exID uint, stack map[uint]bool) bool {
		if val, ok := prereqSolvedMemo[exID]; ok {
			return val
		}
		if stack[exID] {
			return true
		}
		stack[exID] = true
		for _, prereqID := range exPrereqsByEx[exID] {
			if _, ok := solvedSet[prereqID]; !ok {
				prereqSolvedMemo[exID] = false
				delete(stack, exID)
				return false
			}
			if !checkExercisePrereqs(prereqID, stack) {
				prereqSolvedMemo[exID] = false
				delete(stack, exID)
				return false
			}
		}
		delete(stack, exID)
		prereqSolvedMemo[exID] = true
		return true
	}

	type candidate struct {
		id         uint
		difficulty int
		seen       int
		solved     bool
	}

	eligible := make([]candidate, 0, len(candidateIDs))
	for _, id := range candidateIDs {
		if !definitionsGrasped(defPrereqsByEx[id]) {
			continue
		}
		if !checkExercisePrereqs(id, map[uint]bool{}) {
			continue
		}
		difficulty, ok := diffMap[id]
		if !ok {
			continue
		}
		_, solved := solvedSet[id]
		eligible = append(eligible, candidate{
			id:         id,
			difficulty: difficulty,
			seen:       seenMap[id],
			solved:     solved,
		})
	}

	if len(eligible) == 0 {
		return nil, nil
	}

	// Choose the easiest difficulty with unsolved exercises first.
	diffSet := make(map[int]struct{})
	for _, c := range eligible {
		diffSet[c.difficulty] = struct{}{}
	}
	diffs := make([]int, 0, len(diffSet))
	for d := range diffSet {
		diffs = append(diffs, d)
	}
	sort.Ints(diffs)

	selectedDifficulty := -1
	for _, d := range diffs {
		for _, c := range eligible {
			if c.difficulty == d && !c.solved {
				selectedDifficulty = d
				break
			}
		}
		if selectedDifficulty != -1 {
			break
		}
	}
	if selectedDifficulty == -1 {
		selectedDifficulty = diffs[0]
	}

	diffCandidates := make([]candidate, 0)
	for _, c := range eligible {
		if c.difficulty == selectedDifficulty {
			diffCandidates = append(diffCandidates, c)
		}
	}
	if len(diffCandidates) == 0 {
		return nil, nil
	}

	rand.Seed(time.Now().UnixNano())
	selected := make([]candidate, 0, count)
	remaining := append([]candidate(nil), diffCandidates...)

	for len(selected) < count && len(remaining) > 0 {
		unseen := make([]candidate, 0)
		for _, c := range remaining {
			if c.seen == 0 {
				unseen = append(unseen, c)
			}
		}
		pickPool := unseen
		if len(pickPool) == 0 {
			minSeen := remaining[0].seen
			for _, c := range remaining {
				if c.seen < minSeen {
					minSeen = c.seen
				}
			}
			for _, c := range remaining {
				if c.seen == minSeen {
					pickPool = append(pickPool, c)
				}
			}
		}

		chosen := pickPool[rand.Intn(len(pickPool))]
		selected = append(selected, chosen)

		nextRemaining := make([]candidate, 0, len(remaining)-1)
		for _, c := range remaining {
			if c.id != chosen.id {
				nextRemaining = append(nextRemaining, c)
			}
		}
		remaining = nextRemaining
	}

	metas := make([]models.MetaExercise, 0, len(selected))
	for _, pick := range selected {
		var meta models.MetaExercise
		if err := s.db.First(&meta, pick.id).Error; err != nil {
			return nil, err
		}
		metas = append(metas, meta)
	}

	return metas, nil
}

// SelectExercisesForDefinitions selects exercises for many definitions in one pass.
// It preserves the same selection rules as SelectExercisesForDefinition while batching
// prerequisite and progress reads to avoid per-definition query fanout.
func (s *MetaExerciseService) SelectExercisesForDefinitions(userID uint, definitionIDs []uint, count int) (map[uint][]models.MetaExercise, error) {
	if count <= 0 {
		count = 1
	}

	seenDefs := make(map[uint]struct{}, len(definitionIDs))
	uniqueDefIDs := make([]uint, 0, len(definitionIDs))
	for _, definitionID := range definitionIDs {
		if _, exists := seenDefs[definitionID]; exists {
			continue
		}
		seenDefs[definitionID] = struct{}{}
		uniqueDefIDs = append(uniqueDefIDs, definitionID)
	}

	result := make(map[uint][]models.MetaExercise, len(uniqueDefIDs))
	for _, definitionID := range uniqueDefIDs {
		result[definitionID] = []models.MetaExercise{}
	}
	if len(uniqueDefIDs) == 0 {
		return result, nil
	}

	type linkRow struct {
		DefinitionID   uint
		MetaExerciseID uint
	}
	var links []linkRow
	if err := s.db.Raw(`
		SELECT prerequisite_id AS definition_id, node_id AS meta_exercise_id
		FROM node_prerequisites
		WHERE node_type = 'meta_exercise'
		  AND prerequisite_type IN ('meta_definition', 'definition')
		  AND prerequisite_id IN ?
	`, uniqueDefIDs).Scan(&links).Error; err != nil {
		return nil, err
	}
	if len(links) == 0 {
		return result, nil
	}

	candidateByDef := make(map[uint][]uint, len(uniqueDefIDs))
	candidateSeenByDef := make(map[uint]map[uint]struct{}, len(uniqueDefIDs))
	candidateSet := make(map[uint]struct{})
	for _, link := range links {
		if _, exists := seenDefs[link.DefinitionID]; !exists {
			continue
		}
		if _, ok := candidateSeenByDef[link.DefinitionID]; !ok {
			candidateSeenByDef[link.DefinitionID] = make(map[uint]struct{})
		}
		if _, exists := candidateSeenByDef[link.DefinitionID][link.MetaExerciseID]; exists {
			continue
		}
		candidateSeenByDef[link.DefinitionID][link.MetaExerciseID] = struct{}{}
		candidateByDef[link.DefinitionID] = append(candidateByDef[link.DefinitionID], link.MetaExerciseID)
		candidateSet[link.MetaExerciseID] = struct{}{}
	}

	candidateIDs := make([]uint, 0, len(candidateSet))
	for id := range candidateSet {
		candidateIDs = append(candidateIDs, id)
	}
	if len(candidateIDs) == 0 {
		return result, nil
	}

	var prereqs []models.NodePrerequisite
	if err := s.db.Where("node_type = ? AND node_id IN ?", "meta_exercise", candidateIDs).Find(&prereqs).Error; err != nil {
		return nil, err
	}

	defPrereqsByEx := make(map[uint][]uint)
	exPrereqsByEx := make(map[uint][]uint)
	defPrereqIDs := make(map[uint]struct{})
	for _, prereq := range prereqs {
		switch prereq.PrerequisiteType {
		case "meta_definition", "definition":
			defPrereqsByEx[prereq.NodeID] = append(defPrereqsByEx[prereq.NodeID], prereq.PrerequisiteID)
			defPrereqIDs[prereq.PrerequisiteID] = struct{}{}
		case "meta_exercise", "exercise":
			exPrereqsByEx[prereq.NodeID] = append(exPrereqsByEx[prereq.NodeID], prereq.PrerequisiteID)
		}
	}

	graspedDefs := make(map[uint]struct{})
	if len(defPrereqIDs) > 0 {
		allDefPrereqIDs := make([]uint, 0, len(defPrereqIDs))
		for id := range defPrereqIDs {
			allDefPrereqIDs = append(allDefPrereqIDs, id)
		}
		var rows []struct{ NodeID uint }
		if err := s.db.Model(&models.UserNodeProgress{}).
			Select("node_id").
			Where("user_id = ? AND node_type = ? AND status = ? AND node_id IN ?", userID, "definition", "grasped", allDefPrereqIDs).
			Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			graspedDefs[row.NodeID] = struct{}{}
		}
	}

	solvedSet := make(map[uint]struct{})
	var solvedIDs []uint
	if err := s.db.Model(&models.UserMetaExerciseStats{}).
		Where("user_id = ?", userID).
		Pluck("meta_exercise_id", &solvedIDs).Error; err != nil {
		return nil, err
	}
	for _, id := range solvedIDs {
		solvedSet[id] = struct{}{}
	}

	type diffRow struct {
		MetaExerciseID uint
		MinDifficulty  int
	}
	var diffRows []diffRow
	if err := s.db.Raw(`
		SELECT meta_exercise_id, MIN(COALESCE(NULLIF(difficulty, 0), 1)) as min_difficulty
		FROM exercises
		WHERE meta_exercise_id IN ?
		GROUP BY meta_exercise_id
	`, candidateIDs).Scan(&diffRows).Error; err != nil {
		return nil, err
	}
	diffMap := make(map[uint]int, len(diffRows))
	for _, row := range diffRows {
		diffMap[row.MetaExerciseID] = row.MinDifficulty
	}

	type seenRow struct {
		MetaExerciseID uint
		SeenCount      int
	}
	var seenRows []seenRow
	if err := s.db.Raw(`
		SELECT e.meta_exercise_id as meta_exercise_id,
			   COALESCE(SUM(uevs.seen_count), 0) as seen_count
		FROM exercises e
		LEFT JOIN user_exercise_version_stats uevs
			ON uevs.exercise_id = e.id AND uevs.user_id = ?
		WHERE e.meta_exercise_id IN ?
		GROUP BY e.meta_exercise_id
	`, userID, candidateIDs).Scan(&seenRows).Error; err != nil {
		return nil, err
	}
	seenMap := make(map[uint]int, len(seenRows))
	for _, row := range seenRows {
		seenMap[row.MetaExerciseID] = row.SeenCount
	}

	var metas []models.MetaExercise
	if err := s.db.Where("id IN ?", candidateIDs).Find(&metas).Error; err != nil {
		return nil, err
	}
	metaByID := make(map[uint]models.MetaExercise, len(metas))
	for _, meta := range metas {
		metaByID[meta.ID] = meta
	}

	definitionsGrasped := func(defIDs []uint) bool {
		for _, id := range defIDs {
			if _, ok := graspedDefs[id]; !ok {
				return false
			}
		}
		return true
	}

	prereqSolvedMemo := make(map[uint]bool)
	var checkExercisePrereqs func(exID uint, stack map[uint]bool) bool
	checkExercisePrereqs = func(exID uint, stack map[uint]bool) bool {
		if val, ok := prereqSolvedMemo[exID]; ok {
			return val
		}
		if stack[exID] {
			return true
		}
		stack[exID] = true
		for _, prereqID := range exPrereqsByEx[exID] {
			if _, ok := solvedSet[prereqID]; !ok {
				prereqSolvedMemo[exID] = false
				delete(stack, exID)
				return false
			}
			if !checkExercisePrereqs(prereqID, stack) {
				prereqSolvedMemo[exID] = false
				delete(stack, exID)
				return false
			}
		}
		delete(stack, exID)
		prereqSolvedMemo[exID] = true
		return true
	}

	type candidate struct {
		id         uint
		difficulty int
		seen       int
		solved     bool
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	for _, definitionID := range uniqueDefIDs {
		metaIDs := candidateByDef[definitionID]
		if len(metaIDs) == 0 {
			continue
		}

		eligible := make([]candidate, 0, len(metaIDs))
		for _, metaID := range metaIDs {
			if !definitionsGrasped(defPrereqsByEx[metaID]) {
				continue
			}
			if !checkExercisePrereqs(metaID, map[uint]bool{}) {
				continue
			}
			difficulty, ok := diffMap[metaID]
			if !ok {
				continue
			}
			_, solved := solvedSet[metaID]
			eligible = append(eligible, candidate{
				id:         metaID,
				difficulty: difficulty,
				seen:       seenMap[metaID],
				solved:     solved,
			})
		}
		if len(eligible) == 0 {
			continue
		}

		diffSet := make(map[int]struct{})
		for _, c := range eligible {
			diffSet[c.difficulty] = struct{}{}
		}
		diffs := make([]int, 0, len(diffSet))
		for difficulty := range diffSet {
			diffs = append(diffs, difficulty)
		}
		sort.Ints(diffs)

		selectedDifficulty := -1
		for _, difficulty := range diffs {
			for _, c := range eligible {
				if c.difficulty == difficulty && !c.solved {
					selectedDifficulty = difficulty
					break
				}
			}
			if selectedDifficulty != -1 {
				break
			}
		}
		if selectedDifficulty == -1 {
			selectedDifficulty = diffs[0]
		}

		diffCandidates := make([]candidate, 0)
		for _, c := range eligible {
			if c.difficulty == selectedDifficulty {
				diffCandidates = append(diffCandidates, c)
			}
		}
		if len(diffCandidates) == 0 {
			continue
		}

		selected := make([]candidate, 0, count)
		remaining := append([]candidate(nil), diffCandidates...)
		for len(selected) < count && len(remaining) > 0 {
			unseen := make([]candidate, 0)
			for _, c := range remaining {
				if c.seen == 0 {
					unseen = append(unseen, c)
				}
			}
			pickPool := unseen
			if len(pickPool) == 0 {
				minSeen := remaining[0].seen
				for _, c := range remaining {
					if c.seen < minSeen {
						minSeen = c.seen
					}
				}
				for _, c := range remaining {
					if c.seen == minSeen {
						pickPool = append(pickPool, c)
					}
				}
			}

			chosen := pickPool[rng.Intn(len(pickPool))]
			selected = append(selected, chosen)

			nextRemaining := make([]candidate, 0, len(remaining)-1)
			for _, c := range remaining {
				if c.id != chosen.id {
					nextRemaining = append(nextRemaining, c)
				}
			}
			remaining = nextRemaining
		}

		selectedMetas := make([]models.MetaExercise, 0, len(selected))
		for _, pick := range selected {
			meta, ok := metaByID[pick.id]
			if !ok {
				continue
			}
			selectedMetas = append(selectedMetas, meta)
		}
		result[definitionID] = selectedMetas
	}

	return result, nil
}
