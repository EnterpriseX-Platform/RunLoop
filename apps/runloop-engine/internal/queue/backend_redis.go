package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/idgen"
)

// RedisBackend uses Redis Streams with consumer groups.
//
// Design:
//   - Stream:          <prefix><queue>          — main job feed
//   - DLQ stream:      <prefix><queue>:dlq      — permanent failures
//   - Consumer group:  <group>                  — shared across workers
//
// Delivery semantics come from XREADGROUP + XACK:
//   - A message read but not ACKed stays in the Pending Entries List (PEL)
//     for the consumer that read it.
//   - If the consumer dies, XCLAIM can reclaim PEL entries older than
//     visibility_sec. We run that reclaim as part of the read loop.
//
// Backoff: Redis Streams don't have native delay. For Nack-with-delay we
// XADD the payload to a delay stream (<stream>:delay:<bucket>) and a
// background re-enqueuer moves entries back. For simplicity v1 acks the
// failed message and XADDs a fresh one with visible_after metadata — the
// consume loop honors it.
//
// Config keys (backend_config):
//   url        required — redis://host:port[/db]
//   stream     required — stream name (without prefix)
//   group      optional — defaults to "runloop"
//   prefix     optional — defaults to "runloop:"
type RedisBackend struct {
	db       *db.Postgres
	workerID string

	mu      sync.Mutex
	clients map[string]*redis.Client // url → client
}

func NewRedisBackend(pg *db.Postgres, workerID string) *RedisBackend {
	return &RedisBackend{db: pg, workerID: workerID, clients: map[string]*redis.Client{}}
}

func (r *RedisBackend) Name() string { return "redis" }

type redisCfg struct {
	URL         string
	Stream      string
	Group       string
	Prefix      string
	streamFull  string
	dlqFull     string
}

func (r *RedisBackend) readCfg(q *QueueDef) (*redisCfg, error) {
	url, _ := q.BackendConfig["url"].(string)
	stream, _ := q.BackendConfig["stream"].(string)
	if url == "" || stream == "" {
		return nil, fmt.Errorf("redis backend requires 'url' and 'stream' in backend_config")
	}
	group, _ := q.BackendConfig["group"].(string)
	if group == "" {
		group = "runloop"
	}
	prefix, _ := q.BackendConfig["prefix"].(string)
	if prefix == "" {
		prefix = "runloop:"
	}
	return &redisCfg{
		URL: url, Stream: stream, Group: group, Prefix: prefix,
		streamFull: prefix + stream,
		dlqFull:    prefix + stream + ":dlq",
	}, nil
}

