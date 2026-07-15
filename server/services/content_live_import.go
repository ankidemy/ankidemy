package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"ankidemy/server/models"

	"gorm.io/gorm"
)

const (
	maxLiveImportAssetBytes = 20 << 20
	maxLiveImportTotalBytes = 100 << 20
)

var ErrContentBindingExists = errors.New("this notebook is already attached")

type ContentLiveImportStatus struct {
	Enabled         bool                    `json:"enabled"`
	ConnectionState string                  `json:"connectionState"`
	CurrentRoot     OrgBridgeRoot           `json:"currentRoot"`
	Bindings        []models.ContentBinding `json:"bindings"`
}

// ContentLiveImportService owns the provider-neutral bridge workflow. It
// synchronizes only bindings that were explicitly attached by an authenticated
// user; merely switching an Org-roam root never creates a domain.
type ContentLiveImportService struct {
	db         *gorm.DB
	bridge     OrgBridge
	reconciler *ContentReconciler
	hub        *ContentEventHub
	locksMu    sync.Mutex
	locks      map[uint]*sync.Mutex
	snapshotMu sync.Mutex
}

func NewContentLiveImportService(db *gorm.DB, bridge OrgBridge, hub *ContentEventHub) *ContentLiveImportService {
	return &ContentLiveImportService{
		db: db, bridge: bridge, reconciler: NewContentReconciler(db), hub: hub,
		locks: make(map[uint]*sync.Mutex),
	}
}

func (s *ContentLiveImportService) lockBinding(id uint) func() {
	s.locksMu.Lock()
	lock := s.locks[id]
	if lock == nil {
		lock = &sync.Mutex{}
		s.locks[id] = lock
	}
	s.locksMu.Unlock()
	lock.Lock()
	return lock.Unlock
}

func (s *ContentLiveImportService) Status(ownerID uint) (ContentLiveImportStatus, error) {
	var bindings []models.ContentBinding
	err := s.db.Where("owner_id = ?", ownerID).Order("id ASC").Find(&bindings).Error
	return ContentLiveImportStatus{
		Enabled: true, ConnectionState: s.bridge.ConnectionState(),
		CurrentRoot: s.bridge.CurrentRoot(), Bindings: bindings,
	}, err
}

func (s *ContentLiveImportService) Binding(ownerID, bindingID uint) (*models.ContentBinding, error) {
	var binding models.ContentBinding
	if err := s.db.Where("id = ? AND owner_id = ?", bindingID, ownerID).First(&binding).Error; err != nil {
		return nil, err
	}
	return &binding, nil
}

func (s *ContentLiveImportService) BindingForDomain(ownerID, domainID uint) (*models.ContentBinding, error) {
	var binding models.ContentBinding
	if err := s.db.Where("domain_id = ? AND owner_id = ? AND authorization_state = ?", domainID, ownerID, "attached").First(&binding).Error; err != nil {
		return nil, err
	}
	return &binding, nil
}

func snapshotReadyForAttachment(snapshot ContentSnapshot) ContentSnapshotValidation {
	clone := snapshot
	clone.Revision = ""
	clone.Assets = append([]ContentSnapshotAsset(nil), snapshot.Assets...)
	for i := range clone.Assets {
		clone.Assets[i].MediaURL = "/pending/" + strings.TrimPrefix(clone.Assets[i].ID, "sha256:")
	}
	return ValidateContentSnapshot(clone)
}

