package services

import (
	"math"
	"testing"

	"ankidemy/server/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func contentReconcilerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	modelsToMigrate := []any{
		&models.Domain{}, &models.Source{}, &models.MetaDefinition{}, &models.Definition{}, &models.Reference{},
		&models.MetaExercise{}, &models.Exercise{}, &models.MetaQuest{}, &models.QuestVersion{},
		&models.DomainNodeCode{}, &models.NodePrerequisite{}, &models.NodeRelation{}, &models.ExternalNodeRelation{},
		&models.ContentBinding{}, &models.ContentEntity{}, &models.ContentManagedEdge{}, &models.ContentAsset{}, &models.ContentSyncRun{},
		&models.UserDomainProgress{},
		&models.UserNodeProgress{}, &models.UserDefinitionVersionStats{}, &models.UserExerciseVersionStats{},
	}
	if err := db.AutoMigrate(modelsToMigrate...); err != nil {
		t.Fatal(err)
	}
	return db
}

func contentReconcilerFixture(t *testing.T, db *gorm.DB) (*ContentReconciler, *models.ContentBinding, ContentSnapshot) {
	t.Helper()
	domain := &models.Domain{Name: "Before import", Privacy: "private", OwnerID: 42}
	if err := db.Create(domain).Error; err != nil {
		t.Fatal(err)
	}
	binding := &models.ContentBinding{
		Provider: "org-roam", ProviderNotebookID: "notebook-technical",
		DomainID: domain.ID, OwnerID: 42, Config: []byte(`{}`),
		SchemaVersion: 1, ProtocolVersion: 1, AuthorizationState: "attached", ConnectionState: "online",
	}
	if err := db.Create(binding).Error; err != nil {
		t.Fatal(err)
	}
	return NewContentReconciler(db), binding, validContentSnapshot()
}

func contentEntityFor(t *testing.T, db *gorm.DB, bindingID uint, sourceID, role string) models.ContentEntity {
	t.Helper()
	var entity models.ContentEntity
	if err := db.Where("binding_id = ? AND provider_entity_id = ? AND role = ?", bindingID, sourceID, role).First(&entity).Error; err != nil {
		t.Fatal(err)
	}
	return entity
}

