package executor

import (
	"context"
	"encoding/json"
	"io"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// WebhookEvent carries the body posted to a WaitWebhook endpoint.
type WebhookEvent struct {
	Headers map[string]string      `json:"headers"`
	Body    map[string]interface{} `json:"body"`
	Raw     string                 `json:"raw"`
}

// WaitRegistry holds channels for flows parked on WAIT_WEBHOOK. Each flow
// awaits at a unique correlation id; the HTTP handler looks the id up and
// forwards the inbound payload, which unblocks the executor.
//
// Safe for concurrent use. A cancelled wait (timeout, flow cancel) must
// call Release so the registry doesn't leak. Stale entries are swept by a
// background janitor.
type WaitRegistry struct {
	mu      sync.Mutex
	waits   map[string]*pendingWait
}

type pendingWait struct {
	ch        chan *WebhookEvent
	createdAt time.Time
	ttl       time.Duration
}

var (
	defaultWaitRegistry     *WaitRegistry
	defaultWaitRegistryOnce sync.Once
)

// DefaultWaitRegistry returns the package-wide singleton. A singleton is
// acceptable here because the waits are in-memory runtime state that
// doesn't need multiple isolated instances.
func DefaultWaitRegistry() *WaitRegistry {
	defaultWaitRegistryOnce.Do(func() {
		defaultWaitRegistry = &WaitRegistry{waits: map[string]*pendingWait{}}
		go defaultWaitRegistry.sweeper()
	})
	return defaultWaitRegistry
}

// Register reserves a slot for `correlationId`. Returns a receive-only
// channel the caller awaits on plus a release func that removes the entry
// (call it in a defer so failed waits don't leak).
func (r *WaitRegistry) Register(correlationId string, ttl time.Duration) (<-chan *WebhookEvent, func()) {
	ch := make(chan *WebhookEvent, 1)
	r.mu.Lock()
	r.waits[correlationId] = &pendingWait{ch: ch, createdAt: time.Now(), ttl: ttl}
	r.mu.Unlock()
	return ch, func() {
		r.mu.Lock()
		delete(r.waits, correlationId)
		r.mu.Unlock()
	}
}

// Deliver sends the event to the waiter, if any. Returns true if the wait
// was present (even if its channel is already full). Called by the HTTP
// handler when a webhook arrives.
func (r *WaitRegistry) Deliver(correlationId string, ev *WebhookEvent) bool {
	r.mu.Lock()
	w, ok := r.waits[correlationId]
	r.mu.Unlock()
	if !ok {
		return false
	}
	// Non-blocking send — channel is buffered size 1.
	select {
	case w.ch <- ev:
	default:
	}
	return true
}

// sweeper periodically removes expired entries. A stale slot is one whose
// Register lifetime has passed without a Release (flow crashed, etc.).
func (r *WaitRegistry) sweeper() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for range t.C {
		now := time.Now()
		r.mu.Lock()
		for id, w := range r.waits {
			if now.Sub(w.createdAt) > w.ttl+30*time.Second {
				delete(r.waits, id)
			}
		}
		r.mu.Unlock()
	}
}

// HTTPHandler is the Fiber handler for POST /webhooks/wait/:id.
// It reads the request body, parses headers, and delivers to the registry.
// If no wait is registered for the id we 404 — this surfaces mistakes like
// posting after the wait timed out.
func (r *WaitRegistry) HTTPHandler(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing correlation id"})
	}

	rawBody := c.Body()
	var body map[string]interface{}
	_ = json.Unmarshal(rawBody, &body)

	headers := map[string]string{}
	c.Request().Header.VisitAll(func(k, v []byte) { headers[string(k)] = string(v) })

	ev := &WebhookEvent{Headers: headers, Body: body, Raw: string(rawBody)}
	if !r.Deliver(id, ev) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":         "no wait registered for this id (expired or never created)",
			"correlationId": id,
		})
	}
	return c.JSON(fiber.Map{"received": true, "correlationId": id})
}

// waitForWebhook is the executor-side entry point — blocks until the
// matching webhook arrives, the context is cancelled, or the timeout
// fires. Returns whatever body was posted so the flow can branch on it.
func waitForWebhook(ctx context.Context, correlationId string, timeout time.Duration) (*WebhookEvent, error) {
	ch, release := DefaultWaitRegistry().Register(correlationId, timeout)
	defer release()

	var timer <-chan time.Time
	if timeout > 0 {
		t := time.NewTimer(timeout)
		defer t.Stop()
		timer = t.C
	}

	select {
	case ev := <-ch:
		return ev, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer:
		return nil, context.DeadlineExceeded
	}
}

// Suppress unused io import check (kept for potential future streaming).
var _ = io.Discard
// Suppress unused log.Logger check.
var _ = log.Logger