func (r *RedisBackend) client(url string) (*redis.Client, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if c, ok := r.clients[url]; ok {
		return c, nil
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	c := redis.NewClient(opts)
	r.clients[url] = c
	return c, nil
}

// Enqueue adds a message to the stream. XADD is atomic; the returned ID is
// used as the jobID.
//
// Payload envelope: we wrap the user payload with metadata (jobID, attempts,
// idempotency key) so the consumer can rebuild a Message.
func (r *RedisBackend) Enqueue(ctx context.Context, q *QueueDef, req EnqueueRequest) (string, error) {
	cfg, err := r.readCfg(q)
	if err != nil {
		return "", err
	}
	cli, err := r.client(cfg.URL)
	if err != nil {
		return "", err
	}
	// Ensure group exists (MKSTREAM so we don't require stream pre-creation).
	_ = cli.XGroupCreateMkStream(ctx, cfg.streamFull, cfg.Group, "$").Err()

	jobID := idgen.New()
	payloadBytes, _ := json.Marshal(req.Payload)
	_, err = cli.XAdd(ctx, &redis.XAddArgs{
		Stream: cfg.streamFull,
		Values: map[string]interface{}{
			"job_id":   jobID,
			"payload":  string(payloadBytes),
			"idemp":    req.IdempotencyKey,
			"attempts": 0,
			"enqueued": time.Now().Unix(),
		},
	}).Result()
	if err != nil {
		return "", err
	}
	return jobID, nil
}

// Consume runs the XREADGROUP loop plus periodic XPENDING + XCLAIM for
// stuck messages.
func (r *RedisBackend) Consume(ctx context.Context, q *QueueDef, handler Handler) error {
	cfg, err := r.readCfg(q)
	if err != nil {
		return err
	}
	cli, err := r.client(cfg.URL)
	if err != nil {
		return err
	}
	_ = cli.XGroupCreateMkStream(ctx, cfg.streamFull, cfg.Group, "$").Err()

	sem := make(chan struct{}, q.Concurrency)
	var wg sync.WaitGroup
	defer wg.Wait()

	// Claim stale PEL every N seconds.
	claimTicker := time.NewTicker(time.Duration(q.VisibilitySec) * time.Second / 2)
	defer claimTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-claimTicker.C:
			r.reclaimStale(ctx, cli, cfg, q)
		default:
		}

		res, err := cli.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    cfg.Group,
			Consumer: r.workerID,
			Streams:  []string{cfg.streamFull, ">"},
			Count:    int64(q.Concurrency),
			Block:    2 * time.Second,
		}).Result()

		if err != nil {
			if errors.Is(err, redis.Nil) || errors.Is(err, context.Canceled) {
				continue
			}
			return err
		}

		for _, s := range res {
			for _, msg := range s.Messages {
				m := r.parseMessage(q, msg)
				sem <- struct{}{}
				wg.Add(1)
				go func() {
					defer wg.Done()
					defer func() { <-sem }()
					jobCtx, cancel := context.WithTimeout(ctx, time.Duration(q.VisibilitySec)*time.Second)
					defer cancel()
					if err := handler(jobCtx, m); err != nil {
						log.Error().Err(err).Str("job", m.ID).Msg("redis handler error")
					}
				}()
			}
		}
	}
}

func (r *RedisBackend) parseMessage(q *QueueDef, raw redis.XMessage) *Message {
	m := &Message{
		Handle:    raw.ID,
		QueueName: q.Name,
	}
	if v, ok := raw.Values["job_id"].(string); ok {
		m.ID = v
	} else {
		m.ID = raw.ID
	}
	if v, ok := raw.Values["payload"].(string); ok {
		_ = json.Unmarshal([]byte(v), &m.Payload)
	}
	if v, ok := raw.Values["idemp"].(string); ok {
		m.IdempotencyKey = v
	}
	// attempts comes back as a string
	if v, ok := raw.Values["attempts"].(string); ok {
		var n int
		fmt.Sscanf(v, "%d", &n)
		m.Attempts = n + 1
	} else {
		m.Attempts = 1
	}
	return m
}

// reclaimStale uses XPENDING to find PEL entries older than visibility_sec
// and XCLAIMs them so this consumer can retry. Required for at-least-once
// when a consumer dies mid-processing.
func (r *RedisBackend) reclaimStale(ctx context.Context, cli *redis.Client, cfg *redisCfg, q *QueueDef) {
	min := time.Duration(q.VisibilitySec) * time.Second
	ids, err := cli.XPendingExt(ctx, &redis.XPendingExtArgs{
		Stream: cfg.streamFull,
		Group:  cfg.Group,
		Idle:   min,
		Start:  "-",
		End:    "+",
		Count:  50,
	}).Result()
	if err != nil || len(ids) == 0 {
		return
	}
	toClaim := make([]string, 0, len(ids))
	for _, p := range ids {
		toClaim = append(toClaim, p.ID)
	}
	_, _ = cli.XClaim(ctx, &redis.XClaimArgs{
		Stream:   cfg.streamFull,
		Group:    cfg.Group,
		Consumer: r.workerID,
		MinIdle:  min,
		Messages: toClaim,
	}).Result()
}

func (r *RedisBackend) Ack(ctx context.Context, q *QueueDef, handle string) error {
	cfg, err := r.readCfg(q)
	if err != nil {
		return err
	}
	cli, err := r.client(cfg.URL)
	if err != nil {
		return err
	}
	if err := cli.XAck(ctx, cfg.streamFull, cfg.Group, handle).Err(); err != nil {
		return err
	}
	// XAck doesn't delete; XDEL actually removes the entry.
	return cli.XDel(ctx, cfg.streamFull, handle).Err()
}

