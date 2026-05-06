package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/segmentio/kafka-go"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/idgen"
)

// KafkaBackend consumes from a Kafka topic using consumer groups.
//
// Semantics differences from the others:
//
//   - Kafka has no per-message ack. A message is "acked" implicitly when
//     the consumer offset advances past it. To get at-least-once, we commit
//     offsets manually after each successful handler call.
//
//   - No native delayed redelivery. Retry-with-delay is implemented by
//     blocking the consumer goroutine for `requeueAfter` and then re-reading
//     from where we left off. For short backoffs (< 30s) this is acceptable
//     and keeps the implementation simple. For longer backoffs, v2 should
//     move to topic-chain (a.retry.5s, a.retry.30s, a.dlq) so retries don't
//     pin up a partition.
//
//   - DLQ is a separate topic (<topic>.dlq) produced to on permanent
//     failure. A DLQ row is also inserted into PG for uniform browsing.
//
// Config keys:
//
//	brokers    required — []string of "host:port"
//	topic      required — main topic name
//	groupId    optional — defaults to "runloop-"+queueName
type KafkaBackend struct {
	db       *db.Postgres
	workerID string

	mu       sync.Mutex
	readers  map[string]*kafka.Reader  // key = topic+groupId — consumer
	writers  map[string]*kafka.Writer  // key = brokers-joined
	ackState map[string]*kafka.Message // handle -> message (for commit lookup)
}

func NewKafkaBackend(pg *db.Postgres, workerID string) *KafkaBackend {
	return &KafkaBackend{
		db:       pg,
		workerID: workerID,
		readers:  map[string]*kafka.Reader{},
		writers:  map[string]*kafka.Writer{},
		ackState: map[string]*kafka.Message{},
	}
}

func (k *KafkaBackend) Name() string { return "kafka" }

// ensureTopics creates the main + DLQ topic if missing. Idempotent — the
// broker returns "topic already exists" when it does, which we swallow.
// Defaults to 1 partition / 1 replica — override via backend_config
// "numPartitions" if you need parallelism.
func (k *KafkaBackend) ensureTopics(ctx context.Context, cfg *kafkaCfg, numPartitions int) error {
	if numPartitions <= 0 {
		numPartitions = 1
	}
	conn, err := kafka.DialContext(ctx, "tcp", cfg.Brokers[0])
	if err != nil {
		return fmt.Errorf("kafka dial: %w", err)
	}
	defer conn.Close()

	controller, err := conn.Controller()
	if err != nil {
		return fmt.Errorf("kafka controller: %w", err)
	}
	ctrlConn, err := kafka.DialContext(ctx, "tcp", fmt.Sprintf("%s:%d", controller.Host, controller.Port))
	if err != nil {
		return fmt.Errorf("kafka controller dial: %w", err)
	}
	defer ctrlConn.Close()

	return ctrlConn.CreateTopics(
		kafka.TopicConfig{Topic: cfg.Topic, NumPartitions: numPartitions, ReplicationFactor: 1},
		kafka.TopicConfig{Topic: cfg.DLQTopic, NumPartitions: 1, ReplicationFactor: 1},
	)
}

type kafkaCfg struct {
	Brokers  []string
	Topic    string
	GroupID  string
	DLQTopic string
}

func (k *KafkaBackend) readCfg(q *QueueDef) (*kafkaCfg, error) {
	rawBrokers, _ := q.BackendConfig["brokers"].([]interface{})
	brokers := make([]string, 0, len(rawBrokers))
	for _, b := range rawBrokers {
		if s, ok := b.(string); ok && s != "" {
			brokers = append(brokers, s)
		}
	}
	topic, _ := q.BackendConfig["topic"].(string)
	if len(brokers) == 0 || topic == "" {
		return nil, fmt.Errorf("kafka backend requires 'brokers' ([]string) and 'topic' in backend_config")
	}
	groupID, _ := q.BackendConfig["groupId"].(string)
	if groupID == "" {
		groupID = "runloop-" + q.Name
	}
	return &kafkaCfg{
		Brokers: brokers, Topic: topic, GroupID: groupID,
		DLQTopic: topic + ".dlq",
	}, nil
}

func (k *KafkaBackend) writer(brokers []string) *kafka.Writer {
	key := joinStrings(brokers, ",")
	k.mu.Lock()
	defer k.mu.Unlock()
	if w, ok := k.writers[key]; ok {
		return w
	}
	w := &kafka.Writer{
		Addr:         kafka.TCP(brokers...),
		Balancer:     &kafka.Hash{}, // honor message key for partition stickiness
		RequiredAcks: kafka.RequireAll,
	}
	k.writers[key] = w
	return w
}

