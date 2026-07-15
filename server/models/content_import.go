package models

import (
	"encoding/json"
	"time"
)

// ContentBinding associates one explicitly authorized provider notebook with an
// Ankidemy domain. Provider-specific details live in Config so later adapters do
// not require an Org-roam-specific schema.
type ContentBinding struct {
	ID                 uint            `gorm:"primaryKey" json:"id"`
	Provider           string          `gorm:"column:provider;not null;size:32;uniqueIndex:idx_content_binding_source" json:"provider"`
	ProviderNotebookID string          `gorm:"column:provider_notebook_id;not null;size:128;uniqueIndex:idx_content_binding_source" json:"providerNotebookId"`
	DomainID           uint            `gorm:"column:domain_id;not null;index;uniqueIndex:idx_content_binding_domain" json:"domainId"`
	OwnerID            uint            `gorm:"column:owner_id;not null;index;uniqueIndex:idx_content_binding_source;uniqueIndex:idx_content_binding_domain" json:"ownerId"`
	Config             json.RawMessage `gorm:"column:config;type:jsonb;not null;default:'{}'" json:"config"`
	CanonicalLocator   string          `gorm:"column:canonical_locator;not null;default:''" json:"canonicalLocator"`
	DisplayName        string          `gorm:"column:display_name;not null;default:''" json:"displayName"`
	SchemaVersion      int             `gorm:"column:schema_version;not null" json:"schemaVersion"`
	ProtocolVersion    int             `gorm:"column:protocol_version;not null" json:"protocolVersion"`
	BridgeInstanceID   string          `gorm:"column:bridge_instance_id;not null;default:''" json:"bridgeInstanceId"`
	AuthorizationState string          `gorm:"column:authorization_state;not null;default:'attached';index" json:"authorizationState"`
	ConnectionState    string          `gorm:"column:connection_state;not null;default:'offline';index" json:"connectionState"`
	LastRevision       string          `gorm:"column:last_revision;not null;default:'';size:80" json:"lastRevision"`
	LastAcceptedAt     *time.Time      `gorm:"column:last_accepted_at" json:"lastAcceptedAt,omitempty"`
	LastError          json.RawMessage `gorm:"column:last_error;type:jsonb" json:"lastError,omitempty"`
	CreatedAt          time.Time       `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt          time.Time       `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (ContentBinding) TableName() string { return "content_bindings" }

// ContentEntity is the durable identity map between a provider entity/version
// and an existing Ankidemy row. Missing entities retain this row as a tombstone.
type ContentEntity struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	BindingID         uint      `gorm:"column:binding_id;not null;index;uniqueIndex:idx_content_entity_source" json:"bindingId"`
	ProviderEntityID  string    `gorm:"column:provider_entity_id;not null;size:160;uniqueIndex:idx_content_entity_source" json:"providerEntityId"`
	Role              string    `gorm:"column:role;not null;size:32;uniqueIndex:idx_content_entity_source" json:"role"`
	NodeType          string    `gorm:"column:node_type;not null;size:32;index" json:"nodeType"`
	TableNameValue    string    `gorm:"column:table_name;not null;size:64" json:"tableName"`
	RowID             uint      `gorm:"column:row_id;not null;index" json:"rowId"`
	ParentEntityID    string    `gorm:"column:parent_entity_id;not null;default:'';size:160" json:"parentEntityId"`
	RelativeLocator   string    `gorm:"column:relative_locator;not null;default:''" json:"relativeLocator"`
	ContentHash       string    `gorm:"column:content_hash;not null;default:'';size:80" json:"contentHash"`
	State             string    `gorm:"column:state;not null;default:'active';index" json:"state"`
	FirstSeenRevision string    `gorm:"column:first_seen_revision;not null;size:80" json:"firstSeenRevision"`
	LastSeenRevision  string    `gorm:"column:last_seen_revision;not null;size:80" json:"lastSeenRevision"`
	CreatedAt         time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt         time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (ContentEntity) TableName() string { return "content_entities" }

// ContentManagedEdge records provider evidence separately from its materialized
// graph row so one edge can survive while any managed evidence still exists.
type ContentManagedEdge struct {
	ID                   uint      `gorm:"primaryKey" json:"id"`
	BindingID            uint      `gorm:"column:binding_id;not null;index;uniqueIndex:idx_content_edge_evidence" json:"bindingId"`
	EvidenceKey          string    `gorm:"column:evidence_key;not null;size:255;uniqueIndex:idx_content_edge_evidence" json:"evidenceKey"`
	EvidenceKind         string    `gorm:"column:evidence_kind;not null;size:32" json:"evidenceKind"`
	FromProviderEntityID string    `gorm:"column:from_provider_entity_id;not null;size:160" json:"fromProviderEntityId"`
	ToProviderEntityID   string    `gorm:"column:to_provider_entity_id;not null;size:160" json:"toProviderEntityId"`
	ExternalBindingID    *uint     `gorm:"column:external_binding_id;index" json:"externalBindingId,omitempty"`
	MaterializedTable    string    `gorm:"column:materialized_table;not null;default:'';size:64" json:"materializedTable"`
	MaterializedRowID    *uint     `gorm:"column:materialized_row_id;index" json:"materializedRowId,omitempty"`
	State                string    `gorm:"column:state;not null;default:'active';index" json:"state"`
	FirstSeenRevision    string    `gorm:"column:first_seen_revision;not null;size:80" json:"firstSeenRevision"`
	LastSeenRevision     string    `gorm:"column:last_seen_revision;not null;size:80" json:"lastSeenRevision"`
	CreatedAt            time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt            time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (ContentManagedEdge) TableName() string { return "content_managed_edges" }

// ContentAsset attributes one content-addressed media object to the exact
// provider entity field that owns it.
type ContentAsset struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	BindingID         uint      `gorm:"column:binding_id;not null;index;uniqueIndex:idx_content_asset_owner" json:"bindingId"`
	OwnerEntityID     string    `gorm:"column:owner_entity_id;not null;size:160;uniqueIndex:idx_content_asset_owner" json:"ownerEntityId"`
	OwnerRole         string    `gorm:"column:owner_role;not null;size:32;uniqueIndex:idx_content_asset_owner" json:"ownerRole"`
	OwnerField        string    `gorm:"column:owner_field;not null;size:64;uniqueIndex:idx_content_asset_owner" json:"ownerField"`
	SHA256            string    `gorm:"column:sha256;not null;size:64;index;uniqueIndex:idx_content_asset_owner" json:"sha256"`
	MIME              string    `gorm:"column:mime;not null;size:128" json:"mime"`
	ByteSize          int64     `gorm:"column:byte_size;not null" json:"byteSize"`
	Width             int       `gorm:"column:width;not null;default:0" json:"width"`
	Height            int       `gorm:"column:height;not null;default:0" json:"height"`
	RelativeLocator   string    `gorm:"column:relative_locator;not null;default:''" json:"relativeLocator"`
	MediaPath         string    `gorm:"column:media_path;not null" json:"mediaPath"`
	State             string    `gorm:"column:state;not null;default:'active';index" json:"state"`
	FirstSeenRevision string    `gorm:"column:first_seen_revision;not null;size:80" json:"firstSeenRevision"`
	LastSeenRevision  string    `gorm:"column:last_seen_revision;not null;size:80" json:"lastSeenRevision"`
	CreatedAt         time.Time `gorm:"column:created_at;autoCreateTime" json:"createdAt"`
	UpdatedAt         time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updatedAt"`
}

func (ContentAsset) TableName() string { return "content_assets" }

// ContentSyncRun is an append-only operational record. Diagnostics contain
// locations and error codes, never imported learning/SRS state.
type ContentSyncRun struct {
	ID          uint            `gorm:"primaryKey" json:"id"`
	BindingID   uint            `gorm:"column:binding_id;not null;index" json:"bindingId"`
	Revision    string          `gorm:"column:revision;not null;size:80;index" json:"revision"`
	Result      string          `gorm:"column:result;not null;size:32;index" json:"result"`
	Counts      json.RawMessage `gorm:"column:counts;type:jsonb;not null;default:'{}'" json:"counts"`
	Diagnostics json.RawMessage `gorm:"column:diagnostics;type:jsonb;not null;default:'[]'" json:"diagnostics"`
	StartedAt   time.Time       `gorm:"column:started_at;not null" json:"startedAt"`
	FinishedAt  time.Time       `gorm:"column:finished_at;not null" json:"finishedAt"`
}

func (ContentSyncRun) TableName() string { return "content_sync_runs" }
