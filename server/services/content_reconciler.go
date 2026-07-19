package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"ankidemy/server/models"

	"gorm.io/gorm"
)

type ContentReconcileResult struct {
	Revision string              `json:"revision"`
	NoOp     bool                `json:"noOp"`
	Counts   map[string]int      `json:"counts"`
	Changes  []ContentNodeChange `json:"changes,omitempty"`
}

// ContentNodeChange is intentionally content-free. Browser clients use these
// stable row identities to fetch and surgically replace only affected nodes.
type ContentNodeChange struct {
	SourceID         string `json:"sourceId"`
	NodeType         string `json:"nodeType"`
	NodeID           uint   `json:"nodeId"`
	Code             string `json:"code,omitempty"`
	State            string `json:"state"`
	PreviousNodeType string `json:"previousNodeType,omitempty"`
	PreviousNodeID   uint   `json:"previousNodeId,omitempty"`
}

type contentPosition struct{ X, Y float64 }

type ContentReconcileError struct {
	Validation ContentSnapshotValidation
}

func (e *ContentReconcileError) Error() string {
	for _, diagnostic := range e.Validation.Diagnostics {
		if diagnostic.Severity != "error" || diagnostic.Code == "snapshot.incomplete" {
			continue
		}
		location := ""
		if diagnostic.Location.File != "" {
			location = filepath.Base(diagnostic.Location.File)
			if diagnostic.Location.Line > 0 {
				location = fmt.Sprintf("%s:%d", location, diagnostic.Location.Line)
			}
		}
		if location != "" {
			return fmt.Sprintf("Org sync rejected: %s (%s)", diagnostic.Message, location)
		}
		return "Org sync rejected: " + diagnostic.Message
	}
	return "Org sync rejected because the content snapshot is incomplete"
}

// ContentReconciler applies one complete semantic snapshot in a single
// transaction. Provider identity mappings are updated in place; learning state
// tables are never rewritten by this service.
type ContentReconciler struct {
	db *gorm.DB
}

func NewContentReconciler(db *gorm.DB) *ContentReconciler {
	return &ContentReconciler{db: db}
}

func contentEntityKey(sourceID, role string) string { return role + "\x00" + sourceID }

func contentSemanticHash(value any) string {
	encoded, _ := json.Marshal(value)
	digest := sha256.Sum256(encoded)
	return "sha256:" + hex.EncodeToString(digest[:])
}

// planContentNodePositions assigns layout only to genuinely new provider
// nodes. Existing rows are never included, so provider resyncs cannot overwrite
// positions chosen in Ankidemy. New nodes prefer connected local neighbors and
// use deterministic radial probing to avoid an occupied coordinate.
func planContentNodePositions(tx *gorm.DB, binding *models.ContentBinding, snapshot ContentSnapshot, entities map[string]*models.ContentEntity) (map[string]*contentPosition, error) {
	occupied := make([]contentPosition, 0)
	bySource := make(map[string]contentPosition)
	type positionedRow struct {
		ID                   uint
		XPosition, YPosition float64
	}
	load := func(table string) (map[uint]contentPosition, error) {
		var rows []positionedRow
		if err := tx.Table(table).Select("id, x_position, y_position").Where("domain_id = ? AND deleted_at IS NULL", binding.DomainID).Scan(&rows).Error; err != nil {
			return nil, err
		}
		result := make(map[uint]contentPosition, len(rows))
		for _, row := range rows {
			position := contentPosition{X: row.XPosition, Y: row.YPosition}
			result[row.ID] = position
			occupied = append(occupied, position)
		}
		return result, nil
	}
	tables := map[string]string{"source": "sources", "definition": "meta_definitions", "exercise": "meta_exercises", "quest": "quests"}
	positionsByType := map[string]map[uint]contentPosition{}
	for nodeType, table := range tables {
		positions, err := load(table)
		if err != nil {
			return nil, err
		}
		positionsByType[nodeType] = positions
	}
	for _, entity := range entities {
		if entity.Role != "node" || entity.State != "active" {
			continue
		}
		if position, ok := positionsByType[entity.NodeType][entity.RowID]; ok {
			bySource[entity.ProviderEntityID] = position
		}
	}

	neighbors := make(map[string][]string)
	for _, edge := range snapshot.Edges {
		if edge.FromSourceID == "" || edge.ToSourceID == "" {
			continue
		}
		neighbors[edge.FromSourceID] = append(neighbors[edge.FromSourceID], edge.ToSourceID)
		neighbors[edge.ToSourceID] = append(neighbors[edge.ToSourceID], edge.FromSourceID)
	}
	planned := make(map[string]*contentPosition)
	for _, node := range snapshot.Nodes {
		entity := entities[contentEntityKey(node.SourceID, "node")]
		if entity != nil && entity.State == "active" && entity.NodeType == node.Type {
			continue
		}
		if entity != nil && entity.State == "active" {
			if previous, ok := bySource[node.SourceID]; ok {
				planned[node.SourceID] = &contentPosition{X: previous.X, Y: previous.Y}
				bySource[node.SourceID] = previous
				continue
			}
		}
		var anchor contentPosition
		count := 0
		for _, neighbor := range neighbors[node.SourceID] {
			if position, ok := bySource[neighbor]; ok {
				anchor.X += position.X
				anchor.Y += position.Y
				count++
			}
		}
		if count > 0 {
			anchor.X /= float64(count)
			anchor.Y /= float64(count)
		} else if len(occupied) > 0 {
			for _, position := range occupied {
				anchor.X += position.X
				anchor.Y += position.Y
			}
			anchor.X /= float64(len(occupied))
			anchor.Y /= float64(len(occupied))
		}
		position := findFreeContentPosition(anchor, node.SourceID, occupied)
		planned[node.SourceID] = &contentPosition{X: position.X, Y: position.Y}
		bySource[node.SourceID] = position
		occupied = append(occupied, position)
	}
	return planned, nil
}

