package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

type OrgBridgeRoot struct {
	Root               string `json:"root"`
	HasManifest        bool   `json:"hasManifest"`
	ProviderNotebookID string `json:"providerNotebookId,omitempty"`
	Title              string `json:"title,omitempty"`
	Schema             int    `json:"schema,omitempty"`
}

type OrgBridgeAsset struct {
	SHA256 string `json:"sha256"`
	MIME   string `json:"mime"`
	Size   int64  `json:"size"`
	Base64 string `json:"base64"`
}

type OrgBridgeListener interface {
	OrgBridgeConnectionChanged(state string, instanceID string)
	OrgBridgeRootChanged(root OrgBridgeRoot)
	OrgBridgeSnapshotChanged(root OrgBridgeRoot)
	OrgBridgePresenceChanged(root OrgBridgeRoot, sourceID string)
}

type OrgBridge interface {
	CurrentRoot() OrgBridgeRoot
	ConnectionState() string
	RequestSnapshot(context.Context, string) (ContentSnapshot, error)
	RequestAsset(context.Context, string, string) (OrgBridgeAsset, error)
}

const (
	defaultOrgBridgeHeartbeatInterval = 2 * time.Second
	defaultOrgBridgeHeartbeatTimeout  = 6 * time.Second
)

type orgBridgeEnvelope struct {
	Type       string          `json:"type"`
	ID         string          `json:"id,omitempty"`
	Method     string          `json:"method,omitempty"`
	OK         bool            `json:"ok,omitempty"`
	InstanceID string          `json:"instanceId,omitempty"`
	Error      string          `json:"error,omitempty"`
	Result     json.RawMessage `json:"result,omitempty"`
	Params     json.RawMessage `json:"params,omitempty"`
}

type orgBridgeResponse struct {
	result json.RawMessage
	err    error
}

// OrgBridgeClient maintains one authenticated loopback WebSocket connection to
// Emacs. Authentication is the first application frame because Emacs' server
// package does not expose HTTP upgrade headers to callbacks.
type OrgBridgeClient struct {
	endpoint string
	token    string
	listener OrgBridgeListener

	stateMu           sync.RWMutex
	state             string
	instanceID        string
	root              OrgBridgeRoot
	conn              *websocket.Conn
	writeMu           sync.Mutex
	pendingMu         sync.Mutex
	pending           map[string]chan orgBridgeResponse
	nextID            atomic.Uint64
	lastPong          atomic.Int64
	heartbeatInterval time.Duration
	heartbeatTimeout  time.Duration
}

func NewOrgBridgeClient(endpoint, token string, listener OrgBridgeListener) (*OrgBridgeClient, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil || (parsed.Scheme != "ws" && parsed.Scheme != "wss") || parsed.Host == "" {
		return nil, fmt.Errorf("invalid Org bridge URL %q", endpoint)
	}
	if len(token) < 24 {
		return nil, errors.New("org bridge token must be at least 24 characters")
	}
	return &OrgBridgeClient{
		endpoint: endpoint, token: token, listener: listener,
		state: "offline", pending: make(map[string]chan orgBridgeResponse),
		heartbeatInterval: defaultOrgBridgeHeartbeatInterval,
		heartbeatTimeout:  defaultOrgBridgeHeartbeatTimeout,
	}, nil
}

// SetListener completes construction when the bridge and its coordinating
// service refer to each other. Call it before Start.
func (b *OrgBridgeClient) SetListener(listener OrgBridgeListener) {
	b.listener = listener
}

func (b *OrgBridgeClient) Start(ctx context.Context) {
	go b.run(ctx)
}

func (b *OrgBridgeClient) run(ctx context.Context) {
	backoff := 250 * time.Millisecond
	for ctx.Err() == nil {
		b.setConnectionState("connecting", "")
		conn, _, err := websocket.DefaultDialer.DialContext(ctx, b.endpoint, nil)
		if err == nil {
			err = b.serveConnection(ctx, conn)
		}
		if ctx.Err() != nil {
			break
		}
		if err != nil {
			log.Printf("Org bridge disconnected: %v", err)
		}
		b.setConnectionState("offline", "")
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
		case <-timer.C:
		}
		if backoff < 5*time.Second {
			backoff *= 2
		}
	}
	b.setConnectionState("offline", "")
}

func (b *OrgBridgeClient) serveConnection(ctx context.Context, conn *websocket.Conn) error {
	conn.SetReadLimit(32 << 20)
	b.stateMu.Lock()
	b.conn = conn
	b.stateMu.Unlock()
	defer func() {
		_ = conn.Close()
		b.stateMu.Lock()
		if b.conn == conn {
			b.conn = nil
		}
		b.stateMu.Unlock()
		b.failPending(errors.New("org bridge disconnected"))
	}()

	if err := b.writeJSON(conn, map[string]any{"type": "auth", "token": b.token, "protocolVersion": ContentSnapshotProtocolVersion}); err != nil {
		return err
	}
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("bridge authentication: %w", err)
	}
	var auth orgBridgeEnvelope
	if err := json.Unmarshal(raw, &auth); err != nil || auth.Type != "authenticated" || !auth.OK {
		return errors.New("bridge authentication rejected")
	}
	_ = conn.SetReadDeadline(time.Time{})
	b.setConnectionState("online", auth.InstanceID)
	b.lastPong.Store(time.Now().UnixNano())

	done := make(chan error, 1)
	go func() { done <- b.readLoop(conn) }()
	heartbeatDone := make(chan error, 1)
	go func() { heartbeatDone <- b.heartbeatLoop(ctx, conn) }()
	select {
	case <-ctx.Done():
		_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "server stopping"), time.Now().Add(time.Second))
		return ctx.Err()
	case err := <-done:
		return err
	case err := <-heartbeatDone:
		return err
	}
}

