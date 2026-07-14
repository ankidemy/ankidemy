package services

import (
	"ankidemy/server/dao"
	"ankidemy/server/models"

	"gorm.io/gorm"
)

// Exercise status is never set by the user: it derives from the status of the
// nearest parent definition — the closest definition ancestor reachable
// through prerequisite edges (directly, or through chains of prerequisite
// exercises). Ties at the same distance resolve by priority
// tackling > grasped > learned > fresh, so an exercise is only scheduled when
// its closest definitions are actually grasped, pauses while they are being
// tackled, and retires when they are learned.

var derivedStatusPriority = map[string]int{
	"fresh":    0,
	"learned":  1,
	"grasped":  2,
	"tackling": 3,
}

// deriveExerciseStatus walks prerequisite edges upward from an exercise in
// BFS level order and returns the derived status from the first level that
// contains definitions. Exercises with no definition ancestor stay fresh.
func deriveExerciseStatus(
	start NodeKey,
	graph map[NodeKey]*GraphNode,
	definitionStatus func(nodeID uint) string,
) string {
	visited := map[NodeKey]bool{start: true}
	frontier := []NodeKey{start}

	for len(frontier) > 0 {
		next := make([]NodeKey, 0)
		best := ""
		for _, key := range frontier {
			node := graph[key]
			if node == nil {
				continue
			}
			for _, edge := range node.Prerequisites {
				edgeKey := makeNodeKey(edge.ID, edge.Type)
				if visited[edgeKey] {
					continue
				}
				visited[edgeKey] = true
				if edge.Type == models.NodeTypeDefinition {
					status := definitionStatus(edge.ID)
					if best == "" || derivedStatusPriority[status] > derivedStatusPriority[best] {
						best = status
					}
					continue
				}
				next = append(next, edgeKey)
			}
		}
		if best != "" {
			return best
		}
		frontier = next
	}

	return "fresh"
}

// DeriveExerciseStatusesTx recomputes and persists derived exercise statuses
// for one user in a domain inside the given transaction.
func (s *SRSService) DeriveExerciseStatusesTx(tx *gorm.DB, userID uint, domainID uint) error {
	srsDao := dao.NewSRSDao(tx)

	prerequisites, err := srsDao.GetPrerequisitesByDomain(domainID)
	if err != nil {
		return err
	}
	graph := s.creditService.BuildGraph(prerequisites)

	// Collect all exercise nodes in the domain (graph members plus any with
	// existing progress rows, so orphaned exercises reset to fresh too).
	exerciseIDs := make([]uint, 0)
	seenExercise := make(map[uint]bool)
	definitionIDs := make([]uint, 0)
	seenDefinition := make(map[uint]bool)
	for key := range graph {
		switch key.Type {
		case models.NodeTypeExercise:
			if !seenExercise[key.ID] {
				seenExercise[key.ID] = true
				exerciseIDs = append(exerciseIDs, key.ID)
			}
		case models.NodeTypeDefinition:
			if !seenDefinition[key.ID] {
				seenDefinition[key.ID] = true
				definitionIDs = append(definitionIDs, key.ID)
			}
		}
	}

	var domainExerciseIDs []uint
	if err := tx.Model(&models.MetaExercise{}).Where("domain_id = ?", domainID).Pluck("id", &domainExerciseIDs).Error; err != nil {
		return err
	}
	for _, id := range domainExerciseIDs {
		if !seenExercise[id] {
			seenExercise[id] = true
			exerciseIDs = append(exerciseIDs, id)
		}
	}

	if len(exerciseIDs) == 0 {
		return nil
	}

	defProgress, err := srsDao.GetUserProgressByNodeIDs(userID, models.NodeTypeDefinition, definitionIDs)
	if err != nil {
		return err
	}
	exProgress, err := srsDao.GetUserProgressByNodeIDs(userID, models.NodeTypeExercise, exerciseIDs)
	if err != nil {
		return err
	}

	definitionStatus := func(nodeID uint) string {
		if row, ok := defProgress[nodeID]; ok {
			return row.Status
		}
		return "fresh"
	}

	pending := make([]*models.UserNodeProgress, 0)
	for _, exerciseID := range exerciseIDs {
		derived := deriveExerciseStatus(makeNodeKey(exerciseID, models.NodeTypeExercise), graph, definitionStatus)

		if row, ok := exProgress[exerciseID]; ok {
			if row.Status != derived {
				rowCopy := row
				rowCopy.Status = derived
				pending = append(pending, &rowCopy)
			}
			continue
		}
		if derived == "fresh" {
			// No row and nothing to track — keep the table sparse.
			continue
		}
		pending = append(pending, &models.UserNodeProgress{
			UserID:            userID,
			NodeID:            exerciseID,
			NodeType:          models.NodeTypeExercise,
			Status:            derived,
			EasinessFactor:    2.5,
			IntervalDays:      0,
			Repetitions:       0,
			AccumulatedCredit: 0,
			CreditPostponed:   false,
			TotalReviews:      0,
			SuccessfulReviews: 0,
		})
	}

	return srsDao.CreateOrUpdateProgressBatch(pending)
}

// DeriveExerciseStatusesForDomain recomputes derived exercise statuses for
// every user with progress in the domain. Used after prerequisite mutations,
// which can change which definition is an exercise's nearest parent.
func (s *SRSService) DeriveExerciseStatusesForDomain(domainID uint) error {
	var userIDs []uint
	query := `
		SELECT DISTINCT unp.user_id
		FROM user_node_progress unp
		WHERE (unp.node_type = 'definition' AND unp.node_id IN (SELECT id FROM meta_definitions WHERE domain_id = ?))
		   OR (unp.node_type = 'exercise' AND unp.node_id IN (SELECT id FROM meta_exercises WHERE domain_id = ?))
	`
	if err := s.db.Raw(query, domainID, domainID).Scan(&userIDs).Error; err != nil {
		return err
	}

	for _, userID := range userIDs {
		err := s.db.Transaction(func(tx *gorm.DB) error {
			return s.DeriveExerciseStatusesTx(tx, userID, domainID)
		})
		if err != nil {
			return err
		}
		s.invalidateDueCache(userID, domainID)
		s.invalidateQueueCache(userID, domainID)
	}

	return nil
}