func findFreeContentPosition(anchor contentPosition, sourceID string, occupied []contentPosition) contentPosition {
	digest := sha256.Sum256([]byte(sourceID))
	baseAngle := float64(uint16(digest[0])<<8|uint16(digest[1])) / 65535 * 2 * math.Pi
	const minimumDistance = 88.0
	for probe := 0; probe < 256; probe++ {
		ring := 1 + probe/12
		angle := baseAngle + float64(probe%12)*(2*math.Pi/12) + float64(ring)*0.17
		radius := 72.0 + float64(ring-1)*minimumDistance
		candidate := contentPosition{X: anchor.X + math.Cos(angle)*radius, Y: anchor.Y + math.Sin(angle)*radius}
		free := true
		for _, current := range occupied {
			if math.Hypot(candidate.X-current.X, candidate.Y-current.Y) < minimumDistance {
				free = false
				break
			}
		}
		if free {
			return candidate
		}
	}
	return contentPosition{X: anchor.X + math.Cos(baseAngle)*minimumDistance*24, Y: anchor.Y + math.Sin(baseAngle)*minimumDistance*24}
}

func (r *ContentReconciler) recordRejectedRun(bindingID uint, revision string, diagnostics []ContentDiagnostic) {
	encodedDiagnostics, _ := json.Marshal(diagnostics)
	now := time.Now().UTC()
	_ = r.db.Create(&models.ContentSyncRun{
		BindingID: bindingID, Revision: revision, Result: "rejected",
		Counts: json.RawMessage(`{}`), Diagnostics: encodedDiagnostics,
		StartedAt: now, FinishedAt: now,
	}).Error
}