func (s *ContentLiveImportService) AttachCurrent(ctx context.Context, ownerID uint) (*models.ContentBinding, *ContentReconcileResult, error) {
	root := s.bridge.CurrentRoot()
	if s.bridge.ConnectionState() != "online" {
		return nil, nil, errors.New("Org bridge is offline")
	}
	if !root.HasManifest || root.ProviderNotebookID == "" {
		return nil, nil, errors.New("current Org-roam root has no valid ankidemy.org manifest")
	}
	snapshot, err := s.bridge.RequestSnapshot(ctx, root.Root)
	if err != nil {
		return nil, nil, err
	}
	validation := snapshotReadyForAttachment(snapshot)
	if !validation.Reconciliable {
		return nil, nil, &ContentReconcileError{Validation: validation}
	}

	var existing models.ContentBinding
	err = s.db.Where("owner_id = ? AND provider = ? AND provider_notebook_id = ?", ownerID, snapshot.Provider, snapshot.Notebook.ProviderNotebookID).First(&existing).Error
	if err == nil && existing.AuthorizationState == "attached" {
		return nil, nil, ErrContentBindingExists
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, err
	}

	var binding models.ContentBinding
	createdNew := false
	if existing.ID != 0 {
		binding = existing
		if err := s.db.Unscoped().Model(&models.Domain{}).Where("id = ?", binding.DomainID).
			Update("deleted_at", nil).Error; err != nil {
			return nil, nil, err
		}
		if err := s.db.Model(&binding).Updates(map[string]any{
			"authorization_state": "attached", "connection_state": s.bridge.ConnectionState(),
			"canonical_locator": snapshot.Notebook.Root, "display_name": snapshot.Notebook.Title,
			"schema_version": snapshot.Notebook.Schema, "protocol_version": snapshot.ProtocolVersion,
		}).Error; err != nil {
			return nil, nil, err
		}
		if err := s.db.FirstOrCreate(&models.UserDomainProgress{}, models.UserDomainProgress{
			UserID: ownerID, DomainID: binding.DomainID,
		}).Error; err != nil {
			return nil, nil, err
		}
	} else {
		createdNew = true
		err = s.db.Transaction(func(tx *gorm.DB) error {
			domain := models.Domain{
				Name: snapshot.Notebook.Title, Privacy: "private", OwnerID: ownerID,
				Description: "Managed by the local " + snapshot.Provider + " content bridge.",
			}
			if err := tx.Create(&domain).Error; err != nil {
				return err
			}
			uid, uidErr := GenerateDomainUID(ownerID, domain.ID)
			if uidErr != nil {
				return uidErr
			}
			if err := tx.Model(&domain).Update("domain_uid", uid).Error; err != nil {
				return err
			}
			if err := tx.Create(&models.UserDomainProgress{UserID: ownerID, DomainID: domain.ID}).Error; err != nil {
				return err
			}
			config, _ := json.Marshal(map[string]any{"managed": true})
			binding = models.ContentBinding{
				Provider: snapshot.Provider, ProviderNotebookID: snapshot.Notebook.ProviderNotebookID,
				DomainID: domain.ID, OwnerID: ownerID, Config: config,
				CanonicalLocator: snapshot.Notebook.Root, DisplayName: snapshot.Notebook.Title,
				SchemaVersion: snapshot.Notebook.Schema, ProtocolVersion: snapshot.ProtocolVersion,
				AuthorizationState: "attached", ConnectionState: s.bridge.ConnectionState(),
			}
			return tx.Create(&binding).Error
		})
		if err != nil {
			return nil, nil, err
		}
	}

	result, err := s.syncSnapshot(ctx, &binding, snapshot)
	if err != nil {
		if createdNew {
			_ = s.db.Transaction(func(tx *gorm.DB) error {
				_ = tx.Where("binding_id = ?", binding.ID).Delete(&models.ContentSyncRun{}).Error
				_ = tx.Where("user_id = ? AND domain_id = ?", binding.OwnerID, binding.DomainID).Delete(&models.UserDomainProgress{}).Error
				if deleteErr := tx.Delete(&models.ContentBinding{}, binding.ID).Error; deleteErr != nil {
					return deleteErr
				}
				return tx.Unscoped().Delete(&models.Domain{}, binding.DomainID).Error
			})
			_ = os.RemoveAll(BuildMediaDir(binding.OwnerID, "private", BuildDomainFolder(binding.DomainID, snapshot.Notebook.Title)))
		} else {
			_ = s.db.Model(&binding).Updates(map[string]any{
				"authorization_state": "detached", "connection_state": "offline",
			}).Error
		}
		return &binding, nil, err
	}
	return &binding, result, nil
}

func (s *ContentLiveImportService) Resync(ctx context.Context, ownerID, bindingID uint) (*ContentReconcileResult, error) {
	binding, err := s.Binding(ownerID, bindingID)
	if err != nil {
		return nil, err
	}
	if binding.AuthorizationState != "attached" {
		return nil, errors.New("content binding is detached")
	}
	snapshot, err := s.bridge.RequestSnapshot(ctx, binding.CanonicalLocator)
	if err != nil {
		return nil, err
	}
	return s.syncSnapshot(ctx, binding, snapshot)
}

