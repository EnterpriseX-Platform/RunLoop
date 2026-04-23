package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/idgen"
)

// RabbitBackend uses AMQP 0.9.1 with Dead-Letter Exchange (DLX) pattern.
//
// Topology per queue (declared idempotently on first use):
//
//	<exchange>          direct exchange, routing key = queue name
//	<queue>             main work queue, x-dead-letter-exchange = <exchange>.dlx
//	<exchange>.dlx      DLX for permanent failures
//	<queue>.dlq         DLQ bound to <exchange>.dlx
//	<queue>.retry.<ms>  per-TTL retry queue. x-message-ttl = ms,
//	                    dead-letters back to <queue> after TTL expires.
//
// Retry with delay exploits the DLX+TTL trick: AMQP has no native delayed
// redelivery, so we publish the nack'd body to a TTL queue; when the
// message expires, the broker routes it back to the main queue via that
// queue's own DLX binding.
//
// Per-channel ack constraint: the amqp091 library requires acks on the
// same Channel as the original basic.consume. We serve all consume/ack/
// nack for a given (url, queue) through a single shared Channel, and fan
// out handler invocations to worker goroutines.
type RabbitBackend struct {
	db       *db.Postgres
	workerID string

	mu         sync.Mutex
	conns      map[string]*amqp.Connection      // url -> conn
	queueChans map[string]*amqp.Channel         // queueName -> channel (consume+ack on same)
	deliveries map[string]*amqp.Delivery        // handle -> in-flight delivery (for Ack/Nack body lookup)
}

func NewRabbitBackend(pg *db.Postgres, workerID string) *RabbitBackend {
	return &RabbitBackend{
		db:         pg,
		workerID:   workerID,
		conns:      map[string]*amqp.Connection{},
		queueChans: map[string]*amqp.Channel{},
		deliveries: map[string]*amqp.Delivery{},
	}
}

func (r *RabbitBackend) Name() string { return "rabbitmq" }

type rabbitCfg struct {
	URL         string
	Queue       string
	Exchange    string
	Prefetch    int
	DLXExchange string
	DLQQueue    string
	RetryPrefix string
}

func (r *RabbitBackend) readCfg(q *QueueDef) (*rabbitCfg, error) {
	url, _ := q.BackendConfig["url"].(string)
	queueName, _ := q.BackendConfig["queue"].(string)
	if url == "" || queueName == "" {
		return nil, fmt.Errorf("rabbitmq backend requires 'url' and 'queue' in backend_config")
	}
	ex, _ := q.BackendConfig["exchange"].(string)
	if ex == "" {
		ex = "runloop"
	}
	prefetch := q.Concurrency
	if v, ok := q.BackendConfig["prefetch"].(float64); ok && int(v) > 0 {
		prefetch = int(v)
	}
	return &rabbitCfg{
		URL: url, Queue: queueName, Exchange: ex, Prefetch: prefetch,
		DLXExchange: ex + ".dlx",
		DLQQueue:    queueName + ".dlq",
		RetryPrefix: queueName + ".retry.",
	}, nil
}

func (r *RabbitBackend) connect(url string) (*amqp.Connection, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if c, ok := r.conns[url]; ok && !c.IsClosed() {
		return c, nil
	}
	c, err := amqp.Dial(url)
	if err != nil {
		return nil, err
	}
	r.conns[url] = c
	return c, nil
}

// queueChan returns the Channel dedicated to this queue. amqp091 serializes
// operations per-Channel, so concurrent queues need their own Channels to
// avoid "unexpected command received" and "consumer tag reused" errors.
// Consume and Ack/Nack for a given queue MUST go through the same Channel.
func (r *RabbitBackend) queueChan(queueName, url string) (*amqp.Channel, error) {
	r.mu.Lock()
	if ch, ok := r.queueChans[queueName]; ok && !ch.IsClosed() {
		r.mu.Unlock()
		return ch, nil
	}
	r.mu.Unlock()

	conn, err := r.connect(url)
	if err != nil {
		return nil, err
	}
	ch, err := conn.Channel()
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	// Re-check in case of concurrent creation.
	if existing, ok := r.queueChans[queueName]; ok && !existing.IsClosed() {
		r.mu.Unlock()
		_ = ch.Close()
		return existing, nil
	}
	r.queueChans[queueName] = ch
	r.mu.Unlock()
	return ch, nil
}

