package services

import (
	"encoding/json"
	"testing"
)

func strPtr(v string) *string {
	return &v
}

func TestCollectImportMediaPathsIncludesQuestImages(t *testing.T) {
	data := &ImportData{
		Quests: map[string]ImportQuestNode{
			"Q1": {
				Code: "Q1",
				Versions: []ImportQuestVersion{
					{Title: "v1", ImagePath: strPtr("/media/a.png")},
					{Title: "v2", ImagePath: strPtr("/media/a.png")},
					{Title: "v3", ImagePath: strPtr("   ")},
					{Title: "v4", ImagePath: nil},
				},
			},
		},
	}

	paths := CollectImportMediaPaths(data)
	if len(paths) != 1 {
		t.Fatalf("expected 1 unique path, got %d: %#v", len(paths), paths)
	}
	if paths[0] != "/media/a.png" {
		t.Fatalf("expected /media/a.png, got %q", paths[0])
	}
}

func TestRewriteImportMediaPathsRewritesQuestImages(t *testing.T) {
	taskList := json.RawMessage(`{"items":[]}`)
	data := &ImportData{
		Quests: map[string]ImportQuestNode{
			"Q1": {
				Code: "Q1",
				Versions: []ImportQuestVersion{
					{Title: "v1", DescriptionMd: "hello", TaskList: taskList, ImagePath: strPtr("/media/original.png")},
					{Title: "v2", ImagePath: nil},
				},
			},
		},
	}

	err := RewriteImportMediaPaths(data, func(path string) (string, error) {
		return "/imported" + path, nil
	})
	if err != nil {
		t.Fatalf("unexpected rewrite error: %v", err)
	}

	v1 := data.Quests["Q1"].Versions[0]
	if v1.ImagePath == nil {
		t.Fatal("expected rewritten image path, got nil")
	}
	if *v1.ImagePath != "/imported/media/original.png" {
		t.Fatalf("unexpected rewritten path: %q", *v1.ImagePath)
	}

	v2 := data.Quests["Q1"].Versions[1]
	if v2.ImagePath != nil {
		t.Fatalf("expected nil image path to stay nil, got %q", *v2.ImagePath)
	}
}

func TestCollectBackupMediaPathsIncludesUserStateQuestImages(t *testing.T) {
	backup := &DomainBackup{
		Data: ImportData{
			MetaDefinitions: map[string]ImportMetaDefinitionNode{
				"D1": {
					Code: "D1",
					Versions: []ImportMetaDefinitionVersion{
						{PromptImagePath: "/media/domain.png"},
					},
				},
			},
		},
		UserState: &DomainUserStateBackup{
			PrivateQuests: map[string]ImportQuestNode{
				"Q1": {
					Code: "Q1",
					Versions: []ImportQuestVersion{
						{Title: "v1", ImagePath: strPtr("/media/private.png")},
						{Title: "v2", ImagePath: strPtr("/media/private.png")},
					},
				},
			},
		},
	}

	paths := CollectBackupMediaPaths(backup)
	if len(paths) != 2 {
		t.Fatalf("expected 2 unique media paths, got %d: %#v", len(paths), paths)
	}
}

func TestRewriteBackupMediaPathsRewritesUserStateQuestImages(t *testing.T) {
	taskList := json.RawMessage(`{"items":[]}`)
	backup := &DomainBackup{
		Data: ImportData{},
		UserState: &DomainUserStateBackup{
			PrivateQuests: map[string]ImportQuestNode{
				"Q1": {
					Code: "Q1",
					Versions: []ImportQuestVersion{
						{Title: "v1", TaskList: taskList, ImagePath: strPtr("/media/private.png")},
					},
				},
			},
		},
	}

	err := RewriteBackupMediaPaths(backup, func(path string) (string, error) {
		return "/restored" + path, nil
	})
	if err != nil {
		t.Fatalf("unexpected rewrite error: %v", err)
	}

	version := backup.UserState.PrivateQuests["Q1"].Versions[0]
	if version.ImagePath == nil || *version.ImagePath != "/restored/media/private.png" {
		t.Fatalf("unexpected rewritten private quest path: %#v", version.ImagePath)
	}
}
