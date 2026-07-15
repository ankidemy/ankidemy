package services

import (
	"encoding/json"
	"strings"
	"testing"
)

func validContentSnapshot() ContentSnapshot {
	return ContentSnapshot{
		ProtocolVersion: ContentSnapshotProtocolVersion,
		Provider:        "org-roam",
		Complete:        true,
		Notebook: ContentSnapshotNotebook{
			ProviderNotebookID: "notebook-technical",
			Schema:             1,
			Title:              "Technical",
			Root:               "/home/user/braindump/technical",
		},
		Nodes: []ContentSnapshotNode{
			{
				SourceID: "source-1", Type: "source", Code: "source.one", Name: "Source",
				Location: ContentSourceLocation{File: "source.org", Line: 1},
				Source:   &ContentSourcePayload{ContentMD: "Inline $x^2$ and ![plot](/api/media/plot.png)."},
			},
			{
				SourceID: "definition-1", Type: "definition", Code: "definition.one", Name: "Definition",
				Location: ContentSourceLocation{File: "knowledge.org", Line: 3},
				Definition: &ContentDefinitionPayload{Versions: []ContentDefinitionVersion{
					{SourceID: "definition-version-b", Order: 1, Prompt: "Second"},
					{SourceID: "definition-version-a", Order: 0, Prompt: "First", DescriptionMD: "$$x^2$$"},
				}},
			},
			{
				SourceID: "exercise-1", Type: "exercise", Code: "exercise.one", Name: "Exercise",
				Location: ContentSourceLocation{File: "knowledge.org", Line: 20},
				Exercise: &ContentExercisePayload{Versions: []ContentExerciseVersion{
					{SourceID: "exercise-version-1", Order: 0, Statement: "Compute x", Difficulty: 3, Verifiable: true, SolutionMD: "1"},
				}},
			},
			{
				SourceID: "quest-1", Type: "quest", Code: "quest.one", Name: "One time",
				Location: ContentSourceLocation{File: "quests.org", Line: 2},
				Quest:    &ContentQuestPayload{Kind: "todo", Schedule: json.RawMessage(`{"type":"rrule","timezone":"America/Mexico_City","dtstart":"2026-07-15T09:00:00-06:00","rrule":"FREQ=DAILY;COUNT=1"}`)},
			},
		},
		Edges: []ContentSnapshotEdge{
			{FromSourceID: "definition-1", ToSourceID: "exercise-1", Evidence: "link", OwnerSourceID: "exercise-1", EvidenceKey: "link:exercise-1:definition-1:1"},
		},
		Assets: []ContentSnapshotAsset{
			{ID: "sha256:" + strings.Repeat("a", 64), OwnerSourceID: "source-1", OwnerRole: "node", OwnerField: "contentMd", SourceLocator: "images/plot.png", MIME: "image/png", ByteSize: 42, Width: 10, Height: 10, MediaURL: "/api/media/1/private/plot.png"},
		},
		ExternalNotebooks: []ContentExternalNotebook{
			{ProviderNotebookID: "notebook-nested", RelativeRoot: "research"},
		},
	}
}

func diagnosticCodes(items []ContentDiagnostic) map[string]bool {
	out := make(map[string]bool, len(items))
	for _, item := range items {
		out[item.Code] = true
	}
	return out
}

func TestValidateContentSnapshotAcceptsProviderNeutralSnapshot(t *testing.T) {
	snapshot := validContentSnapshot()
	validation := ValidateContentSnapshot(snapshot)
	if !validation.Reconciliable {
		t.Fatalf("expected valid snapshot, got diagnostics: %#v", validation.Diagnostics)
	}
	if !sha256Pattern.MatchString(validation.Revision) {
		t.Fatalf("unexpected canonical revision %q", validation.Revision)
	}

	snapshot.Revision = validation.Revision
	again := ValidateContentSnapshot(snapshot)
	if !again.Reconciliable || again.Revision != validation.Revision {
		t.Fatalf("declared canonical revision should validate: %#v", again)
	}
}

func TestCanonicalContentRevisionIgnoresRootDiagnosticsAndInputOrder(t *testing.T) {
	first := validContentSnapshot()
	firstRevision, err := CanonicalContentRevision(first)
	if err != nil {
		t.Fatal(err)
	}

	second := validContentSnapshot()
	second.Notebook.Root = "/moved/notebook"
	second.Assets[0].MediaURL = "/api/media/another-owner/private/domain/plot.png"
	second.Diagnostics = []ContentDiagnostic{{Severity: "warning", Code: "test.warning", Message: "ignored"}}
	second.Nodes[0], second.Nodes[3] = second.Nodes[3], second.Nodes[0]
	versions := second.Nodes[1].Definition.Versions
	versions[0], versions[1] = versions[1], versions[0]
	secondRevision, err := CanonicalContentRevision(second)
	if err != nil {
		t.Fatal(err)
	}
	if firstRevision != secondRevision {
		t.Fatalf("semantic-equivalent snapshots differ: %s != %s", firstRevision, secondRevision)
	}
}

