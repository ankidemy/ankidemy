package services

import (
	"sync"
	"time"
)

// ContentEvent is the small, user-scoped event envelope consumed by the
// browser. Imported content itself is fetched through the normal domain APIs.
type ContentEvent struct {
	OwnerID            uint                `json:"-"`
	Type               string              `json:"type"`
	At                 time.Time           `json:"at"`
	BindingID          uint                `json:"bindingId,omitempty"`
	DomainID           uint                `json:"domainId,omitempty"`
	Provider           string              `json:"provider,omitempty"`
	ProviderNotebookID string              `json:"providerNotebookId,omitempty"`
	DisplayName        string              `json:"displayName,omitempty"`
	ConnectionState    string              `json:"connectionState,omitempty"`
	SourceID           string              `json:"sourceId,omitempty"`
	NodeType           string              `json:"nodeType,omitempty"`
	NodeID             uint                `json:"nodeId,omitempty"`
	Code               string              `json:"code,omitempty"`
	Revision           string              `json:"revision,omitempty"`
	Counts             map[string]int      `json:"counts,omitempty"`
	Changes            []ContentNodeChange `json:"changes"`
	Diagnostics        []ContentDiagnostic `json:"diagnostics,omitempty"`
	Message            string              `json:"message,omitempty"`
}

// ContentEventHub is an in-process fanout. Slow browser tabs lose intermediate
// events and recover through GET /live-import/status; they can never stall an
// import transaction.
type ContentEventHub struct {
	mu          sync.RWMutex
	nextID      uint64
	subscribers map[uint64]contentSubscriber
}

type contentSubscriber struct {
	ownerID uint
	ch      chan ContentEvent
}

func NewContentEventHub() *ContentEventHub {
	return &ContentEventHub{subscribers: make(map[uint64]contentSubscriber)}
}

func (h *ContentEventHub) Publish(event ContentEvent) {
	if event.At.IsZero() {
		event.At = time.Now().UTC()
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, subscriber := range h.subscribers {
		if event.OwnerID != 0 && subscriber.ownerID != event.OwnerID {
			continue
		}
		select {
		case subscriber.ch <- event:
		default:
			// A later status refresh is authoritative.
		}
	}
}

func (h *ContentEventHub) Subscribe(ownerID uint) (<-chan ContentEvent, func()) {
	h.mu.Lock()
	h.nextID++
	id := h.nextID
	ch := make(chan ContentEvent, 32)
	h.subscribers[id] = contentSubscriber{ownerID: ownerID, ch: ch}
	h.mu.Unlock()

	var once sync.Once
	return ch, func() {
		once.Do(func() {
			h.mu.Lock()
			delete(h.subscribers, id)
			close(ch)
			h.mu.Unlock()
		})
	}
}