func (b *OrgBridgeClient) heartbeatLoop(ctx context.Context, conn *websocket.Conn) error {
	ticker := time.NewTicker(b.heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			lastPong := time.Unix(0, b.lastPong.Load())
			if time.Since(lastPong) > b.heartbeatTimeout {
				_ = conn.Close()
				return errors.New("org bridge missed three heartbeats")
			}
			if err := b.writeJSON(conn, map[string]any{"type": "ping", "at": time.Now().UTC()}); err != nil {
				return err
			}
		}
	}
}

func (b *OrgBridgeClient) readLoop(conn *websocket.Conn) error {
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		var envelope orgBridgeEnvelope
		if err := json.Unmarshal(raw, &envelope); err != nil {
			continue
		}
		switch envelope.Type {
		case "response":
			b.pendingMu.Lock()
			ch := b.pending[envelope.ID]
			delete(b.pending, envelope.ID)
			b.pendingMu.Unlock()
			if ch != nil {
				if envelope.OK {
					ch <- orgBridgeResponse{result: envelope.Result}
				} else {
					ch <- orgBridgeResponse{err: errors.New(envelope.Error)}
				}
			}
		case "root.changed", "snapshot.changed", "presence.changed":
			b.handleNotification(envelope.Type, envelope.Params)
		case "pong":
			b.lastPong.Store(time.Now().UnixNano())
		}
	}
}

func (b *OrgBridgeClient) handleNotification(kind string, raw json.RawMessage) {
	var params struct {
		Root     OrgBridgeRoot `json:"root"`
		SourceID string        `json:"sourceId"`
	}
	if json.Unmarshal(raw, &params) != nil {
		return
	}
	// Only root.changed owns current-root state.  In particular, an empty root
	// is a deliberate privacy-preserving clear when the newly active root has no
	// manifest.  Snapshot/presence notifications can race a later root switch
	// and must never restore the old root.
	if kind == "root.changed" {
		b.stateMu.Lock()
		b.root = params.Root
		b.stateMu.Unlock()
	}
	if b.listener == nil {
		return
	}
	switch kind {
	case "root.changed":
		go b.listener.OrgBridgeRootChanged(params.Root)
	case "snapshot.changed":
		go b.listener.OrgBridgeSnapshotChanged(params.Root)
	case "presence.changed":
		go b.listener.OrgBridgePresenceChanged(params.Root, params.SourceID)
	}
}

func (b *OrgBridgeClient) request(ctx context.Context, method string, params any, target any) error {
	b.stateMu.RLock()
	conn := b.conn
	state := b.state
	b.stateMu.RUnlock()
	if conn == nil || state != "online" {
		return errors.New("org bridge is offline")
	}
	id := strconv.FormatUint(b.nextID.Add(1), 10)
	response := make(chan orgBridgeResponse, 1)
	b.pendingMu.Lock()
	b.pending[id] = response
	b.pendingMu.Unlock()
	if err := b.writeJSON(conn, map[string]any{"type": "request", "id": id, "method": method, "params": params}); err != nil {
		b.pendingMu.Lock()
		delete(b.pending, id)
		b.pendingMu.Unlock()
		return err
	}
	select {
	case <-ctx.Done():
		b.pendingMu.Lock()
		delete(b.pending, id)
		b.pendingMu.Unlock()
		return ctx.Err()
	case reply := <-response:
		if reply.err != nil {
			return reply.err
		}
		if target == nil {
			return nil
		}
		return json.Unmarshal(reply.result, target)
	}
}

func (b *OrgBridgeClient) writeJSON(conn *websocket.Conn, value any) error {
	b.writeMu.Lock()
	defer b.writeMu.Unlock()
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return conn.WriteJSON(value)
}

func (b *OrgBridgeClient) failPending(err error) {
	b.pendingMu.Lock()
	defer b.pendingMu.Unlock()
	for id, ch := range b.pending {
		delete(b.pending, id)
		ch <- orgBridgeResponse{err: err}
	}
}

func (b *OrgBridgeClient) setConnectionState(state, instanceID string) {
	b.stateMu.Lock()
	changed := b.state != state || (instanceID != "" && b.instanceID != instanceID)
	b.state = state
	if state != "online" {
		b.root = OrgBridgeRoot{}
	}
	if instanceID != "" {
		b.instanceID = instanceID
	}
	currentInstance := b.instanceID
	b.stateMu.Unlock()
	if changed && b.listener != nil {
		b.listener.OrgBridgeConnectionChanged(state, currentInstance)
	}
}

func (b *OrgBridgeClient) CurrentRoot() OrgBridgeRoot {
	b.stateMu.RLock()
	defer b.stateMu.RUnlock()
	return b.root
}

func (b *OrgBridgeClient) ConnectionState() string {
	b.stateMu.RLock()
	defer b.stateMu.RUnlock()
	return b.state
}

func (b *OrgBridgeClient) RequestSnapshot(ctx context.Context, root string) (ContentSnapshot, error) {
	var snapshot ContentSnapshot
	err := b.request(ctx, "snapshot.get", map[string]any{"root": root}, &snapshot)
	return snapshot, err
}

func (b *OrgBridgeClient) RequestAsset(ctx context.Context, root, sha string) (OrgBridgeAsset, error) {
	var asset OrgBridgeAsset
	err := b.request(ctx, "asset.get", map[string]any{"root": root, "sha256": sha}, &asset)
	return asset, err
}