func TestValidateContentSnapshotRejectsDuplicateIdentityAndCycle(t *testing.T) {
	snapshot := validContentSnapshot()
	snapshot.Nodes[2].Exercise.Versions[0].SourceID = "definition-version-a"
	snapshot.Edges = append(snapshot.Edges, ContentSnapshotEdge{
		FromSourceID: "exercise-1", ToSourceID: "definition-1", Evidence: "link",
		OwnerSourceID: "definition-1", EvidenceKey: "cycle-back",
	})
	validation := ValidateContentSnapshot(snapshot)
	codes := diagnosticCodes(validation.Diagnostics)
	if validation.Reconciliable || !codes["id.duplicate"] || !codes["graph.cycle"] || !codes["link.invalid_type"] {
		t.Fatalf("expected duplicate/cycle/type errors, got %#v", validation.Diagnostics)
	}
}

func TestValidateContentSnapshotEnforcesQuestKinds(t *testing.T) {
	for _, test := range []struct {
		name     string
		kind     string
		schedule string
		mode     string
		valid    bool
	}{
		{name: "one time", kind: "todo", schedule: `{"type":"rrule","rrule":"FREQ=DAILY;COUNT=1"}`, valid: true},
		{name: "daily", kind: "daily", schedule: `{"type":"daily_pool"}`, mode: "+", valid: true},
		{name: "habit", kind: "habit", schedule: `{"type":"habit","rrule":"FREQ=WEEKLY"}`, mode: ".+", valid: true},
		{name: "daily is not habit", kind: "habit", schedule: `{"type":"daily_pool"}`, mode: "+", valid: false},
		{name: "todo repeats", kind: "todo", schedule: `{"type":"rrule","rrule":"FREQ=WEEKLY"}`, valid: false},
		{name: "bad repeater", kind: "habit", schedule: `{"type":"habit","rrule":"FREQ=WEEKLY"}`, mode: "*", valid: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot := validContentSnapshot()
			snapshot.Nodes[3].Quest.Kind = test.kind
			snapshot.Nodes[3].Quest.Schedule = json.RawMessage(test.schedule)
			snapshot.Nodes[3].Quest.OrgRepeaterMode = test.mode
			validation := ValidateContentSnapshot(snapshot)
			if validation.Reconciliable != test.valid {
				t.Fatalf("valid=%v diagnostics=%#v", test.valid, validation.Diagnostics)
			}
		})
	}
}

func TestValidateContentSnapshotPreservesMalformedFileLocation(t *testing.T) {
	snapshot := validContentSnapshot()
	snapshot.Complete = false
	snapshot.Diagnostics = []ContentDiagnostic{{
		Severity: "error", Code: "file.parse_failed", Message: "unclosed property drawer",
		Location: ContentSourceLocation{File: "broken.org", Line: 14, Column: 1}, SourceID: "broken-node",
	}}
	validation := ValidateContentSnapshot(snapshot)
	if validation.Reconciliable {
		t.Fatal("incomplete malformed snapshot must not reconcile")
	}
	if got := validation.Diagnostics[0]; got.Location.File != "broken.org" || got.Location.Line != 14 || got.SourceID != "broken-node" {
		t.Fatalf("adapter diagnostic lost actionable location: %#v", got)
	}
}

func TestValidateContentSnapshotRequiresUploadedAssetAndKnownPlaceholder(t *testing.T) {
	snapshot := validContentSnapshot()
	snapshot.Assets[0].MediaURL = ""
	snapshot.Nodes[0].Source.ContentMD = "![missing](asset:sha256:" + strings.Repeat("b", 64) + ")"
	validation := ValidateContentSnapshot(snapshot)
	codes := diagnosticCodes(validation.Diagnostics)
	if validation.Reconciliable || !codes["media.upload_failed"] || !codes["media.unresolved"] {
		t.Fatalf("expected upload and unresolved errors, got %#v", validation.Diagnostics)
	}
}

func TestValidateContentSnapshotRejectsDuplicateNestedManifest(t *testing.T) {
	snapshot := validContentSnapshot()
	snapshot.ExternalNotebooks = append(snapshot.ExternalNotebooks,
		ContentExternalNotebook{ProviderNotebookID: "notebook-nested", RelativeRoot: "other-copy"})
	validation := ValidateContentSnapshot(snapshot)
	if !diagnosticCodes(validation.Diagnostics)["manifest.duplicate_id"] || validation.Reconciliable {
		t.Fatalf("expected duplicate nested manifest failure: %#v", validation.Diagnostics)
	}
}

func TestValidateContentSnapshotAcceptsExternalFromEndpoint(t *testing.T) {
	snapshot := validContentSnapshot()
	snapshot.Edges = append(snapshot.Edges, ContentSnapshotEdge{
		FromExternalProviderNotebookID: "notebook-nested",
		FromExternalSourceID:           "external-definition",
		ToSourceID:                     "exercise-1",
		Evidence:                       "link",
		OwnerSourceID:                  "exercise-1",
		EvidenceKey:                    "external-link:external-definition:exercise-1",
	})
	validation := ValidateContentSnapshot(snapshot)
	if !validation.Reconciliable {
		t.Fatalf("external-from edge should validate: %#v", validation.Diagnostics)
	}

	snapshot.Edges[len(snapshot.Edges)-1].FromSourceID = "definition-1"
	validation = ValidateContentSnapshot(snapshot)
	if validation.Reconciliable || !diagnosticCodes(validation.Diagnostics)["link.external_invalid"] {
		t.Fatalf("mixed local/external endpoint should fail: %#v", validation.Diagnostics)
	}
}