func (k *KafkaBackend) reader(cfg *kafkaCfg) *kafka.Reader {
	key := cfg.Topic + "|" + cfg.GroupID
	k.mu.Lock()
	defer k.mu.Unlock()
	if r, ok := k.readers[key]; ok {
		return r
	}
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        cfg.Brokers,
		GroupID:        cfg.GroupID,
		Topic:          cfg.Topic,
		MinBytes:       1,
		MaxBytes:       10e6, // 10MB
		CommitInterval: 0,    // manual commit only (we call CommitMessages)
	})
	k.readers[key] = r
	return r
}

// Enqueue publishes to the main topic. Message key = idempotency key (if
// provided) so messages for the same logical entity land on the same
// partition — gives per-entity order if callers care.
func (k *KafkaBackend) Enqueue(ctx context.Context, q *QueueDef, req EnqueueRequest) (string, error) {
	cfg, err := k.readCfg(q)
	if err != nil {
		return "", err
	}
	// Topics must exist before we can produce. Create-on-demand is safe to
	// call repeatedly — the broker returns an error only when concurrent
	// creates race, which kafka-go retries.
	if err := k.ensureTopics(ctx, cfg, int(asFloat(q.BackendConfig["numPartitions"], 1))); err != nil {
		// Non-fatal: the topic may already exist. Log for debugging.
		log.Debug().Err(err).Str("topic", cfg.Topic).Msg("kafka ensureTopics (may be pre-existing)")
	}
	w := k.writer(cfg.Brokers)

	jobID := idgen.New()
	body, _ := json.Marshal(req.Payload)

	// Kafka headers are []byte; we stringify.
	headers := []kafka.Header{
		{Key: "x-job-id", Value: []byte(jobID)},
		{Key: "x-idemp", Value: []byte(req.IdempotencyKey)},
		{Key: "x-attempts", Value: []byte("0")},
	}
	var msgKey []byte
	if req.IdempotencyKey != "" {
		msgKey = []byte(req.IdempotencyKey)
	} else {
		msgKey = []byte(jobID)
	}

	if err := w.WriteMessages(ctx, kafka.Message{
		Topic:   cfg.Topic,
		Key:     msgKey,
		Value:   body,
		Headers: headers,
		Time:    time.Now(),
	}); err != nil {
		return "", err
	}
	return jobID, nil
}

// Consume is the per-queue read loop. Kafka-go's ReadMessage blocks until
// a message arrives or ctx is cancelled; we serve acks/commits inline.
//
// Concurrency: we intentionally process messages one-at-a-time *within a
// partition* to preserve per-partition order. To get parallelism, scale
// partitions (and thus consumer instances). This matches Kafka's core
// contract and avoids offset-commit hazards.
func (k *KafkaBackend) Consume(ctx context.Context, q *QueueDef, handler Handler) error {
	cfg, err := k.readCfg(q)
	if err != nil {
		return err
	}
	r := k.reader(cfg)

	for {
		msg, err := r.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return err
		}

		m := k.parseMessage(q, &msg)
		k.mu.Lock()
		k.ackState[m.Handle] = &msg
		k.mu.Unlock()

		jobCtx, cancel := context.WithTimeout(ctx, time.Duration(q.VisibilitySec)*time.Second)
		err = handler(jobCtx, m)
		cancel()
		if err != nil {
			log.Debug().Err(err).Str("job", m.ID).Msg("kafka handler returned error")
		}
	}
}

func (k *KafkaBackend) parseMessage(q *QueueDef, m *kafka.Message) *Message {
	handle := fmt.Sprintf("%s:%d:%d", m.Topic, m.Partition, m.Offset)
	out := &Message{
		Handle:    handle,
		QueueName: q.Name,
	}
	_ = json.Unmarshal(m.Value, &out.Payload)

	for _, h := range m.Headers {
		switch h.Key {
		case "x-job-id":
			out.ID = string(h.Value)
		case "x-idemp":
			out.IdempotencyKey = string(h.Value)
		case "x-attempts":
			n, _ := strconv.Atoi(string(h.Value))
			out.Attempts = n + 1
		}
	}
	if out.ID == "" {
		out.ID = handle
	}
	if out.Attempts == 0 {
		out.Attempts = 1
	}
	return out
}

// Ack commits the offset. On Kafka this advances the group's committed
// offset past this message; crash before commit = at-least-once redelivery
// on next startup.
func (k *KafkaBackend) Ack(ctx context.Context, q *QueueDef, handle string) error {
	msg := k.takeAckState(handle)
	if msg == nil {
		return nil
	}
	cfg, err := k.readCfg(q)
	if err != nil {
		return err
	}
	return k.reader(cfg).CommitMessages(ctx, *msg)
}

