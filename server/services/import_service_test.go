package services

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"ankidemy/server/models"
)

func TestNormalizeImportDataUsesMapKeyForDuplicateCodes(t *testing.T) {
	service := &ImportService{}
	data := &ImportData{
		MetaDefinitions: map[string]ImportMetaDefinitionNode{
			"1.6.10": {
				Code:          "1.6.10",
				Name:          "Base concept",
				Prerequisites: []string{"1.6.10_1"},
				Versions: []ImportMetaDefinitionVersion{
					{Prompt: "Explain base concept"},
				},
			},
			"1.6.10_1": {
				Code: "1.6.10",
				Name: "Variant concept",
				Versions: []ImportMetaDefinitionVersion{
					{Prompt: "Explain variant concept"},
				},
			},
		},
	}

	service.NormalizeImportData(data)

	if got := data.MetaDefinitions["1.6.10"].Code; got != "1.6.10" {
		t.Fatalf("expected original code to stay 1.6.10, got %q", got)
	}
	if got := data.MetaDefinitions["1.6.10_1"].Code; got != "1.6.10_1" {
		t.Fatalf("expected duplicate to fall back to map key 1.6.10_1, got %q", got)
	}

	if err := service.ValidateImportData(data); err != nil {
		t.Fatalf("expected normalized import to validate, got error: %v", err)
	}
}

func TestImportPrerequisiteWeightDefaultsToOne(t *testing.T) {
	if got := importPrerequisiteWeight(nil, "A"); got != 1.0 {
		t.Fatalf("expected omitted weight to default to 1.0, got %v", got)
	}
	if got := importPrerequisiteWeight(map[string]float64{"A": 0}, "A"); got != 0.01 {
		t.Fatalf("expected explicit zero to clamp to 0.01, got %v", got)
	}
	if got := importPrerequisiteWeight(map[string]float64{"A": 2}, "A"); got != 1.0 {
		t.Fatalf("expected oversized weight to clamp to 1.0, got %v", got)
	}
}

func TestSamePrerequisiteSetIsOrderIndependentAndRejectsLoss(t *testing.T) {
	first := models.NodePrerequisite{
		NodeID: 2, NodeType: models.NodeTypeDefinition,
		PrerequisiteID: 1, PrerequisiteType: models.NodeTypeDefinition, Weight: 1,
	}
	second := models.NodePrerequisite{
		NodeID: 4, NodeType: models.NodeTypeExercise,
		PrerequisiteID: 2, PrerequisiteType: models.NodeTypeDefinition, Weight: 0.5,
	}
	if !samePrerequisiteSet([]models.NodePrerequisite{first, second}, []models.NodePrerequisite{second, first}) {
		t.Fatal("expected equivalent prerequisite sets to match regardless of row order")
	}
	if samePrerequisiteSet([]models.NodePrerequisite{first}, []models.NodePrerequisite{first, second}) {
		t.Fatal("expected a missing prerequisite to require repair")
	}
	changed := second
	changed.Weight = 0.75
	if samePrerequisiteSet([]models.NodePrerequisite{first, second}, []models.NodePrerequisite{first, changed}) {
		t.Fatal("expected a changed prerequisite weight to require repair")
	}
}

func TestTutorialFixtureRetainsCompleteModernGraph(t *testing.T) {
	raw, err := os.ReadFile("../tutorial.json")
	if err != nil {
		t.Fatal(err)
	}
	var data ImportData
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	service := &ImportService{}
	service.NormalizeImportData(&data)
	if err := service.ValidateImportData(&data); err != nil {
		t.Fatalf("tutorial fixture is not import-compatible: %v", err)
	}
	edges := 0
	for _, node := range data.MetaDefinitions {
		edges += len(node.Prerequisites)
	}
	for _, node := range data.MetaExercises {
		edges += len(node.Prerequisites)
	}
	if edges != 25 {
		t.Fatalf("expected the tutorial's complete 25-edge graph, got %d", edges)
	}
}

func TestNormalizeImportDataLeavesUnresolvableDuplicateForValidation(t *testing.T) {
	service := &ImportService{}
	data := &ImportData{
		MetaDefinitions: map[string]ImportMetaDefinitionNode{
			"A": {
				Code: "X",
				Name: "Node A",
				Versions: []ImportMetaDefinitionVersion{
					{Prompt: "Describe A"},
				},
			},
			"X": {
				Code: "X",
				Name: "Node X",
				Versions: []ImportMetaDefinitionVersion{
					{Prompt: "Describe X"},
				},
			},
		},
	}

	service.NormalizeImportData(data)

	err := service.ValidateImportData(data)
	if err == nil {
		t.Fatal("expected validation error for unresolvable duplicate code, got nil")
	}
	if !strings.Contains(err.Error(), "duplicate code found: X") {
		t.Fatalf("expected duplicate code error for X, got: %v", err)
	}
}

func TestLegacyQuestImportIsReadButOnlyCanonicalVocabularyIsWritten(t *testing.T) {
	raw := []byte(`{
		"metaQuests":{"legacy-q":{"code":"legacy-q","name":"Legacy quest"}},
		"relations":[{"fromType":"meta_quest","fromCode":"legacy-q","toType":"source","toCode":"source-a"}]
	}`)
	var data ImportData
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	if _, ok := data.Quests["legacy-q"]; !ok {
		t.Fatal("expected legacy metaQuests entry to load into canonical quests")
	}

	(&ImportService{}).NormalizeImportData(&data)
	if got := data.Relations[0].FromType; got != "quest" {
		t.Fatalf("expected legacy node type to normalize to quest, got %q", got)
	}

	encoded, err := json.Marshal(&data)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "metaQuest") || strings.Contains(string(encoded), "meta_quest") {
		t.Fatalf("canonical export leaked legacy quest vocabulary: %s", encoded)
	}
	if !strings.Contains(string(encoded), `"quests"`) {
		t.Fatalf("canonical export omitted quests: %s", encoded)
	}
}