func TestContentReconcilerPreservesIdentityProgressAndVersionStats(t *testing.T) {
	db := contentReconcilerTestDB(t)
	reconciler, binding, snapshot := contentReconcilerFixture(t, db)
	first, err := reconciler.Reconcile(binding.ID, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if first.NoOp || first.Counts["nodesCreated"] != 4 || first.Counts["versionsCreated"] != 4 {
		t.Fatalf("unexpected first reconcile: %#v", first)
	}
	if len(first.Changes) != 4 {
		t.Fatalf("initial reconcile did not report surgical node changes: %#v", first.Changes)
	}
	var definitionPosition, exercisePosition contentPosition
	var definitionRow models.MetaDefinition
	var exerciseRow models.MetaExercise
	definitionEntity := contentEntityFor(t, db, binding.ID, "definition-1", "node")
	exerciseEntity := contentEntityFor(t, db, binding.ID, "exercise-1", "node")
	if err := db.First(&definitionRow, definitionEntity.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&exerciseRow, exerciseEntity.RowID).Error; err != nil {
		t.Fatal(err)
	}
	definitionPosition = contentPosition{X: definitionRow.XPosition, Y: definitionRow.YPosition}
	exercisePosition = contentPosition{X: exerciseRow.XPosition, Y: exerciseRow.YPosition}
	if math.Hypot(definitionPosition.X-exercisePosition.X, definitionPosition.Y-exercisePosition.Y) < 88 {
		t.Fatalf("connected imported nodes overlap: definition=%#v exercise=%#v", definitionPosition, exercisePosition)
	}

	definition := contentEntityFor(t, db, binding.ID, "definition-1", "node")
	versionA := contentEntityFor(t, db, binding.ID, "definition-version-a", "definition_version")
	if err := db.Model(&models.MetaDefinition{}).Where("id = ?", definition.RowID).
		Updates(map[string]any{"x_position": 123.5, "y_position": -42.25}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.UserNodeProgress{UserID: 42, NodeID: definition.RowID, NodeType: "definition", Status: "learned", TotalReviews: 9}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.UserDefinitionVersionStats{UserID: 42, DefinitionID: versionA.RowID, SeenCount: 7, CorrectCount: 6}).Error; err != nil {
		t.Fatal(err)
	}

	snapshot.Nodes[1].Name = "Renamed definition"
	snapshot.Nodes[1].Definition.Versions[0].Order = 0
	snapshot.Nodes[1].Definition.Versions[1].Order = 1
	second, err := reconciler.Reconcile(binding.ID, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if second.NoOp {
		t.Fatal("changed snapshot reported as no-op")
	}
	if len(second.Changes) != 1 || second.Changes[0].SourceID != "definition-1" || second.Changes[0].State != "active" {
		t.Fatalf("content update did not produce a focused surgical change: %#v", second.Changes)
	}
	if second.Counts["nodesUpdated"] != 1 || second.Counts["versionsUpdated"] != 2 {
		t.Fatalf("unchanged entities were rewritten: %#v", second.Counts)
	}
	if second.Counts["edgesUpdated"] != 0 || second.Counts["assetsUpdated"] != 0 {
		t.Fatalf("unchanged evidence/assets were rewritten: %#v", second.Counts)
	}

	definitionAfter := contentEntityFor(t, db, binding.ID, "definition-1", "node")
	versionAAfter := contentEntityFor(t, db, binding.ID, "definition-version-a", "definition_version")
	if definition.RowID != definitionAfter.RowID || versionA.RowID != versionAAfter.RowID {
		t.Fatalf("stable provider IDs changed rows: node %d/%d version %d/%d", definition.RowID, definitionAfter.RowID, versionA.RowID, versionAAfter.RowID)
	}
	var progress models.UserNodeProgress
	if err := db.Where("user_id = ? AND node_id = ? AND node_type = ?", 42, definition.RowID, "definition").First(&progress).Error; err != nil {
		t.Fatal(err)
	}
	if progress.Status != "learned" || progress.TotalReviews != 9 {
		t.Fatalf("progress changed: %#v", progress)
	}
	var stats models.UserDefinitionVersionStats
	if err := db.Where("user_id = ? AND definition_id = ?", 42, versionA.RowID).First(&stats).Error; err != nil {
		t.Fatal(err)
	}
	if stats.SeenCount != 7 || stats.CorrectCount != 6 {
		t.Fatalf("version stats changed: %#v", stats)
	}
	var row models.Definition
	if err := db.First(&row, versionA.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if row.DisplayOrder != 1 {
		t.Fatalf("version order not updated in place: %d", row.DisplayOrder)
	}
	var metaRow models.MetaDefinition
	if err := db.First(&metaRow, definition.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if metaRow.XPosition != 123.5 || metaRow.YPosition != -42.25 {
		t.Fatalf("provider sync overwrote local graph layout: %#v", metaRow)
	}

	noOp, err := reconciler.Reconcile(binding.ID, snapshot)
	if err != nil || !noOp.NoOp {
		t.Fatalf("identical snapshot should no-op: %#v %v", noOp, err)
	}
}

func TestContentReconcilerPlacesNewConnectedNodeWithoutMovingExistingLayout(t *testing.T) {
	db := contentReconcilerTestDB(t)
	reconciler, binding, snapshot := contentReconcilerFixture(t, db)
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err != nil {
		t.Fatal(err)
	}
	definition := contentEntityFor(t, db, binding.ID, "definition-1", "node")
	if err := db.Model(&models.MetaDefinition{}).Where("id = ?", definition.RowID).
		Updates(map[string]any{"x_position": 420.0, "y_position": -170.0}).Error; err != nil {
		t.Fatal(err)
	}

	snapshot.Nodes = append(snapshot.Nodes, ContentSnapshotNode{
		SourceID: "definition-2", Type: "definition", Code: "definition.two", Name: "Second definition",
		Location:   ContentSourceLocation{File: "knowledge.org", Line: 40},
		Definition: &ContentDefinitionPayload{Versions: []ContentDefinitionVersion{{SourceID: "definition-version-2", Prompt: "Second prompt"}}},
	})
	snapshot.Edges = append(snapshot.Edges, ContentSnapshotEdge{
		FromSourceID: "definition-1", ToSourceID: "definition-2", Evidence: "link",
		OwnerSourceID: "definition-2", EvidenceKey: "link:definition-2:definition-1:1",
	})
	result, err := reconciler.Reconcile(binding.ID, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Changes) != 2 { // new node plus its existing edge endpoint
		t.Fatalf("expected only relevant node changes, got %#v", result.Changes)
	}
	created := contentEntityFor(t, db, binding.ID, "definition-2", "node")
	var existingRow, createdRow models.MetaDefinition
	if err := db.First(&existingRow, definition.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&createdRow, created.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if existingRow.XPosition != 420 || existingRow.YPosition != -170 {
		t.Fatalf("new-node placement moved existing layout: %#v", existingRow)
	}
	distance := math.Hypot(createdRow.XPosition-existingRow.XPosition, createdRow.YPosition-existingRow.YPosition)
	if distance < 88 || distance > 400 {
		t.Fatalf("new connected node was not placed nearby without overlap: distance=%f row=%#v", distance, createdRow)
	}
}

func TestContentReconcilerPreservesAnkidemyOnlySourceAndQuestFields(t *testing.T) {
	db := contentReconcilerTestDB(t)
	reconciler, binding, snapshot := contentReconcilerFixture(t, db)
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err != nil {
		t.Fatal(err)
	}
	source := contentEntityFor(t, db, binding.ID, "source-1", "node")
	quest := contentEntityFor(t, db, binding.ID, "quest-1", "node")
	bibtex := "knuth1984"
	if err := db.Model(&models.Source{}).Where("id = ?", source.RowID).
		Updates(map[string]any{"visibility": "domain", "bibtex_key": bibtex}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&models.MetaQuest{}).Where("id = ?", quest.RowID).
		Update("visibility", "domain").Error; err != nil {
		t.Fatal(err)
	}
	snapshot.Nodes[0].Source.ContentMD = "Changed Org source body"
	snapshot.Nodes[3].Quest.DescriptionMD = "Changed Org quest body"
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err != nil {
		t.Fatal(err)
	}
	var sourceRow models.Source
	var questRow models.MetaQuest
	if err := db.First(&sourceRow, source.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&questRow, quest.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if sourceRow.Visibility != "domain" || sourceRow.BibtexKey == nil || *sourceRow.BibtexKey != bibtex {
		t.Fatalf("source sync overwrote Ankidemy-only fields: %#v", sourceRow)
	}
	if questRow.Visibility != "domain" {
		t.Fatalf("quest sync overwrote Ankidemy-only visibility: %#v", questRow)
	}
}

func TestContentReconcilerSoftRetiresAndRestoresSameRows(t *testing.T) {
	db := contentReconcilerTestDB(t)
	reconciler, binding, original := contentReconcilerFixture(t, db)
	if _, err := reconciler.Reconcile(binding.ID, original); err != nil {
		t.Fatal(err)
	}
	exercise := contentEntityFor(t, db, binding.ID, "exercise-1", "node")
	version := contentEntityFor(t, db, binding.ID, "exercise-version-1", "exercise_version")

	without := original
	without.Nodes = append([]ContentSnapshotNode(nil), original.Nodes[:2]...)
	without.Nodes = append(without.Nodes, original.Nodes[3:]...)
	without.Edges = nil
	if _, err := reconciler.Reconcile(binding.ID, without); err != nil {
		t.Fatal(err)
	}
	retired := contentEntityFor(t, db, binding.ID, "exercise-1", "node")
	if retired.State != "missing" {
		t.Fatalf("expected missing mapping, got %s", retired.State)
	}
	var deleted models.MetaExercise
	if err := db.Unscoped().First(&deleted, exercise.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if !deleted.DeletedAt.Valid {
		t.Fatal("missing exercise was not soft deleted")
	}

	if _, err := reconciler.Reconcile(binding.ID, original); err != nil {
		t.Fatal(err)
	}
	restored := contentEntityFor(t, db, binding.ID, "exercise-1", "node")
	restoredVersion := contentEntityFor(t, db, binding.ID, "exercise-version-1", "exercise_version")
	if restored.State != "active" || restored.RowID != exercise.RowID || restoredVersion.RowID != version.RowID {
		t.Fatalf("restore did not reuse rows: node %#v version %#v", restored, restoredVersion)
	}
	if err := db.First(&models.MetaExercise{}, exercise.RowID).Error; err != nil {
		t.Fatalf("restored row remains deleted: %v", err)
	}
}

func TestContentReconcilerRejectsWholeInvalidSnapshot(t *testing.T) {
	db := contentReconcilerTestDB(t)
	reconciler, binding, snapshot := contentReconcilerFixture(t, db)
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err != nil {
		t.Fatal(err)
	}

	snapshot.Notebook.Title = "Must not commit"
	snapshot.Nodes[0].Code = "bad code with spaces"
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err == nil {
		t.Fatal("invalid snapshot unexpectedly committed")
	}
	var domain models.Domain
	if err := db.First(&domain, binding.DomainID).Error; err != nil {
		t.Fatal(err)
	}
	if domain.Name != "Technical" {
		t.Fatalf("invalid snapshot changed domain: %q", domain.Name)
	}
	var rejected int64
	if err := db.Model(&models.ContentSyncRun{}).Where("binding_id = ? AND result = 'rejected'", binding.ID).Count(&rejected).Error; err != nil {
		t.Fatal(err)
	}
	if rejected != 1 {
		t.Fatalf("expected one rejected run, got %d", rejected)
	}
}

func TestContentReconcilerMaterializesExternalSourceRelation(t *testing.T) {
	db := contentReconcilerTestDB(t)
	reconciler, binding, snapshot := contentReconcilerFixture(t, db)
	externalUID := "external-domain-uid"
	externalDomain := &models.Domain{Name: "Nested", Privacy: "private", OwnerID: binding.OwnerID, DomainUID: &externalUID}
	if err := db.Create(externalDomain).Error; err != nil {
		t.Fatal(err)
	}
	externalBinding := &models.ContentBinding{Provider: "org-roam", ProviderNotebookID: "notebook-nested", DomainID: externalDomain.ID, OwnerID: binding.OwnerID, Config: []byte(`{}`), SchemaVersion: 1, ProtocolVersion: 1, AuthorizationState: "attached", ConnectionState: "offline"}
	if err := db.Create(externalBinding).Error; err != nil {
		t.Fatal(err)
	}
	externalSource := &models.Source{DomainID: externalDomain.ID, OwnerID: binding.OwnerID, Code: "external.source", Title: "External", Visibility: "private"}
	if err := db.Create(externalSource).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.ContentEntity{BindingID: externalBinding.ID, ProviderEntityID: "external-source", Role: "node", NodeType: "source", TableNameValue: "sources", RowID: externalSource.ID, State: "active", FirstSeenRevision: "r1", LastSeenRevision: "r1"}).Error; err != nil {
		t.Fatal(err)
	}

	snapshot.Edges = append(snapshot.Edges, ContentSnapshotEdge{FromExternalProviderNotebookID: "notebook-nested", FromExternalSourceID: "external-source", ToSourceID: "source-1", Evidence: "link", OwnerSourceID: "source-1", EvidenceKey: "external-source-to-local"})
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err != nil {
		t.Fatal(err)
	}
	var relation models.ExternalNodeRelation
	if err := db.First(&relation).Error; err != nil {
		t.Fatal(err)
	}
	if relation.LocalDirection != "to" || relation.ExternalNodeID != externalSource.ID || relation.ExternalDomainUID != externalUID {
		t.Fatalf("unexpected external relation: %#v", relation)
	}
}

func TestContentReconcilerAllowsSourcePromotionButRejectsReviewableRetype(t *testing.T) {
	db := contentReconcilerTestDB(t)
	reconciler, binding, snapshot := contentReconcilerFixture(t, db)
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err != nil {
		t.Fatal(err)
	}
	sourceMapping := contentEntityFor(t, db, binding.ID, "source-1", "node")

	snapshot.Nodes[0].Type = "definition"
	snapshot.Nodes[0].Source = nil
	snapshot.Nodes[0].Definition = &ContentDefinitionPayload{Versions: []ContentDefinitionVersion{{SourceID: "promoted-version", Order: 0, Prompt: "Promoted prompt"}}}
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err != nil {
		t.Fatalf("source promotion failed: %v", err)
	}
	promoted := contentEntityFor(t, db, binding.ID, "source-1", "node")
	if promoted.ID != sourceMapping.ID || promoted.NodeType != "definition" || promoted.TableNameValue != "meta_definitions" {
		t.Fatalf("promotion did not preserve identity mapping: before=%#v after=%#v", sourceMapping, promoted)
	}
	var oldSource models.Source
	if err := db.Unscoped().First(&oldSource, sourceMapping.RowID).Error; err != nil {
		t.Fatal(err)
	}
	if !oldSource.DeletedAt.Valid {
		t.Fatal("promoted source row was not retired")
	}

	beforeRevision := contentBindingRevision(t, db, binding.ID)
	snapshot.Nodes[0].Type = "exercise"
	snapshot.Nodes[0].Definition = nil
	snapshot.Nodes[0].Exercise = &ContentExercisePayload{Versions: []ContentExerciseVersion{{SourceID: "promoted-version", Order: 0, Statement: "Unsafe", Difficulty: 3}}}
	if _, err := reconciler.Reconcile(binding.ID, snapshot); err == nil {
		t.Fatal("definition-to-exercise retype unexpectedly succeeded")
	}
	after := contentEntityFor(t, db, binding.ID, "source-1", "node")
	if after.NodeType != "definition" || contentBindingRevision(t, db, binding.ID) != beforeRevision {
		t.Fatalf("unsafe retype partially committed: %#v", after)
	}
}

func TestContentReconcileErrorReportsFirstActionableLocation(t *testing.T) {
	err := (&ContentReconcileError{Validation: ContentSnapshotValidation{Diagnostics: []ContentDiagnostic{
		{Severity: "error", Code: "snapshot.incomplete", Message: "an incomplete snapshot cannot be reconciled"},
		{Severity: "error", Code: "property_drawer.misplaced", Message: "Move the property drawer above the node body", Location: ContentSourceLocation{File: "/notebook/topic.org", Line: 17}},
	}}}).Error()
	if err != "Org sync rejected: Move the property drawer above the node body (topic.org:17)" {
		t.Fatalf("unexpected reconcile error: %q", err)
	}
}

func contentBindingRevision(t *testing.T, db *gorm.DB, bindingID uint) string {
	t.Helper()
	var binding models.ContentBinding
	if err := db.First(&binding, bindingID).Error; err != nil {
		t.Fatal(err)
	}
	return binding.LastRevision
}
