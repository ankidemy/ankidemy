package services

import (
	"testing"
	"time"
)

func TestContentEventHubScopesEventsByOwner(t *testing.T) {
	hub := NewContentEventHub()
	one, cancelOne := hub.Subscribe(1)
	defer cancelOne()
	two, cancelTwo := hub.Subscribe(2)
	defer cancelTwo()

	hub.Publish(ContentEvent{OwnerID: 1, Type: "sync.accepted"})
	select {
	case event := <-one:
		if event.Type != "sync.accepted" || event.At.IsZero() {
			t.Fatalf("unexpected event: %#v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("owner did not receive event")
	}
	select {
	case event := <-two:
		t.Fatalf("different owner received event: %#v", event)
	case <-time.After(20 * time.Millisecond):
	}
}