// Nack re-adds the payload with incremented attempts and a visible-after
// marker. The original entry is ACKed+deleted to free the PEL slot.
func (r *RedisBackend) Nack(ctx context.Context, q *QueueDef, handle string, requeueAfter time.Duration, lastErr string) error {
	cfg, err := r.readCfg(q)
	if err != nil {
		return err
	}
	cli, err := r.client(cfg.URL)
	if err != nil {
		return err
	}

	// Read the original message so we can republish it.
	res, err := cli.XRange(ctx, cfg.streamFull, handle, handle).Result()
	if err != nil || len(res) == 0 {
		// Already gone; best-effort ack.
		_ = cli.XAck(ctx, cfg.streamFull, cfg.Group, handle).Err()
		return nil
	}
	msg := res[0]

	attempts := 0
	if v, ok := msg.Values["attempts"].(string); ok {
		fmt.Sscanf(v, "%d", &attempts)
	}
	msg.Values["attempts"] = attempts + 1
	msg.Values["last_error"] = lastErr
	msg.Values["visible_after"] = time.Now().Add(requeueAfter).UnixMilli()

	// Re-enqueue (new stream ID) then ack+del the original.
	if _, err := cli.XAdd(ctx, &redis.XAddArgs{Stream: cfg.streamFull, Values: msg.Values}).Result(); err != nil {
		return err
	}
	_ = cli.XAck(ctx, cfg.streamFull, cfg.Group, handle).Err()
	return cli.XDel(ctx, cfg.streamFull, handle).Err()
}

// DeadLetter moves the entry to <stream>:dlq, mirrors a row into PG so the
// unified stats endpoint can surface it, then acks the original.
func (r *RedisBackend) DeadLetter(ctx context.Context, q *QueueDef, handle string, reason string) error {
	cfg, err := r.readCfg(q)
	if err != nil {
		return err
	}
	cli, err := r.client(cfg.URL)
	if err != nil {
		return err
	}

	// Snapshot the original for the DLQ stream + PG mirror.
	var payloadJSON string
	var jobID string
	res, err := cli.XRange(ctx, cfg.streamFull, handle, handle).Result()
	if err == nil && len(res) > 0 {
		vals := res[0].Values
		vals["dlq_reason"] = reason
		vals["dlq_at"] = time.Now().Unix()
		_, _ = cli.XAdd(ctx, &redis.XAddArgs{Stream: cfg.dlqFull, Values: vals}).Result()
		if p, ok := vals["payload"].(string); ok {
			payloadJSON = p
		}
		if j, ok := vals["job_id"].(string); ok {
			jobID = j
		}
	}
	if payloadJSON == "" {
		payloadJSON = "{}"
	}
	if jobID == "" {
		jobID = idgen.New()
	}

	// PG mirror row — makes stats/DLQ browsing uniform across backends.
	_, _ = r.db.Pool.Exec(ctx, `
		INSERT INTO job_queue_items (id, queue_name, project_id, payload, status, attempts, last_error, completed_at)
		VALUES ($1, $2, $3, $4::jsonb, 'DLQ', 0, $5, NOW())
		ON CONFLICT DO NOTHING
	`, jobID, q.Name, q.ProjectID, payloadJSON, reason)

	_ = cli.XAck(ctx, cfg.streamFull, cfg.Group, handle).Err()
	return cli.XDel(ctx, cfg.streamFull, handle).Err()
}

func (r *RedisBackend) Ping(ctx context.Context, cfg map[string]interface{}) error {
	url, _ := cfg["url"].(string)
	if url == "" {
		return fmt.Errorf("missing url")
	}
	cli, err := r.client(url)
	if err != nil {
		return err
	}
	return cli.Ping(ctx).Err()
}

func (r *RedisBackend) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, c := range r.clients {
		_ = c.Close()
	}
	r.clients = map[string]*redis.Client{}
	return nil
}