// declareTopology sets up exchange + queues + DLX bindings. Idempotent.
func (r *RabbitBackend) declareTopology(ch *amqp.Channel, cfg *rabbitCfg) error {
	if err := ch.ExchangeDeclare(cfg.Exchange, "direct", true, false, false, false, nil); err != nil {
		return err
	}
	if err := ch.ExchangeDeclare(cfg.DLXExchange, "direct", true, false, false, false, nil); err != nil {
		return err
	}
	if _, err := ch.QueueDeclare(cfg.Queue, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    cfg.DLXExchange,
		"x-dead-letter-routing-key": cfg.Queue,
	}); err != nil {
		return err
	}
	if err := ch.QueueBind(cfg.Queue, cfg.Queue, cfg.Exchange, false, nil); err != nil {
		return err
	}
	if _, err := ch.QueueDeclare(cfg.DLQQueue, true, false, false, false, nil); err != nil {
		return err
	}
	return ch.QueueBind(cfg.DLQQueue, cfg.Queue, cfg.DLXExchange, false, nil)
}

func (r *RabbitBackend) Enqueue(ctx context.Context, q *QueueDef, req EnqueueRequest) (string, error) {
	cfg, err := r.readCfg(q)
	if err != nil {
		return "", err
	}
	ch, err := r.queueChan(q.Name, cfg.URL)
	if err != nil {
		return "", err
	}
	if err := r.declareTopology(ch, cfg); err != nil {
		return "", err
	}

	jobID := idgen.New()
	body, _ := json.Marshal(req.Payload)
	err = ch.PublishWithContext(ctx, cfg.Exchange, cfg.Queue, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		MessageId:    jobID,
		Timestamp:    time.Now(),
		Body:         body,
		Headers: amqp.Table{
			"x-job-id":   jobID,
			"x-idemp":    req.IdempotencyKey,
			"x-attempts": int32(0),
		},
	})
	if err != nil {
		return "", err
	}
	return jobID, nil
}

func (r *RabbitBackend) Consume(ctx context.Context, q *QueueDef, handler Handler) error {
	cfg, err := r.readCfg(q)
	if err != nil {
		return err
	}
	ch, err := r.queueChan(q.Name, cfg.URL)
	if err != nil {
		return err
	}
	if err := r.declareTopology(ch, cfg); err != nil {
		return err
	}
	if err := ch.Qos(cfg.Prefetch, 0, false); err != nil {
		return err
	}

	deliveries, err := ch.ConsumeWithContext(ctx, cfg.Queue, r.workerID+":"+q.Name, false, false, false, false, nil)
	if err != nil {
		return err
	}

	sem := make(chan struct{}, q.Concurrency)
	var wg sync.WaitGroup
	defer wg.Wait()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case d, ok := <-deliveries:
			if !ok {
				return errors.New("delivery channel closed")
			}
			dCopy := d // keep a non-iterator-reused copy
			m := r.parseDelivery(q, &dCopy)

			r.mu.Lock()
			r.deliveries[m.Handle] = &dCopy
			r.mu.Unlock()

			sem <- struct{}{}
			wg.Add(1)
			go func(m *Message) {
				defer wg.Done()
				defer func() { <-sem }()
				jobCtx, cancel := context.WithTimeout(ctx, time.Duration(q.VisibilitySec)*time.Second)
				defer cancel()

				if err := handler(jobCtx, m); err != nil {
					log.Debug().Err(err).Str("job", m.ID).Msg("rabbit handler returned error")
				}
			}(m)
		}
	}
}

func (r *RabbitBackend) parseDelivery(q *QueueDef, d *amqp.Delivery) *Message {
	m := &Message{
		Handle:    d.MessageId + ":" + strconv.FormatUint(d.DeliveryTag, 10),
		ID:        d.MessageId,
		QueueName: q.Name,
	}
	_ = json.Unmarshal(d.Body, &m.Payload)
	if d.Headers != nil {
		if v, ok := d.Headers["x-idemp"].(string); ok {
			m.IdempotencyKey = v
		}
		attempts := int32(0)
		if v, ok := d.Headers["x-attempts"].(int32); ok {
			attempts = v
		}
		m.Attempts = int(attempts) + 1
	}
	return m
}

func (r *RabbitBackend) popDelivery(handle string) *amqp.Delivery {
	r.mu.Lock()
	defer r.mu.Unlock()
	d := r.deliveries[handle]
	delete(r.deliveries, handle)
	return d
}

func (r *RabbitBackend) Ack(ctx context.Context, q *QueueDef, handle string) error {
	tag, ok := parseTag(handle)
	if !ok {
		return fmt.Errorf("bad handle %q", handle)
	}
	cfg, err := r.readCfg(q)
	if err != nil {
		return err
	}
	ch, err := r.queueChan(q.Name, cfg.URL)
	if err != nil {
		return err
	}
	r.popDelivery(handle)
	return ch.Ack(tag, false)
}

