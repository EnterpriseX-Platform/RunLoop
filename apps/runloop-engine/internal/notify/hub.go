// Package notify implements a project-scoped pub/sub channel hub used by
// the NOTIFY flow node and the /rl/ws/channel/:name websocket endpoint.
//
// Design (v1):
//   * Channels are identified by "{projectID}:{name}". Cross-project
//     subscribers cannot see another project's traffic.
//   * Channels are ephemeral — they exist as long as a subscriber is
//     connected or a Publish call holds a reference. No DB persistence,
//     no message history, no replay.
//   * Publish never blocks the caller. Slow subscribers get dropped
//     messages (best-effort delivery).
//   * Authentication is enforced by the websocket handler before the
//     subscriber is registered with the hub; the hub itself trusts its
//     callers.
package notify

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog/log"
)

// Hub fans messages out to subscribers of a named channel.
type Hub struct {
	mu       sync.RWMutex
	channels map[string]map[*Subscriber]struct{} // key=channelKey
	totalPub int64                               // lifetime publish count (atomic)
}

// Subscriber represents one connected websocket client.
type Subscriber struct {
	ChannelKey string
	Send       chan []byte
	closed     atomic.Bool
}

// New constructs an empty Hub.
func New() *Hub {
	return &Hub{
		channels: make(map[string]map[*Subscriber]struct{}),
	}
}

// ChannelKey scopes a name by project so two projects can use the same
// channel name without colliding.
func ChannelKey(projectID, name string) string { return projectID + ":" + name }

// Subscribe creates a Subscriber, registers it, and returns it. Callers
// must call Unsubscribe when the websocket disconnects to release the
// slot.
func (h *Hub) Subscribe(channelKey string, sendBuffer int) *Subscriber {
	if sendBuffer <= 0 {
		sendBuffer = 32
	}
	s := &Subscriber{
		ChannelKey: channelKey,
		Send:       make(chan []byte, sendBuffer),
	}
	h.mu.Lock()
	if h.channels[channelKey] == nil {
		h.channels[channelKey] = make(map[*Subscriber]struct{})
	}
	h.channels[channelKey][s] = struct{}{}
	h.mu.Unlock()
	return s
}

// Unsubscribe removes a subscriber and closes its send channel exactly
// once. Safe to call from multiple goroutines.
func (h *Hub) Unsubscribe(s *Subscriber) {
	if s == nil || !s.closed.CompareAndSwap(false, true) {
		return
	}
	h.mu.Lock()
	if subs, ok := h.channels[s.ChannelKey]; ok {
		delete(subs, s)
		if len(subs) == 0 {
			delete(h.channels, s.ChannelKey)
		}
	}
	h.mu.Unlock()
	close(s.Send)
}

// Publish broadcasts payload to every subscriber of channelKey. Returns
// the count of subscribers the message was queued to (which may be 0).
// Slow subscribers whose send buffer is full receive a dropped-message
// log line and the publish proceeds — Publish never blocks.
func (h *Hub) Publish(channelKey string, payload map[string]interface{}) (int, error) {
	envelope := map[string]interface{}{
		"channel":   channelKey,
		"timestamp": time.Now().Unix(),
		"payload":   payload,
	}
	data, err := json.Marshal(envelope)
	if err != nil {
		return 0, err
	}

	h.mu.RLock()
	subs := h.channels[channelKey]
	// Snapshot so we can unlock before sending into channels (avoid
	// holding the hub lock while a slow subscriber blocks the buffer).
	snapshot := make([]*Subscriber, 0, len(subs))
	for s := range subs {
		snapshot = append(snapshot, s)
	}
	h.mu.RUnlock()

	delivered := 0
	for _, s := range snapshot {
		select {
		case s.Send <- data:
			delivered++
		default:
			log.Warn().
				Str("channel", channelKey).
				Msg("notify: subscriber buffer full, dropped message")
		}
	}
	atomic.AddInt64(&h.totalPub, 1)
	return delivered, nil
}

// SubscriberCount returns the live subscriber count for a channel.
func (h *Hub) SubscriberCount(channelKey string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.channels[channelKey])
}

// Channels returns a snapshot of the currently-active channel keys with
// their subscriber counts. Used by the admin UI.
func (h *Hub) Channels() map[string]int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make(map[string]int, len(h.channels))
	for k, subs := range h.channels {
		out[k] = len(subs)
	}
	return out
}

// TotalPublishes returns the lifetime publish count for metrics.
func (h *Hub) TotalPublishes() int64 { return atomic.LoadInt64(&h.totalPub) }