func (r *ContentReconciler) Reconcile(bindingID uint, snapshot ContentSnapshot) (*ContentReconcileResult, error) {
	startedAt := time.Now().UTC()
	validation := ValidateContentSnapshot(snapshot)
	if !validation.Reconciliable {
		r.recordRejectedRun(bindingID, validation.Revision, validation.Diagnostics)
		return nil, &ContentReconcileError{Validation: validation}
	}

	var binding models.ContentBinding
	if err := r.db.First(&binding, bindingID).Error; err != nil {
		return nil, err
	}
	if binding.AuthorizationState != "attached" {
		return nil, errors.New("content binding is detached")
	}
	if binding.Provider != snapshot.Provider || binding.ProviderNotebookID != snapshot.Notebook.ProviderNotebookID {
		return nil, errors.New("snapshot provider/notebook does not match binding")
	}
	if binding.LastRevision == validation.Revision {
		return &ContentReconcileResult{Revision: validation.Revision, NoOp: true, Counts: map[string]int{}, Changes: []ContentNodeChange{}}, nil
	}

	counts := map[string]int{}
	changes := map[string]ContentNodeChange{}
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var lockedBinding models.ContentBinding
		if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&lockedBinding, bindingID).Error; err != nil {
			return err
		}
		if lockedBinding.LastRevision == validation.Revision {
			return nil
		}

		var existing []models.ContentEntity
		if err := tx.Where("binding_id = ?", bindingID).Find(&existing).Error; err != nil {
			return err
		}
		entities := make(map[string]*models.ContentEntity, len(existing)+len(snapshot.Nodes))
		for i := range existing {
			entity := existing[i]
			entities[contentEntityKey(entity.ProviderEntityID, entity.Role)] = &entity
		}
		seenEntities := map[uint]bool{}
		nodeEntities := make(map[string]*models.ContentEntity, len(snapshot.Nodes))
		plannedPositions, err := planContentNodePositions(tx, &lockedBinding, snapshot, entities)
		if err != nil {
			return err
		}

		for _, node := range snapshot.Nodes {
			previous := entities[contentEntityKey(node.SourceID, "node")]
			previousType, previousID := "", uint(0)
			if previous != nil && previous.State == "active" {
				previousType, previousID = previous.NodeType, previous.RowID
			}
			entity, changed, err := reconcileContentNode(tx, &lockedBinding, node, validation.Revision, entities, seenEntities, counts, plannedPositions[node.SourceID])
			if err != nil {
				return fmt.Errorf("reconcile node %s: %w", node.SourceID, err)
			}
			nodeEntities[node.SourceID] = entity
			if changed {
				change := ContentNodeChange{SourceID: node.SourceID, NodeType: entity.NodeType, NodeID: entity.RowID, Code: node.Code, State: "active"}
				if previousType != "" && (previousType != entity.NodeType || previousID != entity.RowID) {
					change.PreviousNodeType, change.PreviousNodeID = previousType, previousID
				}
				changes[node.SourceID] = change
			}
		}
		for i := range existing {
			entity := &existing[i]
			if entity.State == "active" && !seenEntities[entity.ID] {
				if entity.Role == "node" {
					changes[entity.ProviderEntityID] = ContentNodeChange{SourceID: entity.ProviderEntityID, NodeType: entity.NodeType, NodeID: entity.RowID, State: "missing"}
				}
				if err := retireContentEntity(tx, entity); err != nil {
					return err
				}
				counts["entitiesRetired"]++
			}
		}

		edgeChangedNodes := map[string]bool{}
		if err := reconcileContentEdges(tx, &lockedBinding, snapshot.Edges, nodeEntities, validation.Revision, counts, edgeChangedNodes); err != nil {
			return err
		}
		codes := make(map[string]string, len(snapshot.Nodes))
		for _, node := range snapshot.Nodes {
			codes[node.SourceID] = node.Code
		}
		for sourceID := range edgeChangedNodes {
			if _, already := changes[sourceID]; already {
				continue
			}
			if entity := nodeEntities[sourceID]; entity != nil {
				changes[sourceID] = ContentNodeChange{SourceID: sourceID, NodeType: entity.NodeType, NodeID: entity.RowID, Code: codes[sourceID], State: "active"}
			}
		}
		if err := reconcileContentAssets(tx, &lockedBinding, snapshot.Assets, entities, validation.Revision, counts); err != nil {
			return err
		}

		if err := tx.Model(&models.Domain{}).Where("id = ?", lockedBinding.DomainID).
			Update("name", snapshot.Notebook.Title).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		updates := map[string]any{
			"display_name": snapshot.Notebook.Title, "canonical_locator": snapshot.Notebook.Root,
			"schema_version": snapshot.Notebook.Schema, "protocol_version": snapshot.ProtocolVersion,
			"last_revision": validation.Revision, "last_accepted_at": now, "last_error": nil,
		}
		if err := tx.Model(&models.ContentBinding{}).Where("id = ?", bindingID).Updates(updates).Error; err != nil {
			return err
		}
		encodedCounts, _ := json.Marshal(counts)
		encodedDiagnostics, _ := json.Marshal(validation.Diagnostics)
		return tx.Create(&models.ContentSyncRun{
			BindingID: bindingID, Revision: validation.Revision, Result: "accepted",
			Counts: encodedCounts, Diagnostics: encodedDiagnostics,
			StartedAt: startedAt, FinishedAt: now,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	changeList := make([]ContentNodeChange, 0, len(changes))
	for _, change := range changes {
		changeList = append(changeList, change)
	}
	sort.Slice(changeList, func(i, j int) bool { return changeList[i].SourceID < changeList[j].SourceID })
	return &ContentReconcileResult{Revision: validation.Revision, Counts: counts, Changes: changeList}, nil
}

func reconcileContentNode(tx *gorm.DB, binding *models.ContentBinding, node ContentSnapshotNode, revision string, entities map[string]*models.ContentEntity, seen map[uint]bool, counts map[string]int, planned *contentPosition) (*models.ContentEntity, bool, error) {
	key := contentEntityKey(node.SourceID, "node")
	entity := entities[key]
	nodeHash := contentSemanticHash(node)
	if entity != nil && entity.State == "active" && entity.NodeType == node.Type && entity.ContentHash == nodeHash {
		seen[entity.ID] = true
		// A node hash includes its complete version list. If it is unchanged,
		// those durable version mappings are present too and require no writes.
		for _, candidate := range entities {
			if candidate.ParentEntityID == node.SourceID && candidate.State == "active" {
				seen[candidate.ID] = true
			}
		}
		return entity, false, nil
	}
	rowEntity := entity
	if entity != nil && entity.NodeType != node.Type {
		if entity.NodeType != "source" {
			return nil, false, fmt.Errorf("unsafe managed type change %s -> %s", entity.NodeType, node.Type)
		}
		if err := retireContentEntity(tx, entity); err != nil {
			return nil, false, err
		}
		// Keep the identity mapping but create a row in the new target table.
		rowEntity = nil
	}

	rowID, tableName, created, err := upsertContentNodeRow(tx, binding, node, rowEntity, planned)
	if err != nil {
		return nil, false, err
	}
	if entity == nil {
		entity = &models.ContentEntity{
			BindingID: binding.ID, ProviderEntityID: node.SourceID, Role: "node",
			NodeType: node.Type, TableNameValue: tableName, RowID: rowID,
			FirstSeenRevision: revision,
		}
	}
	entity.NodeType = node.Type
	entity.TableNameValue = tableName
	entity.RowID = rowID
	entity.RelativeLocator = node.Location.File
	entity.ContentHash = nodeHash
	entity.State = "active"
	entity.LastSeenRevision = revision
	if err := tx.Save(entity).Error; err != nil {
		return nil, false, err
	}
	entities[key] = entity
	seen[entity.ID] = true
	if created {
		counts["nodesCreated"]++
	} else {
		counts["nodesUpdated"]++
	}
	if err := upsertContentCode(tx, binding.DomainID, node.Type, rowID, node.Code); err != nil {
		return nil, false, err
	}

	switch node.Type {
	case "definition":
		for _, version := range node.Definition.Versions {
			if err := reconcileDefinitionVersion(tx, binding, node, version, revision, entities, seen, counts); err != nil {
				return nil, false, err
			}
		}
	case "exercise":
		for _, version := range node.Exercise.Versions {
			if err := reconcileExerciseVersion(tx, binding, node, version, revision, entities, seen, counts); err != nil {
				return nil, false, err
			}
		}
	case "quest":
		if err := reconcileQuestVersion(tx, binding, node, revision, entities, seen, counts); err != nil {
			return nil, false, err
		}
	}
	return entity, true, nil
}

func restoreContentRow(tx *gorm.DB, table string, rowID uint) error {
	var model any
	switch table {
	case "sources":
		model = &models.Source{}
	case "meta_definitions":
		model = &models.MetaDefinition{}
	case "definitions":
		model = &models.Definition{}
	case "meta_exercises":
		model = &models.MetaExercise{}
	case "exercises":
		model = &models.Exercise{}
	case "quests":
		model = &models.Quest{}
	case "quest_versions":
		model = &models.QuestVersion{}
	default:
		return fmt.Errorf("unsupported managed table %s", table)
	}
	return tx.Unscoped().Model(model).Where("id = ?", rowID).Update("deleted_at", nil).Error
}

func upsertContentNodeRow(tx *gorm.DB, binding *models.ContentBinding, node ContentSnapshotNode, entity *models.ContentEntity, planned *contentPosition) (uint, string, bool, error) {
	x, y := 0.0, 0.0
	if planned != nil {
		x, y = planned.X, planned.Y
	}
	switch node.Type {
	case "source":
		row := models.Source{DomainID: binding.DomainID, OwnerID: binding.OwnerID, Code: node.Code, Title: node.Name, ContentMd: node.Source.ContentMD, Visibility: "private", XPosition: x, YPosition: y}
		if entity == nil {
			if err := tx.Create(&row).Error; err != nil {
				return 0, "", false, err
			}
			return row.ID, "sources", true, nil
		}
		row.ID = entity.RowID
		if err := restoreContentRow(tx, "sources", row.ID); err != nil {
			return 0, "", false, err
		}
		if err := tx.Model(&models.Source{}).Where("id = ?", row.ID).Updates(map[string]any{
			"domain_id": binding.DomainID, "owner_id": binding.OwnerID, "code": node.Code,
			"title": node.Name, "content_md": node.Source.ContentMD,
		}).Error; err != nil {
			return 0, "", false, err
		}
		return row.ID, "sources", false, nil
	case "definition":
		row := models.MetaDefinition{Code: node.Code, Name: node.Name, DomainID: binding.DomainID, OwnerID: binding.OwnerID, XPosition: x, YPosition: y}
		if entity == nil {
			if err := tx.Create(&row).Error; err != nil {
				return 0, "", false, err
			}
			return row.ID, "meta_definitions", true, nil
		}
		row.ID = entity.RowID
		if err := restoreContentRow(tx, "meta_definitions", row.ID); err != nil {
			return 0, "", false, err
		}
		if err := tx.Model(&models.MetaDefinition{}).Where("id = ?", row.ID).Updates(map[string]any{
			"code": node.Code, "name": node.Name, "domain_id": binding.DomainID, "owner_id": binding.OwnerID,
		}).Error; err != nil {
			return 0, "", false, err
		}
		return row.ID, "meta_definitions", false, nil
	case "exercise":
		row := models.MetaExercise{Code: node.Code, Name: node.Name, DomainID: binding.DomainID, OwnerID: binding.OwnerID, XPosition: x, YPosition: y}
		if entity == nil {
			if err := tx.Create(&row).Error; err != nil {
				return 0, "", false, err
			}
			return row.ID, "meta_exercises", true, nil
		}
		row.ID = entity.RowID
		if err := restoreContentRow(tx, "meta_exercises", row.ID); err != nil {
			return 0, "", false, err
		}
		if err := tx.Model(&models.MetaExercise{}).Where("id = ?", row.ID).Updates(map[string]any{
			"code": node.Code, "name": node.Name, "domain_id": binding.DomainID, "owner_id": binding.OwnerID,
		}).Error; err != nil {
			return 0, "", false, err
		}
		return row.ID, "meta_exercises", false, nil
	case "quest":
		row := models.Quest{DomainID: binding.DomainID, OwnerID: binding.OwnerID, Code: node.Code, Name: node.Name, Kind: node.Quest.Kind, Schedule: node.Quest.Schedule, Visibility: "private", XPosition: x, YPosition: y}
		if entity == nil {
			if err := tx.Create(&row).Error; err != nil {
				return 0, "", false, err
			}
			return row.ID, "quests", true, nil
		}
		row.ID = entity.RowID
		if err := restoreContentRow(tx, "quests", row.ID); err != nil {
			return 0, "", false, err
		}
		if err := tx.Model(&models.Quest{}).Where("id = ?", row.ID).Updates(map[string]any{
			"domain_id": binding.DomainID, "owner_id": binding.OwnerID, "code": node.Code,
			"name": node.Name, "kind": node.Quest.Kind, "schedule": node.Quest.Schedule,
		}).Error; err != nil {
			return 0, "", false, err
		}
		return row.ID, "quests", false, nil
	default:
		return 0, "", false, fmt.Errorf("unsupported node type %s", node.Type)
	}
}

func upsertContentCode(tx *gorm.DB, domainID uint, nodeType string, rowID uint, code string) error {
	var registry models.DomainNodeCode
	err := tx.Where("domain_id = ? AND node_type = ? AND node_id = ?", domainID, nodeType, rowID).First(&registry).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Stable provider identity may legitimately promote a source to another
		// type. Reuse its domain-wide code registry row when present.
		if byCodeErr := tx.Where("domain_id = ? AND code = ?", domainID, code).First(&registry).Error; byCodeErr == nil {
			return tx.Model(&registry).Updates(map[string]any{"node_type": nodeType, "node_id": rowID}).Error
		} else if !errors.Is(byCodeErr, gorm.ErrRecordNotFound) {
			return byCodeErr
		}
		return tx.Create(&models.DomainNodeCode{DomainID: domainID, Code: code, NodeType: nodeType, NodeID: rowID}).Error
	}
	if err != nil {
		return err
	}
	return tx.Model(&registry).Update("code", code).Error
}