// Nack republishes the message to the main topic with incremented attempt
// count and then commits the original offset. The in-engine delay here is
// simple but blocks the partition — for v2 switch to topic-chain with
// per-delay retry topics to avoid head-of-line blocking.
func (k *KafkaBackend) Nack(ctx context.Context, q *QueueDef, handle string, requeueAfter time.Duration, lastErr string) error {
	msg := k.takeAckState(handle)
	if msg == nil {
		return nil
	}
	cfg, err := k.readCfg(q)
	if err != nil {
		return err
	}

	// Block briefly if the requested delay is short; otherwise give up and
	// just re-publish immediately. Real long-delay retry needs topic chain.
	if requeueAfter > 0 && requeueAfter <= 30*time.Second {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(requeueAfter):
		}
	}

	// Increment attempts header and re-publish. The header's previous count
	// is read from an attacker-controllable bytestream, so clamp before the
	// int32 cast — a maliciously huge value shouldn't wrap into a negative
	// attempt count and bypass the max-attempts check below.
	attempts := int32(0)
	out := make([]kafka.Header, 0, len(msg.Headers))
	for _, h := range msg.Headers {
		if h.Key == "x-attempts" {
			n, _ := strconv.Atoi(string(h.Value))
			if n < 0 {
				n = 0
			} else if n >= math.MaxInt32 {
				n = math.MaxInt32 - 1
			}
			attempts = int32(n) + 1 //nolint:gosec // bounded above
			continue
		}
		if h.Key == "x-last-error" {
			continue
		}
		out = append(out, h)
	}
	out = append(out,
		kafka.Header{Key: "x-attempts", Value: []byte(strconv.Itoa(int(attempts)))},
		kafka.Header{Key: "x-last-error", Value: []byte(lastErr)},
	)

	if err := k.writer(cfg.Brokers).WriteMessages(ctx, kafka.Message{
		Topic:   cfg.Topic,
		Key:     msg.Key,
		Value:   msg.Value,
		Headers: out,
		Time:    time.Now(),
	}); err != nil {
		return err
	}
	return k.reader(cfg).CommitMessages(ctx, *msg)
}

// DeadLetter writes to <topic>.dlq and commits the origin offset.
func (k *KafkaBackend) DeadLetter(ctx context.Context, q *QueueDef, handle string, reason string) error {
	msg := k.takeAckState(handle)
	if msg == nil {
		return nil
	}
	cfg, err := k.readCfg(q)
	if err != nil {
		return err
	}
	headers := append([]kafka.Header{}, msg.Headers...)
	headers = append(headers,
		kafka.Header{Key: "x-dlq-reason", Value: []byte(reason)},
		kafka.Header{Key: "x-dlq-at", Value: []byte(time.Now().Format(time.RFC3339))},
	)
	if err := k.writer(cfg.Brokers).WriteMessages(ctx, kafka.Message{
		Topic: cfg.DLQTopic, Key: msg.Key, Value: msg.Value, Headers: headers,
	}); err != nil {
		log.Error().Err(err).Msg("kafka DLQ publish failed")
	}
	// Mirror to PG for uniform DLQ browsing.
	_, _ = k.db.Pool.Exec(ctx, `
		INSERT INTO job_queue_items (id, queue_name, project_id, payload, status, attempts, last_error, completed_at)
		VALUES ($1, $2, $3, $4::jsonb, 'DLQ', 0, $5, NOW())
		ON CONFLICT DO NOTHING
	`, idgen.New(), q.Name, q.ProjectID, string(msg.Value), reason)

	return k.reader(cfg).CommitMessages(ctx, *msg)
}

func (k *KafkaBackend) takeAckState(handle string) *kafka.Message {
	k.mu.Lock()
	defer k.mu.Unlock()
	m := k.ackState[handle]
	delete(k.ackState, handle)
	return m
}

func (k *KafkaBackend) Ping(ctx context.Context, cfg map[string]interface{}) error {
	rawBrokers, _ := cfg["brokers"].([]interface{})
	if len(rawBrokers) == 0 {
		return fmt.Errorf("missing brokers")
	}
	first, _ := rawBrokers[0].(string)
	if first == "" {
		return fmt.Errorf("missing brokers")
	}
	conn, err := kafka.DialContext(ctx, "tcp", first)
	if err != nil {
		return err
	}
	return conn.Close()
}

func (k *KafkaBackend) Close() error {
	k.mu.Lock()
	defer k.mu.Unlock()
	for _, r := range k.readers {
		_ = r.Close()
	}
	for _, w := range k.writers {
		_ = w.Close()
	}
	k.readers = map[string]*kafka.Reader{}
	k.writers = map[string]*kafka.Writer{}
	return nil
}

func asFloat(v interface{}, def float64) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return def
}

func joinStrings(ss []string, sep string) string {
	out := ""
	for i, s := range ss {
		if i > 0 {
			out += sep
		}
		out += s
	}
	return out
}
