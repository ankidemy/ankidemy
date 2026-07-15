package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

const ContentSnapshotProtocolVersion = 1

var (
	contentCodePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$`)
	sha256Pattern      = regexp.MustCompile(`^sha256:([a-f0-9]{64})$`)
	assetPlaceholder   = regexp.MustCompile(`asset:(sha256:[a-f0-9]{64})`)
)

// ContentSnapshot is the provider-neutral semantic boundary used by live
// import. Adapters parse their native format and emit these records; they never
// expose a provider AST or Ankidemy database IDs.
type ContentSnapshot struct {
	ProtocolVersion   int                       `json:"protocolVersion"`
	Provider          string                    `json:"provider"`
	Complete          bool                      `json:"complete"`
	Notebook          ContentSnapshotNotebook   `json:"notebook"`
	Revision          string                    `json:"revision"`
	Nodes             []ContentSnapshotNode     `json:"nodes"`
	Edges             []ContentSnapshotEdge     `json:"edges"`
	Assets            []ContentSnapshotAsset    `json:"assets"`
	ExternalNotebooks []ContentExternalNotebook `json:"externalNotebooks"`
	Diagnostics       []ContentDiagnostic       `json:"diagnostics"`
}

type ContentSnapshotNotebook struct {
	ProviderNotebookID string `json:"providerNotebookId"`
	Schema             int    `json:"schema"`
	Title              string `json:"title"`
	Root               string `json:"root"`
}

type ContentSourceLocation struct {
	File    string `json:"file,omitempty"`
	Line    int    `json:"line,omitempty"`
	Column  int    `json:"column,omitempty"`
	Outline string `json:"outline,omitempty"`
}

type ContentSnapshotNode struct {
	SourceID   string                    `json:"sourceId"`
	Type       string                    `json:"type"`
	Code       string                    `json:"code"`
	Name       string                    `json:"name"`
	Location   ContentSourceLocation     `json:"location"`
	Source     *ContentSourcePayload     `json:"source,omitempty"`
	Definition *ContentDefinitionPayload `json:"definition,omitempty"`
	Exercise   *ContentExercisePayload   `json:"exercise,omitempty"`
	Quest      *ContentQuestPayload      `json:"quest,omitempty"`
}

type ContentSourcePayload struct {
	ContentMD string `json:"contentMd"`
}

type ContentDefinitionPayload struct {
	Versions []ContentDefinitionVersion `json:"versions"`
}

type ContentDefinitionVersion struct {
	SourceID      string   `json:"sourceId"`
	Order         int      `json:"order"`
	Prompt        string   `json:"prompt"`
	DescriptionMD string   `json:"descriptionMd"`
	NotesMD       string   `json:"notesMd"`
	ReferencesMD  []string `json:"referencesMd"`
}

type ContentExercisePayload struct {
	Versions []ContentExerciseVersion `json:"versions"`
}

type ContentExerciseVersion struct {
	SourceID      string `json:"sourceId"`
	Order         int    `json:"order"`
	Statement     string `json:"statement"`
	DescriptionMD string `json:"descriptionMd"`
	HintsMD       string `json:"hintsMd"`
	SolutionMD    string `json:"solutionMd"`
	NotesMD       string `json:"notesMd"`
	Difficulty    int    `json:"difficulty"`
	Verifiable    bool   `json:"verifiable"`
}

type ContentQuestPayload struct {
	Kind            string          `json:"kind"`
	Schedule        json.RawMessage `json:"schedule"`
	OrgRepeaterMode string          `json:"orgRepeaterMode,omitempty"`
	DescriptionMD   string          `json:"descriptionMd"`
	TaskList        json.RawMessage `json:"taskList,omitempty"`
}

type ContentSnapshotEdge struct {
	FromSourceID                   string `json:"fromSourceId,omitempty"`
	FromExternalProviderNotebookID string `json:"fromExternalProviderNotebookId,omitempty"`
	FromExternalSourceID           string `json:"fromExternalSourceId,omitempty"`
	ToSourceID                     string `json:"toSourceId,omitempty"`
	ToExternalProviderNotebookID   string `json:"toExternalProviderNotebookId,omitempty"`
	ToExternalSourceID             string `json:"toExternalSourceId,omitempty"`
	Evidence                       string `json:"evidence"`
	OwnerSourceID                  string `json:"ownerSourceId"`
	EvidenceKey                    string `json:"evidenceKey"`
}

type ContentSnapshotAsset struct {
	ID            string `json:"id"`
	OwnerSourceID string `json:"ownerSourceId"`
	OwnerRole     string `json:"ownerRole"`
	OwnerField    string `json:"ownerField"`
	SourceLocator string `json:"sourceLocator"`
	MIME          string `json:"mime"`
	ByteSize      int64  `json:"byteSize"`
	Width         int    `json:"width,omitempty"`
	Height        int    `json:"height,omitempty"`
	MediaURL      string `json:"mediaUrl"`
}

type ContentExternalNotebook struct {
	ProviderNotebookID string `json:"providerNotebookId"`
	RelativeRoot       string `json:"relativeRoot"`
}

type ContentDiagnostic struct {
	Severity         string                `json:"severity"`
	Code             string                `json:"code"`
	Message          string                `json:"message"`
	Location         ContentSourceLocation `json:"location,omitempty"`
	SourceID         string                `json:"sourceId,omitempty"`
	RelatedSourceIDs []string              `json:"relatedSourceIds,omitempty"`
}

type ContentSnapshotValidation struct {
	Revision      string              `json:"revision"`
	Reconciliable bool                `json:"reconciliable"`
	Diagnostics   []ContentDiagnostic `json:"diagnostics"`
}

func contentError(code, message, sourceID string, location ContentSourceLocation) ContentDiagnostic {
	return ContentDiagnostic{
		Severity: "error",
		Code:     code,
		Message:  message,
		SourceID: sourceID,
		Location: location,
	}
}

// ValidateContentSnapshot independently checks adapter output before any
// mutation transaction begins. Existing adapter diagnostics are preserved.
func ValidateContentSnapshot(snapshot ContentSnapshot) ContentSnapshotValidation {
	diagnostics := append([]ContentDiagnostic(nil), snapshot.Diagnostics...)
	add := func(d ContentDiagnostic) { diagnostics = append(diagnostics, d) }

	if snapshot.ProtocolVersion != ContentSnapshotProtocolVersion {
		add(contentError("protocol.unsupported", fmt.Sprintf("protocolVersion must be %d", ContentSnapshotProtocolVersion), "", ContentSourceLocation{}))
	}
	if strings.TrimSpace(snapshot.Provider) == "" {
		add(contentError("provider.missing", "provider is required", "", ContentSourceLocation{}))
	}
	if strings.TrimSpace(snapshot.Notebook.ProviderNotebookID) == "" || snapshot.Notebook.Schema < 1 || strings.TrimSpace(snapshot.Notebook.Title) == "" {
		add(contentError("manifest.invalid", "notebook ID, schema, and title are required", "", ContentSourceLocation{}))
	}
	if !snapshot.Complete {
		add(contentError("snapshot.incomplete", "an incomplete snapshot cannot be reconciled", "", ContentSourceLocation{}))
	}

	nodes := make(map[string]ContentSnapshotNode, len(snapshot.Nodes))
	allIDs := make(map[string]string, len(snapshot.Nodes))
	codes := make(map[string]string, len(snapshot.Nodes))
	for _, node := range snapshot.Nodes {
		id := strings.TrimSpace(node.SourceID)
		if id == "" {
			add(contentError("id.missing", "node sourceId is required", "", node.Location))
			continue
		}
		if previous, exists := allIDs[id]; exists {
			add(contentError("id.duplicate", fmt.Sprintf("sourceId %q is already used by %s", id, previous), id, node.Location))
			continue
		}
		allIDs[id] = "node"
		nodes[id] = node
		if !contentCodePattern.MatchString(node.Code) {
			add(contentError("code.invalid", fmt.Sprintf("invalid code %q", node.Code), id, node.Location))
		} else if previous, exists := codes[node.Code]; exists {
			add(contentError("code.duplicate", fmt.Sprintf("code %q is also used by %s", node.Code, previous), id, node.Location))
		} else {
			codes[node.Code] = id
		}
		if strings.TrimSpace(node.Name) == "" {
			add(contentError("node.name_missing", "node name is required", id, node.Location))
		}
		payloadCount := 0
		if node.Source != nil {
			payloadCount++
		}
		if node.Definition != nil {
			payloadCount++
		}
		if node.Exercise != nil {
			payloadCount++
		}
		if node.Quest != nil {
			payloadCount++
		}
		if payloadCount != 1 || (node.Type == "source") != (node.Source != nil) || (node.Type == "definition") != (node.Definition != nil) || (node.Type == "exercise") != (node.Exercise != nil) || (node.Type == "quest") != (node.Quest != nil) {
			add(contentError("type.payload_mismatch", "node must contain exactly the payload matching its type", id, node.Location))
			continue
		}
		switch node.Type {
		case "definition":
			if len(node.Definition.Versions) == 0 {
				add(contentError("version.missing", "definition requires at least one version", id, node.Location))
			}
			for _, version := range node.Definition.Versions {
				validateContentVersionID(version.SourceID, id, "definition_version", node.Location, allIDs, add)
				if strings.TrimSpace(version.Prompt) == "" {
					add(contentError("version.prompt_missing", "definition version prompt is required", version.SourceID, node.Location))
				}
			}
		case "exercise":
			if len(node.Exercise.Versions) == 0 {
				add(contentError("version.missing", "exercise requires at least one version", id, node.Location))
			}
			for _, version := range node.Exercise.Versions {
				validateContentVersionID(version.SourceID, id, "exercise_version", node.Location, allIDs, add)
				if strings.TrimSpace(version.Statement) == "" {
					add(contentError("version.statement_missing", "exercise version statement is required", version.SourceID, node.Location))
				}
				if version.Difficulty < 1 || version.Difficulty > 7 {
					add(contentError("field.invalid_value", "exercise difficulty must be between 1 and 7", version.SourceID, node.Location))
				}
				if version.Verifiable && strings.TrimSpace(version.SolutionMD) == "" {
					add(contentError("exercise.solution_required", "verifiable exercise requires a solution", version.SourceID, node.Location))
				}
			}
		case "quest":
			validateContentQuest(node, add)
		case "source":
		default:
			add(contentError("type.invalid", fmt.Sprintf("unsupported node type %q", node.Type), id, node.Location))
		}
	}

	validateContentExternalNotebooks(snapshot.ExternalNotebooks, add)
	validateContentEdges(snapshot.Edges, nodes, add)
	validateContentAssets(snapshot, nodes, allIDs, add)
	validateContentGraphCycles(snapshot.Edges, nodes, add)

	revision, err := CanonicalContentRevision(snapshot)
	if err != nil {
		add(contentError("snapshot.hash_failed", err.Error(), "", ContentSourceLocation{}))
	} else if snapshot.Revision != "" && snapshot.Revision != revision {
		add(contentError("snapshot.revision_mismatch", fmt.Sprintf("declared revision %s does not match %s", snapshot.Revision, revision), "", ContentSourceLocation{}))
	}

	reconciliable := snapshot.Complete
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == "error" {
			reconciliable = false
			break
		}
	}
	return ContentSnapshotValidation{Revision: revision, Reconciliable: reconciliable, Diagnostics: diagnostics}
}

func validateContentVersionID(id, owner, role string, location ContentSourceLocation, allIDs map[string]string, add func(ContentDiagnostic)) {
	id = strings.TrimSpace(id)
	if id == "" {
		add(contentError("version.id_missing", fmt.Sprintf("%s for %s has no sourceId", role, owner), owner, location))
		return
	}
	if previous, exists := allIDs[id]; exists {
		add(contentError("id.duplicate", fmt.Sprintf("version sourceId %q is already used by %s", id, previous), id, location))
		return
	}
	allIDs[id] = role
}

func validateContentQuest(node ContentSnapshotNode, add func(ContentDiagnostic)) {
	quest := node.Quest
	if quest == nil {
		return
	}
	var schedule struct {
		Type  string `json:"type"`
		RRule string `json:"rrule"`
	}
	if len(quest.Schedule) == 0 || json.Unmarshal(quest.Schedule, &schedule) != nil || schedule.Type == "" {
		add(contentError("quest.schedule_missing", "quest requires a valid schedule", node.SourceID, node.Location))
		return
	}
	expectedType := map[string]string{"todo": "rrule", "daily": "daily_pool", "habit": "habit"}[quest.Kind]
	if expectedType == "" {
		add(contentError("quest.kind_invalid", fmt.Sprintf("unsupported quest kind %q", quest.Kind), node.SourceID, node.Location))
		return
	}
	if schedule.Type != expectedType {
		add(contentError("quest.schedule_kind_mismatch", fmt.Sprintf("%s quest requires %s schedule", quest.Kind, expectedType), node.SourceID, node.Location))
	}
	if quest.Kind == "todo" && !strings.Contains(strings.ToUpper(schedule.RRule), "COUNT=1") {
		add(contentError("quest.schedule_kind_mismatch", "one-time todo RRULE must contain COUNT=1", node.SourceID, node.Location))
	}
	if quest.OrgRepeaterMode != "" && quest.OrgRepeaterMode != "+" && quest.OrgRepeaterMode != "++" && quest.OrgRepeaterMode != ".+" {
		add(contentError("quest.repeater_invalid", fmt.Sprintf("invalid Org repeater mode %q", quest.OrgRepeaterMode), node.SourceID, node.Location))
	}
}

func validateContentExternalNotebooks(items []ContentExternalNotebook, add func(ContentDiagnostic)) {
	seen := map[string]string{}
	for _, item := range items {
		if item.ProviderNotebookID == "" || item.RelativeRoot == "" {
			add(contentError("manifest.nested_invalid", "nested notebook needs providerNotebookId and relativeRoot", "", ContentSourceLocation{File: item.RelativeRoot}))
			continue
		}
		if previous, ok := seen[item.ProviderNotebookID]; ok && previous != item.RelativeRoot {
			add(contentError("manifest.duplicate_id", fmt.Sprintf("nested notebook %s appears at %s and %s", item.ProviderNotebookID, previous, item.RelativeRoot), "", ContentSourceLocation{File: item.RelativeRoot}))
		} else {
			seen[item.ProviderNotebookID] = item.RelativeRoot
		}
	}
}

func validateContentEdges(edges []ContentSnapshotEdge, nodes map[string]ContentSnapshotNode, add func(ContentDiagnostic)) {
	keys := map[string]bool{}
	for _, edge := range edges {
		location := ContentSourceLocation{}
		if owner, ok := nodes[edge.OwnerSourceID]; ok {
			location = owner.Location
		}
		if edge.EvidenceKey == "" || keys[edge.EvidenceKey] {
			add(contentError("edge.evidence_invalid", "edge evidenceKey must be present and unique", edge.OwnerSourceID, location))
		} else {
			keys[edge.EvidenceKey] = true
		}
		if edge.Evidence != "hierarchy" && edge.Evidence != "link" {
			add(contentError("edge.evidence_invalid", fmt.Sprintf("unsupported evidence %q", edge.Evidence), edge.OwnerSourceID, location))
		}
		fromExternal := edge.FromExternalProviderNotebookID != "" || edge.FromExternalSourceID != ""
		toExternal := edge.ToExternalProviderNotebookID != "" || edge.ToExternalSourceID != ""
		from, fromOK := nodes[edge.FromSourceID]
		if fromExternal {
			fromOK = edge.FromSourceID == "" && edge.FromExternalProviderNotebookID != "" && edge.FromExternalSourceID != ""
			if !fromOK {
				add(contentError("link.external_invalid", "external from endpoint requires notebook/source IDs and no local fromSourceId", edge.OwnerSourceID, location))
			}
		} else if !fromOK {
			add(contentError("link.unresolved", fmt.Sprintf("fromSourceId %q is not in the snapshot", edge.FromSourceID), edge.OwnerSourceID, location))
		}
		if toExternal {
			if edge.ToSourceID != "" || edge.ToExternalProviderNotebookID == "" || edge.ToExternalSourceID == "" {
				add(contentError("link.external_invalid", "external to endpoint requires notebook/source IDs and no local toSourceId", edge.OwnerSourceID, location))
			}
			if fromExternal {
				add(contentError("link.external_invalid", "an edge cannot have two external endpoints", edge.OwnerSourceID, location))
			}
			continue
		}
		to, toOK := nodes[edge.ToSourceID]
		if !toOK {
			add(contentError("link.unresolved", fmt.Sprintf("toSourceId %q is not in the snapshot", edge.ToSourceID), edge.OwnerSourceID, location))
			continue
		}
		if !fromExternal && fromOK && from.Type == "exercise" && to.Type == "definition" {
			add(contentError("link.invalid_type", "exercise cannot be a prerequisite of a definition", edge.OwnerSourceID, location))
		}
	}
}

func validateContentAssets(snapshot ContentSnapshot, nodes map[string]ContentSnapshotNode, allIDs map[string]string, add func(ContentDiagnostic)) {
	assets := map[string]ContentSnapshotAsset{}
	for _, asset := range snapshot.Assets {
		if !sha256Pattern.MatchString(asset.ID) {
			add(contentError("media.unsupported", fmt.Sprintf("invalid content asset ID %q", asset.ID), asset.OwnerSourceID, ContentSourceLocation{File: asset.SourceLocator}))
			continue
		}
		key := asset.OwnerSourceID + "\x00" + asset.OwnerRole + "\x00" + asset.OwnerField + "\x00" + asset.ID
		if _, duplicate := assets[key]; duplicate {
			add(contentError("media.duplicate", "duplicate asset ownership record", asset.OwnerSourceID, ContentSourceLocation{File: asset.SourceLocator}))
		}
		assets[key] = asset
		if _, exists := allIDs[asset.OwnerSourceID]; !exists {
			add(contentError("media.owner_missing", "asset owner is not a node/version in this snapshot", asset.OwnerSourceID, ContentSourceLocation{File: asset.SourceLocator}))
		}
		if !strings.HasPrefix(asset.MIME, "image/") || asset.ByteSize <= 0 {
			add(contentError("media.unsupported", "asset must be a non-empty image", asset.OwnerSourceID, ContentSourceLocation{File: asset.SourceLocator}))
		}
		if strings.TrimSpace(asset.MediaURL) == "" {
			add(contentError("media.upload_failed", "asset has not been uploaded/re-written", asset.OwnerSourceID, ContentSourceLocation{File: asset.SourceLocator}))
		}
	}

	knownHashes := map[string]bool{}
	for _, asset := range snapshot.Assets {
		knownHashes[asset.ID] = true
	}
	for _, node := range snapshot.Nodes {
		for _, markdown := range contentMarkdownFields(node) {
			for _, match := range assetPlaceholder.FindAllStringSubmatch(markdown, -1) {
				if !knownHashes[match[1]] {
					add(contentError("media.unresolved", fmt.Sprintf("no asset record for %s", match[1]), node.SourceID, node.Location))
				}
			}
		}
	}
	_ = nodes
}

func contentMarkdownFields(node ContentSnapshotNode) []string {
	var fields []string
	if node.Source != nil {
		fields = append(fields, node.Source.ContentMD)
	}
	if node.Definition != nil {
		for _, v := range node.Definition.Versions {
			fields = append(fields, v.DescriptionMD, v.NotesMD)
			fields = append(fields, v.ReferencesMD...)
		}
	}
	if node.Exercise != nil {
		for _, v := range node.Exercise.Versions {
			fields = append(fields, v.DescriptionMD, v.HintsMD, v.SolutionMD, v.NotesMD)
		}
	}
	if node.Quest != nil {
		fields = append(fields, node.Quest.DescriptionMD)
	}
	return fields
}

func validateContentGraphCycles(edges []ContentSnapshotEdge, nodes map[string]ContentSnapshotNode, add func(ContentDiagnostic)) {
	adjacency := map[string][]string{}
	for _, edge := range edges {
		if edge.FromExternalProviderNotebookID != "" || edge.ToExternalProviderNotebookID != "" {
			continue
		}
		from, fromOK := nodes[edge.FromSourceID]
		to, toOK := nodes[edge.ToSourceID]
		if !fromOK || !toOK {
			continue
		}
		if (from.Type == "definition" || from.Type == "exercise") && (to.Type == "definition" || to.Type == "exercise") {
			adjacency[edge.FromSourceID] = append(adjacency[edge.FromSourceID], edge.ToSourceID)
		}
	}
	state := map[string]uint8{}
	stack := []string{}
	var visit func(string) bool
	visit = func(id string) bool {
		state[id] = 1
		stack = append(stack, id)
		for _, next := range adjacency[id] {
			if state[next] == 1 {
				cycle := append([]string(nil), stack...)
				cycle = append(cycle, next)
				add(ContentDiagnostic{Severity: "error", Code: "graph.cycle", Message: "managed prerequisite graph contains a cycle", SourceID: id, RelatedSourceIDs: cycle})
				return true
			}
			if state[next] == 0 && visit(next) {
				return true
			}
		}
		stack = stack[:len(stack)-1]
		state[id] = 2
		return false
	}
	for id := range adjacency {
		if state[id] == 0 && visit(id) {
			return
		}
	}
}

// CanonicalContentRevision hashes semantic records independent of diagnostics,
// absolute notebook location, input ordering, and version display ordering.
func CanonicalContentRevision(snapshot ContentSnapshot) (string, error) {
	canonical := snapshot
	canonical.Revision = ""
	canonical.Diagnostics = nil
	canonical.Notebook.Root = ""
	canonical.Nodes = append([]ContentSnapshotNode(nil), snapshot.Nodes...)
	canonical.Edges = append([]ContentSnapshotEdge(nil), snapshot.Edges...)
	canonical.Assets = append([]ContentSnapshotAsset(nil), snapshot.Assets...)
	for i := range canonical.Assets {
		// Storage URLs are deployment/owner-specific delivery metadata. The
		// content ID and ownership fields carry the portable semantics.
		canonical.Assets[i].MediaURL = ""
	}
	canonical.ExternalNotebooks = append([]ContentExternalNotebook(nil), snapshot.ExternalNotebooks...)
	for i := range canonical.Nodes {
		if canonical.Nodes[i].Definition != nil {
			payload := *canonical.Nodes[i].Definition
			payload.Versions = append([]ContentDefinitionVersion(nil), payload.Versions...)
			sort.Slice(payload.Versions, func(a, b int) bool { return payload.Versions[a].SourceID < payload.Versions[b].SourceID })
			canonical.Nodes[i].Definition = &payload
		}
		if canonical.Nodes[i].Exercise != nil {
			payload := *canonical.Nodes[i].Exercise
			payload.Versions = append([]ContentExerciseVersion(nil), payload.Versions...)
			sort.Slice(payload.Versions, func(a, b int) bool { return payload.Versions[a].SourceID < payload.Versions[b].SourceID })
			canonical.Nodes[i].Exercise = &payload
		}
	}
	sort.Slice(canonical.Nodes, func(i, j int) bool { return canonical.Nodes[i].SourceID < canonical.Nodes[j].SourceID })
	sort.Slice(canonical.Edges, func(i, j int) bool { return canonical.Edges[i].EvidenceKey < canonical.Edges[j].EvidenceKey })
	sort.Slice(canonical.Assets, func(i, j int) bool {
		a, b := canonical.Assets[i], canonical.Assets[j]
		return a.OwnerSourceID+"\x00"+a.OwnerField+"\x00"+a.ID < b.OwnerSourceID+"\x00"+b.OwnerField+"\x00"+b.ID
	})
	sort.Slice(canonical.ExternalNotebooks, func(i, j int) bool {
		return canonical.ExternalNotebooks[i].ProviderNotebookID < canonical.ExternalNotebooks[j].ProviderNotebookID
	})
	encoded, err := json.Marshal(canonical)
	if err != nil {
		return "", fmt.Errorf("canonicalize snapshot: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return "sha256:" + hex.EncodeToString(digest[:]), nil
}