func reconcileDefinitionVersion(tx *gorm.DB, binding *models.ContentBinding, node ContentSnapshotNode, version ContentDefinitionVersion, revision string, entities map[string]*models.ContentEntity, seen map[uint]bool, counts map[string]int) error {
	owner := entities[contentEntityKey(node.SourceID, "node")]
	key := contentEntityKey(version.SourceID, "definition_version")
	entity := entities[key]
	hash := contentSemanticHash(struct {
		Code, Name string
		Version    ContentDefinitionVersion
	}{node.Code, node.Name, version})
	if unchangedContentVersion(entity, hash, seen) {
		return nil
	}
	row := models.Definition{Code: node.Code, Name: node.Name, Prompt: version.Prompt, Description: version.DescriptionMD, Notes: version.NotesMD, Type: "open_ended", DomainID: binding.DomainID, OwnerID: binding.OwnerID, MetaDefinitionID: owner.RowID, DisplayOrder: version.Order}
	if entity != nil {
		row.ID = entity.RowID
		if err := restoreContentRow(tx, "definitions", row.ID); err != nil {
			return err
		}
	}
	if err := tx.Save(&row).Error; err != nil {
		return err
	}
	if err := tx.Where("definition_id = ?", row.ID).Delete(&models.Reference{}).Error; err != nil {
		return err
	}
	for _, value := range version.ReferencesMD {
		if err := tx.Create(&models.Reference{DefinitionID: row.ID, Reference: value}).Error; err != nil {
			return err
		}
	}
	return saveVersionEntity(tx, binding.ID, version.SourceID, "definition_version", "definition", "definitions", row.ID, node.SourceID, node.Location.File, hash, revision, entity, entities, seen, counts)
}