func (s *ContentLiveImportService) Detach(ownerID, bindingID uint) error {
	binding, err := s.Binding(ownerID, bindingID)
	if err != nil {
		return err
	}
	if err := s.db.Model(binding).Updates(map[string]any{
		"authorization_state": "detached", "connection_state": "offline",
	}).Error; err != nil {
		return err
	}
	s.hub.Publish(ContentEvent{OwnerID: ownerID, Type: "binding.detached", BindingID: binding.ID, DomainID: binding.DomainID})
	return nil
}

func (s *ContentLiveImportService) Diagnostics(ownerID, bindingID uint, limit int) ([]models.ContentSyncRun, error) {
	if _, err := s.Binding(ownerID, bindingID); err != nil {
		return nil, err
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	var runs []models.ContentSyncRun
	err := s.db.Where("binding_id = ?", bindingID).Order("id DESC").Limit(limit).Find(&runs).Error
	return runs, err
}

func (s *ContentLiveImportService) syncSnapshot(ctx context.Context, binding *models.ContentBinding, snapshot ContentSnapshot) (*ContentReconcileResult, error) {
	unlock := s.lockBinding(binding.ID)
	defer unlock()

	if snapshot.Provider != binding.Provider || snapshot.Notebook.ProviderNotebookID != binding.ProviderNotebookID {
		return nil, errors.New("bridge snapshot does not match attached notebook")
	}
	hydrated, err := s.hydrateAssets(ctx, binding, snapshot)
	if err != nil {
		s.recordBindingError(binding, err)
		return nil, err
	}
	result, err := s.reconciler.Reconcile(binding.ID, hydrated)
	if err != nil {
		s.recordBindingError(binding, err)
		event := ContentEvent{OwnerID: binding.OwnerID, Type: "sync.rejected", BindingID: binding.ID, DomainID: binding.DomainID, Message: err.Error()}
		var reconcileErr *ContentReconcileError
		if errors.As(err, &reconcileErr) {
			event.Diagnostics = reconcileErr.Validation.Diagnostics
		}
		s.hub.Publish(event)
		return nil, err
	}
	changes := result.Changes
	if changes == nil {
		changes = []ContentNodeChange{}
	}
	s.hub.Publish(ContentEvent{
		OwnerID: binding.OwnerID, Type: "sync.accepted", BindingID: binding.ID,
		DomainID: binding.DomainID, Provider: binding.Provider,
		ProviderNotebookID: binding.ProviderNotebookID, DisplayName: snapshot.Notebook.Title,
		Revision: result.Revision, Counts: result.Counts, Changes: changes,
	})
	return result, nil
}

func (s *ContentLiveImportService) recordBindingError(binding *models.ContentBinding, err error) {
	payload, _ := json.Marshal(map[string]any{"message": err.Error(), "at": time.Now().UTC()})
	_ = s.db.Model(binding).Update("last_error", json.RawMessage(payload)).Error
}

func (s *ContentLiveImportService) hydrateAssets(ctx context.Context, binding *models.ContentBinding, snapshot ContentSnapshot) (ContentSnapshot, error) {
	if len(snapshot.Assets) == 0 {
		snapshot.Revision = ""
		return snapshot, nil
	}
	domainFolder := BuildDomainFolder(binding.DomainID, snapshot.Notebook.Title)
	dir := BuildMediaDir(binding.OwnerID, "private", domainFolder)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return snapshot, err
	}
	var total int64
	countedAssets := make(map[string]bool, len(snapshot.Assets))
	replacements := make(map[string]string, len(snapshot.Assets))
	for i := range snapshot.Assets {
		meta := &snapshot.Assets[i]
		prospectiveTotal := total
		if !countedAssets[meta.ID] {
			prospectiveTotal += meta.ByteSize
		}
		if meta.ByteSize < 0 || meta.ByteSize > maxLiveImportAssetBytes || prospectiveTotal > maxLiveImportTotalBytes {
			return snapshot, fmt.Errorf("asset %s exceeds live-import size limits", meta.ID)
		}
		total = prospectiveTotal
		countedAssets[meta.ID] = true
		ext := extensionForMIME(meta.MIME)
		filename := strings.TrimPrefix(meta.ID, "sha256:") + ext
		path := filepath.Join(dir, filename)
		mediaURL := BuildMediaURL(binding.OwnerID, "private", domainFolder, filename)
		// Content-addressed files already verified on a prior sync do not cross
		// the bridge again. We still hash local bytes so a corrupted cache can
		// never silently satisfy a snapshot.
		if contentAddressedFileMatches(path, meta.ID, meta.ByteSize) {
			meta.MediaURL = mediaURL
			replacements["asset:"+meta.ID] = mediaURL
			continue
		}
		asset, err := s.bridge.RequestAsset(ctx, snapshot.Notebook.Root, meta.ID)
		if err != nil {
			return snapshot, fmt.Errorf("fetch asset %s: %w", meta.ID, err)
		}
		data, err := base64.StdEncoding.DecodeString(asset.Base64)
		if err != nil {
			return snapshot, fmt.Errorf("decode asset %s: %w", meta.ID, err)
		}
		if int64(len(data)) != meta.ByteSize || asset.Size != meta.ByteSize {
			return snapshot, fmt.Errorf("asset %s byte size changed during transfer", meta.ID)
		}
		digest := sha256.Sum256(data)
		actualID := "sha256:" + hex.EncodeToString(digest[:])
		if actualID != meta.ID || asset.SHA256 != meta.ID || asset.MIME != meta.MIME {
			return snapshot, fmt.Errorf("asset %s failed digest or MIME verification", meta.ID)
		}
		detectedMIME, _, detectErr := DetectContentTypeFromReader(bytes.NewReader(data))
		if detectErr != nil || !verifiedImportedImage(data, meta.MIME, detectedMIME) {
			return snapshot, fmt.Errorf("asset %s bytes do not match declared image MIME %s", meta.ID, meta.MIME)
		}
		if err := writeContentAddressedFile(path, data); err != nil {
			return snapshot, err
		}
		meta.MediaURL = mediaURL
		replacements["asset:"+meta.ID] = mediaURL
	}

	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return snapshot, err
	}
	text := string(encoded)
	for placeholder, mediaURL := range replacements {
		text = strings.ReplaceAll(text, placeholder, mediaURL)
	}
	if err := json.Unmarshal([]byte(text), &snapshot); err != nil {
		return snapshot, err
	}
	snapshot.Revision = ""
	return snapshot, nil
}

