// Package tracing provides lightweight trace_id propagation for RunLoop.
//
// A full OpenTelemetry integration is overkill for a single-service scheduler;
// instead we generate a trace_id per inbound request (or reuse an incoming
// `X-Trace-ID` header), stuff it into the request context, and expose it via
// zerolog context so every structured log line inherits it automatically.
package tracing

import (
	"context"
	"crypto/rand"
	"encoding/hex"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type traceCtxKey struct{}

// HeaderName is the inbound/outbound trace header.
const HeaderName = "X-Trace-ID"

// NewID generates a new 16-byte hex trace id.
func NewID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// FromContext returns the trace id stored in ctx, or "" if none.
func FromContext(ctx context.Context) string {
	if v, ok := ctx.Value(traceCtxKey{}).(string); ok {
		return v
	}
	return ""
}

// WithID returns a new context carrying the given trace id.
func WithID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, traceCtxKey{}, id)
}

// Middleware is a Fiber middleware that ensures every request has a trace id,
// stores it in Locals for handlers to read, and echoes it on the response.
func Middleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Get(HeaderName)
		if id == "" {
			id = NewID()
		}
		c.Locals("trace_id", id)
		c.Response().Header.Set(HeaderName, id)

		// Attach a logger scoped to this trace id so handlers can use it.
		l := log.With().Str("trace_id", id).Logger()
		c.Locals("logger", &l)

		return c.Next()
	}
}

// TraceLogger returns a zerolog child logger with the request's trace id, or
// the base logger if none is set.
func TraceLogger(c *fiber.Ctx) *zerolog.Logger {
	if l, ok := c.Locals("logger").(*zerolog.Logger); ok {
		return l
	}
	return &log.Logger
}