func reconcileExerciseVersion(tx *gorm.DB, binding *models.ContentBinding, node ContentSnapshotNode, version ContentExerciseVersion, revision string, entities map[string]*models.ContentEntity, seen map[uint]bool, counts map[string]int) error {
	owner := entities[contentEntityKey(node.SourceID, "node")]
	key := contentEntityKey(version.SourceID, "exercise_version")
	entity := entities[key]
	hash := contentSemanticHash(struct {
		Code, Name string
		Version    ContentExerciseVersion
	}{node.Code, node.Name, version})
	if unchangedContentVersion(entity, hash, seen) {
		return nil
	}
	row := models.Exercise{Code: node.Code, Name: node.Name, Statement: version.Statement, Description: version.DescriptionMD, Notes: version.NotesMD, Hints: version.HintsMD, DomainID: binding.DomainID, OwnerID: binding.OwnerID, MetaExerciseID: owner.RowID, DisplayOrder: version.Order, Verifiable: version.Verifiable, Result: version.SolutionMD, Difficulty: version.Difficulty}
	if entity != nil {
		row.ID = entity.RowID
		if err := restoreContentRow(tx, "exercises", row.ID); err != nil {
			return err
		}
	}
	if err := tx.Save(&row).Error; err != nil {
		return err
	}
	return saveVersionEntity(tx, binding.ID, version.SourceID, "exercise_version", "exercise", "exercises", row.ID, node.SourceID, node.Location.File, hash, revision, entity, entities, seen, counts)
}