func verifiedImportedImage(data []byte, declaredMIME, detectedMIME string) bool {
	if declaredMIME != "image/svg+xml" {
		return IsImageContentType(detectedMIME) && detectedMIME == declaredMIME
	}
	decoder := xml.NewDecoder(bytes.NewReader(data))
	seenRoot := false
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return seenRoot
		}
		if err != nil {
			return false
		}
		switch value := token.(type) {
		case xml.Directive:
			return false
		case xml.StartElement:
			name := strings.ToLower(value.Name.Local)
			if !seenRoot {
				if name != "svg" {
					return false
				}
				seenRoot = true
			}
			switch name {
			case "script", "foreignobject", "iframe", "object", "embed":
				return false
			}
			for _, attribute := range value.Attr {
				attributeName := strings.ToLower(attribute.Name.Local)
				attributeValue := strings.TrimSpace(strings.ToLower(attribute.Value))
				if strings.HasPrefix(attributeName, "on") ||
					((attributeName == "href" || attributeName == "src") &&
						attributeValue != "" && !strings.HasPrefix(attributeValue, "#") && !strings.HasPrefix(attributeValue, "data:image/")) ||
					(attributeName == "style" && strings.Contains(attributeValue, "url(")) {
					return false
				}
			}
		}
	}
}

func contentAddressedFileMatches(path, id string, expectedSize int64) bool {
	data, err := os.ReadFile(path)
	if err != nil || int64(len(data)) != expectedSize {
		return false
	}
	digest := sha256.Sum256(data)
	return id == "sha256:"+hex.EncodeToString(digest[:])
}

func extensionForMIME(contentType string) string {
	preferred := map[string]string{
		"image/avif": ".avif", "image/gif": ".gif", "image/jpeg": ".jpg",
		"image/png": ".png", "image/svg+xml": ".svg", "image/webp": ".webp",
	}
	if ext := preferred[contentType]; ext != "" {
		return ext
	}
	if extensions, err := mime.ExtensionsByType(contentType); err == nil && len(extensions) > 0 {
		return extensions[0]
	}
	return ".img"
}

