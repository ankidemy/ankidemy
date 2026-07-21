package services

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"ankidemy/server/dao"
	"ankidemy/server/models"
)

type fakeOrgBridge struct {
	state         string
	root          OrgBridgeRoot
	snapshot      ContentSnapshot
	assets        map[string]OrgBridgeAsset
	requests      int
	assetRequests int
}

func (f *fakeOrgBridge) CurrentRoot() OrgBridgeRoot { return f.root }
func (f *fakeOrgBridge) ConnectionState() string    { return f.state }
func (f *fakeOrgBridge) RequestSnapshot(_ context.Context, _ string) (ContentSnapshot, error) {
	f.requests++
	return f.snapshot, nil
}
func (f *fakeOrgBridge) RequestAsset(_ context.Context, _ string, sha string) (OrgBridgeAsset, error) {
	f.assetRequests++
	asset, ok := f.assets[sha]
	if !ok {
		return OrgBridgeAsset{}, errors.New("missing fake asset")
	}
	return asset, nil
}

func TestContentLiveImportRequiresExplicitAttachment(t *testing.T) {
	db := contentReconcilerTestDB(t)
	snapshot := validContentSnapshot()
	snapshot.Assets = nil
	bridge := &fakeOrgBridge{
		state:    "online",
		root:     OrgBridgeRoot{Root: snapshot.Notebook.Root, HasManifest: true, ProviderNotebookID: snapshot.Notebook.ProviderNotebookID, Title: snapshot.Notebook.Title, Schema: 1},
		snapshot: snapshot,
	}
	service := NewContentLiveImportService(db, bridge, NewContentEventHub())

	service.OrgBridgeRootChanged(bridge.root)
	var domains int64
	if err := db.Model(&models.Domain{}).Count(&domains).Error; err != nil {
		t.Fatal(err)
	}
	if domains != 0 || bridge.requests != 0 {
		t.Fatalf("root switch imported content: domains=%d requests=%d", domains, bridge.requests)
	}

	binding, result, err := service.AttachCurrent(context.Background(), 42)
	if err != nil {
		t.Fatal(err)
	}
	if binding.DomainID == 0 || result == nil || result.Counts["nodesCreated"] != 4 {
		t.Fatalf("unexpected attachment result: binding=%#v result=%#v", binding, result)
	}
	var enrollment models.UserDomainProgress
	if err := db.Where("user_id = ? AND domain_id = ?", 42, binding.DomainID).First(&enrollment).Error; err != nil {
		t.Fatalf("attachment did not enroll its owner: %v", err)
	}
	if _, _, err := service.AttachCurrent(context.Background(), 42); !errors.Is(err, ErrContentBindingExists) {
		t.Fatalf("duplicate attachment should conflict, got %v", err)
	}

	if err := service.Detach(42, binding.ID); err != nil {
		t.Fatal(err)
	}
	var detached models.ContentBinding
	if err := db.First(&detached, binding.ID).Error; err != nil {
		t.Fatal(err)
	}
	if detached.AuthorizationState != "detached" {
		t.Fatalf("binding was not detached: %#v", detached)
	}
	if err := db.First(&models.Domain{}, binding.DomainID).Error; err != nil {
		t.Fatalf("detach deleted imported domain: %v", err)
	}

	if err := dao.NewDomainDAO(db).Delete(binding.DomainID); err != nil {
		t.Fatal(err)
	}
	reattached, _, err := service.AttachCurrent(context.Background(), 42)
	if err != nil {
		t.Fatalf("reattach of archived notebook failed: %v", err)
	}
	if reattached.DomainID != binding.DomainID {
		t.Fatalf("reattach created a duplicate domain: old=%d new=%d", binding.DomainID, reattached.DomainID)
	}
	if err := db.First(&models.Domain{}, binding.DomainID).Error; err != nil {
		t.Fatalf("reattach did not restore archived domain: %v", err)
	}
}

func TestContentLiveImportRootSwitchConnectsOnlyCurrentAttachedNotebook(t *testing.T) {
	db := contentReconcilerTestDB(t)
	bridge := &fakeOrgBridge{state: "online"}
	service := NewContentLiveImportService(db, bridge, NewContentEventHub())
	bindings := []models.ContentBinding{
		{Provider: "org-roam", ProviderNotebookID: "algorithms", DomainID: 11, OwnerID: 42, Config: []byte(`{}`), AuthorizationState: "attached", ConnectionState: "online"},
		{Provider: "org-roam", ProviderNotebookID: "strive", DomainID: 12, OwnerID: 42, Config: []byte(`{}`), AuthorizationState: "attached", ConnectionState: "offline"},
	}
	for i := range bindings {
		if err := db.Create(&bindings[i]).Error; err != nil {
			t.Fatal(err)
		}
	}

	bridge.root = OrgBridgeRoot{
		Root: "/vault/Strive/", HasManifest: true,
		ProviderNotebookID: "strive", Title: "Strive", Schema: 1,
	}
	service.OrgBridgeRootChanged(bridge.root)
	var got []models.ContentBinding
	if err := db.Order("id ASC").Find(&got).Error; err != nil {
		t.Fatal(err)
	}
	if got[0].AuthorizationState != "attached" || got[0].ConnectionState != "offline" {
		t.Fatalf("inactive notebook lost authorization or stayed online: %#v", got[0])
	}
	if got[1].AuthorizationState != "attached" || got[1].ConnectionState != "online" || got[1].CanonicalLocator != "/vault/Strive/" {
		t.Fatalf("active notebook was not connected: %#v", got[1])
	}

	bridge.root = OrgBridgeRoot{}
	service.OrgBridgeRootChanged(bridge.root)
	got = nil
	if err := db.Order("id ASC").Find(&got).Error; err != nil {
		t.Fatal(err)
	}
	if got[0].ConnectionState != "offline" || got[1].ConnectionState != "offline" {
		t.Fatalf("unmanifested root did not disconnect all notebooks: %#v", got)
	}

	service.OrgBridgeRootChanged(OrgBridgeRoot{
		Root: "/vault/Strive/", HasManifest: true,
		ProviderNotebookID: "strive", Title: "Strive", Schema: 1,
	})
	got = nil
	if err := db.Order("id ASC").Find(&got).Error; err != nil {
		t.Fatal(err)
	}
	if got[1].ConnectionState != "offline" {
		t.Fatalf("late callback restored an inactive notebook: %#v", got[1])
	}
}