func reconcileQuestVersion(tx *gorm.DB, binding *models.ContentBinding, node ContentSnapshotNode, revision string, entities map[string]*models.ContentEntity, seen map[uint]bool, counts map[string]int) error {
	owner := entities[contentEntityKey(node.SourceID, "node")]
	key := contentEntityKey(node.SourceID, "quest_version")
	entity := entities[key]
	hash := contentSemanticHash(struct {
		Name  string
		Quest *ContentQuestPayload
	}{node.Name, node.Quest})
	if unchangedContentVersion(entity, hash, seen) {
		return nil
	}
	row := models.QuestVersion{QuestID: owner.RowID, Title: node.Name, DescriptionMd: node.Quest.DescriptionMD, TaskList: node.Quest.TaskList}
	if entity != nil {
		row.ID = entity.RowID
		if err := restoreContentRow(tx, "quest_versions", row.ID); err != nil {
			return err
		}
	}
	if err := tx.Save(&row).Error; err != nil {
		return err
	}
	return saveVersionEntity(tx, binding.ID, node.SourceID, "quest_version", "quest", "quest_versions", row.ID, node.SourceID, node.Location.File, hash, revision, entity, entities, seen, counts)
}

func unchangedContentVersion(entity *models.ContentEntity, hash string, seen map[uint]bool) bool {
	if entity == nil || entity.State != "active" || entity.ContentHash != hash {
		return false
	}
	seen[entity.ID] = true
	return true
}

func saveVersionEntity(tx *gorm.DB, bindingID uint, sourceID, role, nodeType, table string, rowID uint, parent, locator, hash, revision string, entity *models.ContentEntity, entities map[string]*models.ContentEntity, seen map[uint]bool, counts map[string]int) error {
	created := entity == nil
	if entity == nil {
		entity = &models.ContentEntity{BindingID: bindingID, ProviderEntityID: sourceID, Role: role, FirstSeenRevision: revision}
	}
	entity.NodeType, entity.TableNameValue, entity.RowID = nodeType, table, rowID
	entity.ParentEntityID, entity.RelativeLocator, entity.ContentHash = parent, locator, hash
	entity.State, entity.LastSeenRevision = "active", revision
	if err := tx.Save(entity).Error; err != nil {
		return err
	}
	entities[contentEntityKey(sourceID, role)] = entity
	seen[entity.ID] = true
	if created {
		counts["versionsCreated"]++
	} else {
		counts["versionsUpdated"]++
	}
	return nil
}

func retireContentEntity(tx *gorm.DB, entity *models.ContentEntity) error {
	var model any
	switch entity.TableNameValue {
	case "sources":
		model = &models.Source{}
	case "meta_definitions":
		model = &models.MetaDefinition{}
	case "definitions":
		model = &models.Definition{}
	case "meta_exercises":
		model = &models.MetaExercise{}
	case "exercises":
		model = &models.Exercise{}
	case "quests":
		model = &models.Quest{}
	case "quest_versions":
		model = &models.QuestVersion{}
	default:
		return fmt.Errorf("unsupported managed table %s", entity.TableNameValue)
	}
	if err := tx.Delete(model, entity.RowID).Error; err != nil {
		return err
	}
	entity.State = "missing"
	return tx.Model(&models.ContentEntity{}).Where("id = ?", entity.ID).Update("state", "missing").Error
}

func reconcileContentEdges(tx *gorm.DB, binding *models.ContentBinding, edges []ContentSnapshotEdge, nodes map[string]*models.ContentEntity, revision string, counts map[string]int, changedNodes map[string]bool) error {
	var existing []models.ContentManagedEdge
	if err := tx.Where("binding_id = ?", binding.ID).Find(&existing).Error; err != nil {
		return err
	}
	byKey := map[string]*models.ContentManagedEdge{}
	for i := range existing {
		edge := existing[i]
		byKey[edge.EvidenceKey] = &edge
	}
	seen := map[uint]bool{}
	for _, edge := range edges {
		managed := byKey[edge.EvidenceKey]
		expectedFrom := edge.FromSourceID
		if edge.FromExternalSourceID != "" {
			expectedFrom = edge.FromExternalSourceID
		}
		expectedTo := edge.ToSourceID
		if edge.ToExternalSourceID != "" {
			expectedTo = edge.ToExternalSourceID
		}
		if managed != nil && managed.State == "active" && managed.EvidenceKind == edge.Evidence &&
			managed.FromProviderEntityID == expectedFrom && managed.ToProviderEntityID == expectedTo && managed.MaterializedRowID != nil {
			seen[managed.ID] = true
			continue
		}
		if edge.FromSourceID != "" {
			changedNodes[edge.FromSourceID] = true
		}
		if edge.ToSourceID != "" {
			changedNodes[edge.ToSourceID] = true
		}
		var oldTable string
		var oldRowID uint
		materializeExisting := managed
		if managed != nil && managed.State == "active" && managed.MaterializedRowID != nil {
			oldTable, oldRowID = managed.MaterializedTable, *managed.MaterializedRowID
			materializeExisting = nil
		}
		table, rowID, externalBindingID, err := materializeContentEdge(tx, binding, edge, nodes, materializeExisting)
		if err != nil {
			return fmt.Errorf("materialize edge %s: %w", edge.EvidenceKey, err)
		}
		if managed == nil {
			managed = &models.ContentManagedEdge{BindingID: binding.ID, EvidenceKey: edge.EvidenceKey, FirstSeenRevision: revision}
			counts["edgesCreated"]++
		} else {
			counts["edgesUpdated"]++
		}
		managed.EvidenceKind = edge.Evidence
		managed.FromProviderEntityID = expectedFrom
		managed.ToProviderEntityID = expectedTo
		managed.ExternalBindingID = externalBindingID
		managed.MaterializedTable, managed.MaterializedRowID = table, &rowID
		managed.State, managed.LastSeenRevision = "active", revision
		if err := tx.Save(managed).Error; err != nil {
			return err
		}
		if oldRowID != 0 && (oldTable != table || oldRowID != rowID) {
			var otherEvidence int64
			if err := tx.Model(&models.ContentManagedEdge{}).
				Where("binding_id = ? AND id <> ? AND materialized_table = ? AND materialized_row_id = ? AND state = 'active'", binding.ID, managed.ID, oldTable, oldRowID).
				Count(&otherEvidence).Error; err != nil {
				return err
			}
			if otherEvidence == 0 {
				if err := deleteMaterializedContentEdge(tx, oldTable, oldRowID); err != nil {
					return err
				}
			}
		}
		seen[managed.ID] = true
	}
	for i := range existing {
		managed := &existing[i]
		if managed.State != "active" || seen[managed.ID] {
			continue
		}
		if _, local := nodes[managed.FromProviderEntityID]; local {
			changedNodes[managed.FromProviderEntityID] = true
		}
		if _, local := nodes[managed.ToProviderEntityID]; local {
			changedNodes[managed.ToProviderEntityID] = true
		}
		if err := tx.Model(&models.ContentManagedEdge{}).Where("id = ?", managed.ID).Update("state", "missing").Error; err != nil {
			return err
		}
		var activeEvidence int64
		if managed.MaterializedRowID != nil {
			if err := tx.Model(&models.ContentManagedEdge{}).
				Where("binding_id = ? AND materialized_table = ? AND materialized_row_id = ? AND state = 'active'", binding.ID, managed.MaterializedTable, *managed.MaterializedRowID).
				Count(&activeEvidence).Error; err != nil {
				return err
			}
			if activeEvidence == 0 {
				if err := deleteMaterializedContentEdge(tx, managed.MaterializedTable, *managed.MaterializedRowID); err != nil {
					return err
				}
			}
		}
		counts["edgesRetired"]++
	}
	return nil
}