func writeContentAddressedFile(path string, data []byte) error {
	if existing, err := os.ReadFile(path); err == nil {
		digest := sha256.Sum256(existing)
		if strings.Contains(filepath.Base(path), hex.EncodeToString(digest[:])) {
			return nil
		}
		return errors.New("content-addressed media path contains different bytes")
	} else if !os.IsNotExist(err) {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".ankidemy-asset-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Chmod(0o644); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

func (s *ContentLiveImportService) OrgBridgeConnectionChanged(state string, instanceID string) {
	updates := map[string]any{"connection_state": state}
	if instanceID != "" {
		updates["bridge_instance_id"] = instanceID
	}
	_ = s.db.Model(&models.ContentBinding{}).Where("authorization_state = ?", "attached").Updates(updates).Error
	var bindings []models.ContentBinding
	if s.db.Where("authorization_state = ?", "attached").Find(&bindings).Error == nil {
		for _, binding := range bindings {
			s.hub.Publish(ContentEvent{OwnerID: binding.OwnerID, Type: "connection.changed", BindingID: binding.ID, DomainID: binding.DomainID, ConnectionState: state})
		}
	}
}

func (s *ContentLiveImportService) OrgBridgeRootChanged(root OrgBridgeRoot) {
	// OwnerID zero broadcasts only non-sensitive availability metadata. Browser
	// clients then refresh their own authenticated status view; the local path is
	// never included in the event.
	s.hub.Publish(ContentEvent{Type: "root.available", Provider: "org-roam", ProviderNotebookID: root.ProviderNotebookID, DisplayName: root.Title})
	if !root.HasManifest || root.ProviderNotebookID == "" {
		return
	}
	var bindings []models.ContentBinding
	_ = s.db.Where("provider = ? AND provider_notebook_id = ? AND authorization_state = ?", "org-roam", root.ProviderNotebookID, "attached").Find(&bindings).Error
	for _, binding := range bindings {
		s.hub.Publish(ContentEvent{OwnerID: binding.OwnerID, Type: "root.available", BindingID: binding.ID, DomainID: binding.DomainID, Provider: "org-roam", ProviderNotebookID: root.ProviderNotebookID, DisplayName: root.Title})
	}
	if len(bindings) > 0 {
		go s.OrgBridgeSnapshotChanged(root)
	}
}

func (s *ContentLiveImportService) OrgBridgeSnapshotChanged(root OrgBridgeRoot) {
	if !root.HasManifest || root.ProviderNotebookID == "" {
		return
	}
	s.snapshotMu.Lock()
	defer s.snapshotMu.Unlock()
	var bindings []models.ContentBinding
	if s.db.Where("provider = ? AND provider_notebook_id = ? AND authorization_state = ?", "org-roam", root.ProviderNotebookID, "attached").Find(&bindings).Error != nil || len(bindings) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	snapshot, err := s.bridge.RequestSnapshot(ctx, root.Root)
	if err != nil {
		for i := range bindings {
			s.recordBindingError(&bindings[i], err)
		}
		return
	}
	for i := range bindings {
		_, _ = s.syncSnapshot(ctx, &bindings[i], snapshot)
	}
}

func (s *ContentLiveImportService) OrgBridgePresenceChanged(root OrgBridgeRoot, sourceID string) {
	if root.ProviderNotebookID == "" {
		return
	}
	var bindings []models.ContentBinding
	if s.db.Where("provider = ? AND provider_notebook_id = ? AND authorization_state = ?", "org-roam", root.ProviderNotebookID, "attached").Find(&bindings).Error != nil {
		return
	}
	for _, binding := range bindings {
		event := ContentEvent{OwnerID: binding.OwnerID, Type: "presence.changed", BindingID: binding.ID, DomainID: binding.DomainID, SourceID: sourceID}
		if sourceID != "" {
			var entity models.ContentEntity
			if s.db.Where("binding_id = ? AND provider_entity_id = ? AND role = ? AND state = ?", binding.ID, sourceID, "node", "active").First(&entity).Error == nil {
				event.NodeType, event.NodeID = entity.NodeType, entity.RowID
				var code models.DomainNodeCode
				if s.db.Where("domain_id = ? AND node_type = ? AND node_id = ?", binding.DomainID, entity.NodeType, entity.RowID).First(&code).Error == nil {
					event.Code = code.Code
				}
			}
		}
		s.hub.Publish(event)
	}
}
