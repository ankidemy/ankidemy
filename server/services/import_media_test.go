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
		MetaQuests: map[string]ImportMetaQuestNode{
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
		MetaQuests: map[string]ImportMetaQuestNode{
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

	v1 := data.MetaQuests["Q1"].Versions[0]
	if v1.ImagePath == nil {
		t.Fatal("expected rewritten image path, got nil")
	}
	if *v1.ImagePath != "/imported/media/original.png" {
		t.Fatalf("unexpected rewritten path: %q", *v1.ImagePath)
	}

	v2 := data.MetaQuests["Q1"].Versions[1]
	if v2.ImagePath != nil {
		t.Fatalf("expected nil image path to stay nil, got %q", *v2.ImagePath)
	}
}