func TestContentLiveImportVerifiesAndStoresAssets(t *testing.T) {
	db := contentReconcilerTestDB(t)
	_, binding, snapshot := contentReconcilerFixture(t, db)
	bytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(bytes)
	id := "sha256:" + hex.EncodeToString(digest[:])
	snapshot.Assets = []ContentSnapshotAsset{{
		ID: id, OwnerSourceID: "source-1", OwnerRole: "node", OwnerField: "contentMd",
		SourceLocator: "images/plot.png", MIME: "image/png", ByteSize: int64(len(bytes)),
	}}
	snapshot.Nodes[0].Source.ContentMD = "![plot](asset:" + id + ")"
	bridge := &fakeOrgBridge{
		state: "online", root: OrgBridgeRoot{Root: snapshot.Notebook.Root, HasManifest: true}, snapshot: snapshot,
		assets: map[string]OrgBridgeAsset{id: {
			SHA256: id, MIME: "image/png", Size: int64(len(bytes)), Base64: base64.StdEncoding.EncodeToString(bytes),
		}},
	}
	service := NewContentLiveImportService(db, bridge, NewContentEventHub())

	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	temporary := t.TempDir()
	if err := os.Chdir(temporary); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(workingDirectory); err != nil {
			t.Errorf("restore working directory: %v", err)
		}
	})

	hydrated, err := service.hydrateAssets(context.Background(), binding, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	mediaURL := hydrated.Assets[0].MediaURL
	if mediaURL == "" || strings.Contains(hydrated.Nodes[0].Source.ContentMD, "asset:sha256:") {
		t.Fatalf("asset placeholder was not hydrated: %#v %q", hydrated.Assets[0], hydrated.Nodes[0].Source.ContentMD)
	}
	path, err := MediaURLToPath(mediaURL)
	if err != nil {
		t.Fatal(err)
	}
	stored, err := os.ReadFile(filepath.Clean(path))
	if err != nil || string(stored) != string(bytes) {
		t.Fatalf("stored asset mismatch: %q %v", stored, err)
	}
	requestCount := bridge.assetRequests
	bridge.assets = map[string]OrgBridgeAsset{}
	if _, err := service.hydrateAssets(context.Background(), binding, snapshot); err != nil {
		t.Fatalf("verified cached asset should not cross bridge again: %v", err)
	}
	if requestCount != 1 || bridge.assetRequests != requestCount {
		t.Fatalf("cached asset crossed bridge again: before=%d after=%d", requestCount, bridge.assetRequests)
	}

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	bridge.assets[id] = OrgBridgeAsset{SHA256: id, MIME: "image/png", Size: int64(len(bytes)), Base64: base64.StdEncoding.EncodeToString([]byte("tampered"))}
	if _, err := service.hydrateAssets(context.Background(), binding, snapshot); err == nil {
		t.Fatal("tampered asset transfer was accepted")
	}
}

func TestContentLiveImportFailedFirstSyncLeavesNoHalfAttachedDomain(t *testing.T) {
	db := contentReconcilerTestDB(t)
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(workingDirectory); err != nil {
			t.Errorf("restore working directory: %v", err)
		}
	})
	snapshot := validContentSnapshot()
	id := "sha256:" + strings.Repeat("a", 64)
	snapshot.Assets = []ContentSnapshotAsset{{
		ID: id, OwnerSourceID: "source-1", OwnerRole: "node", OwnerField: "contentMd",
		SourceLocator: "missing.png", MIME: "image/png", ByteSize: 10,
	}}
	snapshot.Nodes[0].Source.ContentMD = "![missing](asset:" + id + ")"
	bridge := &fakeOrgBridge{
		state:    "online",
		root:     OrgBridgeRoot{Root: snapshot.Notebook.Root, HasManifest: true, ProviderNotebookID: snapshot.Notebook.ProviderNotebookID},
		snapshot: snapshot, assets: map[string]OrgBridgeAsset{},
	}
	service := NewContentLiveImportService(db, bridge, NewContentEventHub())
	if _, _, err := service.AttachCurrent(context.Background(), 42); err == nil {
		t.Fatal("attachment with missing media unexpectedly succeeded")
	}
	var domains, bindings int64
	if err := db.Model(&models.Domain{}).Count(&domains).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&models.ContentBinding{}).Count(&bindings).Error; err != nil {
		t.Fatal(err)
	}
	if domains != 0 || bindings != 0 {
		t.Fatalf("failed attachment leaked state: domains=%d bindings=%d", domains, bindings)
	}
}

func TestVerifiedImportedImageAllowsSafeSVGAndRejectsActiveContent(t *testing.T) {
	safe := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>`)
	if !verifiedImportedImage(safe, "image/svg+xml", "text/xml; charset=utf-8") {
		t.Fatal("safe SVG was rejected")
	}
	for _, malicious := range [][]byte{
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`),
		[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.test/a"/></svg>`),
	} {
		if verifiedImportedImage(malicious, "image/svg+xml", "text/xml; charset=utf-8") {
			t.Fatalf("active SVG content was accepted: %s", malicious)
		}
	}
}