func contentRelationType(nodeType string) string {
	if nodeType == "quest" {
		return "quest"
	}
	return nodeType
}

func materializeContentEdge(tx *gorm.DB, binding *models.ContentBinding, edge ContentSnapshotEdge, nodes map[string]*models.ContentEntity, existing *models.ContentManagedEdge) (string, uint, *uint, error) {
	if existing != nil && existing.State == "active" && existing.MaterializedRowID != nil {
		return existing.MaterializedTable, *existing.MaterializedRowID, existing.ExternalBindingID, nil
	}
	if edge.FromExternalProviderNotebookID != "" || edge.ToExternalProviderNotebookID != "" {
		return materializeExternalContentEdge(tx, binding, edge, nodes)
	}
	from, to := nodes[edge.FromSourceID], nodes[edge.ToSourceID]
	if from == nil || to == nil {
		return "", 0, nil, errors.New("local endpoint mapping missing")
	}
	if (from.NodeType == "definition" || from.NodeType == "exercise") && (to.NodeType == "definition" || to.NodeType == "exercise") {
		row := models.NodePrerequisite{NodeID: to.RowID, NodeType: to.NodeType, PrerequisiteID: from.RowID, PrerequisiteType: from.NodeType, Weight: 1}
		if err := tx.Where("node_id = ? AND node_type = ? AND prerequisite_id = ? AND prerequisite_type = ?", row.NodeID, row.NodeType, row.PrerequisiteID, row.PrerequisiteType).FirstOrCreate(&row).Error; err != nil {
			return "", 0, nil, err
		}
		return "node_prerequisites", row.ID, nil, nil
	}
	row := models.NodeRelation{DomainID: binding.DomainID, FromType: contentRelationType(from.NodeType), FromID: from.RowID, ToType: contentRelationType(to.NodeType), ToID: to.RowID, RelationType: "relevant", ContextKey: "content-import", CreatedBy: binding.OwnerID}
	if err := tx.Where("domain_id = ? AND from_type = ? AND from_id = ? AND to_type = ? AND to_id = ? AND relation_type = ? AND context_key = ?", row.DomainID, row.FromType, row.FromID, row.ToType, row.ToID, row.RelationType, row.ContextKey).FirstOrCreate(&row).Error; err != nil {
		return "", 0, nil, err
	}
	return "node_relations", row.ID, nil, nil
}

