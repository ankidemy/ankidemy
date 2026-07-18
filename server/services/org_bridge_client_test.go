package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type bridgeListenerProbe struct {
	connections chan string
	roots       chan OrgBridgeRoot
}

func (p *bridgeListenerProbe) OrgBridgeConnectionChanged(state string, _ string) {
	select {
	case p.connections <- state:
	default:
	}
}
func (p *bridgeListenerProbe) OrgBridgeRootChanged(root OrgBridgeRoot) {
	select {
	case p.roots <- root:
	default:
	}
}
func (*bridgeListenerProbe) OrgBridgeSnapshotChanged(OrgBridgeRoot)         {}
func (*bridgeListenerProbe) OrgBridgePresenceChanged(OrgBridgeRoot, string) {}

func TestOrgBridgeClientAuthenticatesAndDispatchesRPC(t *testing.T) {
	const token = "test-token-at-least-24-characters"
	snapshot := validContentSnapshot()
	snapshot.Assets = nil
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer func() { _ = connection.Close() }()
		var auth map[string]any
		if connection.ReadJSON(&auth) != nil || auth["type"] != "auth" || auth["token"] != token {
			return
		}
		_ = connection.WriteJSON(map[string]any{"type": "authenticated", "ok": true, "instanceId": "emacs-test"})
		_ = connection.WriteJSON(map[string]any{
			"type": "root.changed",
			"params": map[string]any{"root": map[string]any{
				"root": snapshot.Notebook.Root, "hasManifest": true,
				"providerNotebookId": snapshot.Notebook.ProviderNotebookID,
				"title":              snapshot.Notebook.Title, "schema": 1,
			}},
		})
		for {
			var request struct {
				Type   string `json:"type"`
				ID     string `json:"id"`
				Method string `json:"method"`
			}
			if connection.ReadJSON(&request) != nil {
				return
			}
			if request.Type == "request" && request.Method == "snapshot.get" {
				encoded, _ := json.Marshal(snapshot)
				_ = connection.WriteJSON(map[string]any{"type": "response", "id": request.ID, "ok": true, "result": json.RawMessage(encoded)})
			}
		}
	}))
	defer server.Close()

	probe := &bridgeListenerProbe{connections: make(chan string, 8), roots: make(chan OrgBridgeRoot, 1)}
	client, err := NewOrgBridgeClient("ws"+strings.TrimPrefix(server.URL, "http"), token, probe)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client.Start(ctx)

	deadline := time.After(2 * time.Second)
	for client.ConnectionState() != "online" {
		select {
		case <-probe.connections:
		case <-deadline:
			t.Fatal("bridge did not authenticate")
		}
	}
	select {
	case root := <-probe.roots:
		if root.ProviderNotebookID != snapshot.Notebook.ProviderNotebookID || !root.HasManifest {
			t.Fatalf("unexpected root notification: %#v", root)
		}
	case <-time.After(time.Second):
		t.Fatal("root notification not dispatched")
	}

	rpcContext, rpcCancel := context.WithTimeout(context.Background(), time.Second)
	defer rpcCancel()
	received, err := client.RequestSnapshot(rpcContext, snapshot.Notebook.Root)
	if err != nil {
		t.Fatal(err)
	}
	if received.Notebook.ProviderNotebookID != snapshot.Notebook.ProviderNotebookID || len(received.Nodes) != len(snapshot.Nodes) {
		t.Fatalf("unexpected RPC snapshot: %#v", received.Notebook)
	}
}

func TestOrgBridgeClientMarksConnectionOfflineAfterMissedHeartbeats(t *testing.T) {
	const token = "test-token-at-least-24-characters"
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer func() { _ = connection.Close() }()
		var auth map[string]any
		if connection.ReadJSON(&auth) != nil {
			return
		}
		_ = connection.WriteJSON(map[string]any{"type": "authenticated", "ok": true, "instanceId": "silent-emacs"})
		for {
			if _, _, err := connection.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()

	probe := &bridgeListenerProbe{connections: make(chan string, 32), roots: make(chan OrgBridgeRoot, 1)}
	client, err := NewOrgBridgeClient("ws"+strings.TrimPrefix(server.URL, "http"), token, probe)
	if err != nil {
		t.Fatal(err)
	}
	client.heartbeatInterval = 10 * time.Millisecond
	client.heartbeatTimeout = 30 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client.Start(ctx)
	seenOnline := false
	deadline := time.After(time.Second)
	for {
		select {
		case state := <-probe.connections:
			if state == "online" {
				seenOnline = true
			}
			if seenOnline && state == "offline" {
				return
			}
		case <-deadline:
			t.Fatal("silent bridge was not marked offline")
		}
	}
}

func TestOrgBridgeClientClearsRedactedRootAndIgnoresStaleSnapshotRoot(t *testing.T) {
	client := &OrgBridgeClient{root: OrgBridgeRoot{
		Root: "/approved/Algorithms/", HasManifest: true,
		ProviderNotebookID: "algorithms", Title: "Algorithms",
	}}
	client.handleNotification("root.changed", json.RawMessage(`{"root":{"root":"","hasManifest":false}}`))
	if root := client.CurrentRoot(); root.Root != "" || root.HasManifest || root.ProviderNotebookID != "" {
		t.Fatalf("redacted root did not clear cached root: %#v", root)
	}

	client.handleNotification("root.changed", json.RawMessage(`{"root":{"root":"/approved/Strive/","hasManifest":true,"providerNotebookId":"strive","title":"Strive"}}`))
	client.handleNotification("snapshot.changed", json.RawMessage(`{"root":{"root":"/approved/Algorithms/","hasManifest":true,"providerNotebookId":"algorithms","title":"Algorithms"}}`))
	if root := client.CurrentRoot(); root.ProviderNotebookID != "strive" {
		t.Fatalf("stale snapshot notification replaced current root: %#v", root)
	}
}