// Nack re-publishes the message to a per-TTL retry queue, then ack's the
// original delivery. When the retry TTL expires, the broker routes the
// message back to the main queue automatically via its DLX binding.
func (r *RabbitBackend) Nack(ctx context.Context, q *QueueDef, handle string, requeueAfter time.Duration, lastErr string) error {
	tag, ok := parseTag(handle)
	if !ok {
		return fmt.Errorf("bad handle %q", handle)
	}
	cfg, err := r.readCfg(q)
	if err != nil {
		return err
	}
	ch, err := r.queueChan(q.Name, cfg.URL)
	if err != nil {
		return err
	}

	delivery := r.popDelivery(handle)
	if delivery == nil {
		// Already processed or lost the reference — just ack to free the slot.
		return ch.Ack(tag, false)
	}

	ttlMs := requeueAfter.Milliseconds()
	if ttlMs < 1 {
		ttlMs = 1
	}
	retryQueue := fmt.Sprintf("%s%d", cfg.RetryPrefix, ttlMs)

	// TTL queues are re-declared per TTL bucket. Declarations are idempotent
	// as long as args match; we always use the same args for the same TTL.
	if _, err := ch.QueueDeclare(retryQueue, true, false, false, false, amqp.Table{
		"x-message-ttl":             ttlMs,
		"x-dead-letter-exchange":    cfg.Exchange,
		"x-dead-letter-routing-key": cfg.Queue,
	}); err != nil {
		return err
	}

	headers := delivery.Headers
	if headers == nil {
		headers = amqp.Table{}
	}
	attempts := int32(0)
	if v, ok := headers["x-attempts"].(int32); ok {
		attempts = v
	}
	headers["x-attempts"] = attempts + 1
	headers["x-last-error"] = lastErr

	if err := ch.PublishWithContext(ctx, "", retryQueue, false, false, amqp.Publishing{
		ContentType:  delivery.ContentType,
		DeliveryMode: amqp.Persistent,
		MessageId:    delivery.MessageId,
		Body:         delivery.Body,
		Headers:      headers,
	}); err != nil {
		return err
	}
	return ch.Ack(tag, false)
}

// DeadLetter ack's the delivery and also records the reason in PG so the
// DLQ browser can surface it (AMQP's DLQ only carries the body).
func (r *RabbitBackend) DeadLetter(ctx context.Context, q *QueueDef, handle string, reason string) error {
	tag, ok := parseTag(handle)
	if !ok {
		return fmt.Errorf("bad handle %q", handle)
	}
	cfg, err := r.readCfg(q)
	if err != nil {
		return err
	}
	ch, err := r.queueChan(q.Name, cfg.URL)
	if err != nil {
		return err
	}

	// Record the DLQ event in PG for cross-backend uniformity.
	var payload []byte
	if d := r.popDelivery(handle); d != nil {
		payload = d.Body
	}
	if payload == nil {
		payload = []byte("{}")
	}
	_, _ = r.db.Pool.Exec(ctx, `
		INSERT INTO job_queue_items (id, queue_name, project_id, payload, status, attempts, last_error, completed_at)
		VALUES ($1, $2, $3, $4::jsonb, 'DLQ', 0, $5, NOW())
		ON CONFLICT DO NOTHING
	`, idgen.New(), q.Name, q.ProjectID, string(payload), reason)

	// basic.nack with requeue=false routes to DLX (declared in topology).
	return ch.Nack(tag, false, false)
}

func (r *RabbitBackend) Ping(ctx context.Context, cfg map[string]interface{}) error {
	url, _ := cfg["url"].(string)
	if url == "" {
		return fmt.Errorf("missing url")
	}
	c, err := amqp.Dial(url)
	if err != nil {
		return err
	}
	return c.Close()
}

func (r *RabbitBackend) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, ch := range r.queueChans {
		_ = ch.Close()
	}
	for _, c := range r.conns {
		_ = c.Close()
	}
	r.conns = map[string]*amqp.Connection{}
	r.queueChans = map[string]*amqp.Channel{}
	return nil
}

// parseTag extracts the AMQP delivery tag from the handle format
// "<messageID>:<deliveryTag>".
func parseTag(handle string) (uint64, bool) {
	for i := len(handle) - 1; i >= 0; i-- {
		if handle[i] == ':' {
			var tag uint64
			_, err := fmt.Sscanf(handle[i+1:], "%d", &tag)
			return tag, err == nil
		}
	}
	return 0, false
}