func materializeExternalContentEdge(tx *gorm.DB, binding *models.ContentBinding, edge ContentSnapshotEdge, nodes map[string]*models.ContentEntity) (string, uint, *uint, error) {
	fromExternal := edge.FromExternalProviderNotebookID != ""
	notebookID, externalSourceID, localSourceID, direction := edge.FromExternalProviderNotebookID, edge.FromExternalSourceID, edge.ToSourceID, "to"
	if !fromExternal {
		notebookID, externalSourceID, localSourceID, direction = edge.ToExternalProviderNotebookID, edge.ToExternalSourceID, edge.FromSourceID, "from"
	}
	local := nodes[localSourceID]
	if local == nil {
		return "", 0, nil, errors.New("local external-edge endpoint missing")
	}
	var externalBinding models.ContentBinding
	if err := tx.Where("owner_id = ? AND provider = ? AND provider_notebook_id = ? AND authorization_state = 'attached'", binding.OwnerID, binding.Provider, notebookID).First(&externalBinding).Error; err != nil {
		return "", 0, nil, fmt.Errorf("external notebook is not bound: %w", err)
	}
	var externalEntity models.ContentEntity
	if err := tx.Where("binding_id = ? AND provider_entity_id = ? AND role = 'node' AND state = 'active'", externalBinding.ID, externalSourceID).First(&externalEntity).Error; err != nil {
		return "", 0, nil, fmt.Errorf("external node is unavailable: %w", err)
	}
	var externalDomain models.Domain
	if err := tx.First(&externalDomain, externalBinding.DomainID).Error; err != nil {
		return "", 0, nil, err
	}
	if externalDomain.DomainUID == nil || strings.TrimSpace(*externalDomain.DomainUID) == "" {
		return "", 0, nil, errors.New("external domain has no stable UID")
	}
	externalDomainID := externalDomain.ID
	row := models.ExternalNodeRelation{DomainID: binding.DomainID, LocalNodeID: local.RowID, LocalNodeType: contentRelationType(local.NodeType), LocalDirection: direction, ExternalDomainUID: *externalDomain.DomainUID, ExternalDomainID: &externalDomainID, ExternalNodeID: externalEntity.RowID, ExternalNodeType: contentRelationType(externalEntity.NodeType), RelationType: "relevant", ContextKey: "content-import", CreatedBy: binding.OwnerID}
	if err := tx.Where("domain_id = ? AND local_node_id = ? AND local_node_type = ? AND local_direction = ? AND external_domain_uid = ? AND external_node_id = ? AND external_node_type = ? AND relation_type = ? AND context_key = ?", row.DomainID, row.LocalNodeID, row.LocalNodeType, row.LocalDirection, row.ExternalDomainUID, row.ExternalNodeID, row.ExternalNodeType, row.RelationType, row.ContextKey).FirstOrCreate(&row).Error; err != nil {
		return "", 0, nil, err
	}
	return "external_node_relations", row.ID, &externalBinding.ID, nil
}

func deleteMaterializedContentEdge(tx *gorm.DB, table string, rowID uint) error {
	switch table {
	case "node_prerequisites":
		return tx.Delete(&models.NodePrerequisite{}, rowID).Error
	case "node_relations":
		return tx.Delete(&models.NodeRelation{}, rowID).Error
	case "external_node_relations":
		return tx.Delete(&models.ExternalNodeRelation{}, rowID).Error
	default:
		return fmt.Errorf("unsupported materialized edge table %s", table)
	}
}

func reconcileContentAssets(tx *gorm.DB, binding *models.ContentBinding, assets []ContentSnapshotAsset, entities map[string]*models.ContentEntity, revision string, counts map[string]int) error {
	var existing []models.ContentAsset
	if err := tx.Where("binding_id = ?", binding.ID).Find(&existing).Error; err != nil {
		return err
	}
	byKey := map[string]*models.ContentAsset{}
	for i := range existing {
		asset := existing[i]
		byKey[asset.OwnerEntityID+"\x00"+asset.OwnerRole+"\x00"+asset.OwnerField+"\x00"+asset.SHA256] = &asset
	}
	seen := map[uint]bool{}
	for _, asset := range assets {
		sha := strings.TrimPrefix(asset.ID, "sha256:")
		key := asset.OwnerSourceID + "\x00" + asset.OwnerRole + "\x00" + asset.OwnerField + "\x00" + sha
		row := byKey[key]
		if row != nil && row.State == "active" && row.MIME == asset.MIME && row.ByteSize == asset.ByteSize &&
			row.Width == asset.Width && row.Height == asset.Height && row.RelativeLocator == asset.SourceLocator && row.MediaPath == asset.MediaURL {
			seen[row.ID] = true
			continue
		}
		if row == nil {
			row = &models.ContentAsset{BindingID: binding.ID, OwnerEntityID: asset.OwnerSourceID, OwnerRole: asset.OwnerRole, OwnerField: asset.OwnerField, SHA256: sha, FirstSeenRevision: revision}
			counts["assetsCreated"]++
		} else {
			counts["assetsUpdated"]++
		}
		row.MIME, row.ByteSize, row.Width, row.Height = asset.MIME, asset.ByteSize, asset.Width, asset.Height
		row.RelativeLocator, row.MediaPath = asset.SourceLocator, asset.MediaURL
		row.State, row.LastSeenRevision = "active", revision
		if err := tx.Save(row).Error; err != nil {
			return err
		}
		seen[row.ID] = true
	}
	for i := range existing {
		row := &existing[i]
		if row.State == "active" && !seen[row.ID] {
			if err := tx.Model(&models.ContentAsset{}).Where("id = ?", row.ID).Update("state", "missing").Error; err != nil {
				return err
			}
			counts["assetsRetired"]++
		}
	}
	_ = entities
	return nil
}
