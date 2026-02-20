package services

import (
	"strings"
	"testing"
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
