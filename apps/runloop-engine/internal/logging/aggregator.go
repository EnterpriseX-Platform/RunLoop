package logging

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/runloop/runloop-engine/internal/db"
)

// LogLevel represents log severity
type LogLevel string

const (
	LevelDebug   LogLevel = "DEBUG"
	LevelInfo    LogLevel = "INFO"
	LevelWarning LogLevel = "WARNING"
	LevelError   LogLevel = "ERROR"
	LevelFatal   LogLevel = "FATAL"
)

// LogEntry represents a single log entry
type LogEntry struct {
	ID            string                 `json:"id"`
	Timestamp     time.Time              `json:"timestamp"`
	Level         LogLevel               `json:"level"`
	Message       string                 `json:"message"`
	
	// Context
	ExecutionID   string                 `json:"execution_id"`
	SchedulerID   string                 `json:"scheduler_id"`
	ProjectID     string                 `json:"project_id"`
	NodeID        string                 `json:"node_id,omitempty"`
	NodeType      string                 `json:"node_type,omitempty"`
	
	// Source
	Source        string                 `json:"source"` // "engine", "executor", "connector", "user"
	Component     string                 `json:"component,omitempty"` // e.g., "slack", "http"
	
	// Structured data
	Fields        map[string]interface{} `json:"fields,omitempty"`
	Error         *ErrorInfo             `json:"error,omitempty"`
	
	// Metadata
	DurationMs    int64                  `json:"duration_ms,omitempty"`
	RetryAttempt  int                    `json:"retry_attempt,omitempty"`
}

// ErrorInfo contains error details
type ErrorInfo struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Stack   string `json:"stack,omitempty"`
	Code    string `json:"code,omitempty"`
}

// LogQuery represents a log search query
type LogQuery struct {
	StartTime     *time.Time
	EndTime       *time.Time
	Levels        []LogLevel
	ExecutionID   string
	SchedulerID   string
	ProjectID     string
	NodeID        string
	Sources       []string
	Components    []string
	SearchQuery   string
	SearchFields  []string
	Limit         int
	Offset        int
	SortBy        string
	SortDesc      bool
}

// LogAggregationResult represents aggregated log data
type LogAggregationResult struct {
	TotalCount    int64                  `json:"total_count"`
	LevelCounts   map[LogLevel]int64     `json:"level_counts"`
	TimeBuckets   []TimeBucket           `json:"time_buckets"`
	Entries       []LogEntry             `json:"entries"`
}

// TimeBucket represents logs aggregated by time
type TimeBucket struct {
	Timestamp time.Time `json:"timestamp"`
	Count     int64     `json:"count"`
	Levels    map[LogLevel]int64 `json:"levels"`
}

// LogAggregator handles log aggregation and search
type LogAggregator struct {
	db           *db.Postgres
	buffer       []LogEntry
	bufferMu     sync.Mutex
	flushTicker  *time.Ticker
	flushChan    chan bool
	wg           sync.WaitGroup
}

// NewLogAggregator creates a new log aggregator
func NewLogAggregator(database *db.Postgres) *LogAggregator {
	la := &LogAggregator{
		db:          database,
		buffer:      make([]LogEntry, 0, 100),
		flushTicker: time.NewTicker(5 * time.Second),
		flushChan:   make(chan bool),
	}
	
	la.wg.Add(1)
	go la.flushLoop()
	
	return la
}

// Stop stops the aggregator
func (la *LogAggregator) Stop() {
	la.flushTicker.Stop()
	close(la.flushChan)
	la.wg.Wait()
	la.Flush()
}

// Log adds a log entry to the buffer
func (la *LogAggregator) Log(entry LogEntry) {
	if entry.ID == "" {
		entry.ID = generateLogID()
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}
	
	la.bufferMu.Lock()
	la.buffer = append(la.buffer, entry)
	shouldFlush := len(la.buffer) >= 100
	la.bufferMu.Unlock()
	
	if shouldFlush {
		la.Flush()
	}
}

// LogBatch adds multiple log entries
func (la *LogAggregator) LogBatch(entries []LogEntry) {
	now := time.Now()
	for i := range entries {
		if entries[i].ID == "" {
			entries[i].ID = generateLogID()
		}
		if entries[i].Timestamp.IsZero() {
			entries[i].Timestamp = now
		}
	}
	
	la.bufferMu.Lock()
	la.buffer = append(la.buffer, entries...)
	shouldFlush := len(la.buffer) >= 100
	la.bufferMu.Unlock()
	
	if shouldFlush {
		la.Flush()
	}
}

// Flush writes buffered logs to database
func (la *LogAggregator) Flush() error {
	la.bufferMu.Lock()
	if len(la.buffer) == 0 {
		la.bufferMu.Unlock()
		return nil
	}
	
	entries := make([]LogEntry, len(la.buffer))
	copy(entries, la.buffer)
	la.buffer = la.buffer[:0]
	la.bufferMu.Unlock()
	
	ctx := context.Background()
	batch := &pgx.Batch{}
	
	for _, entry := range entries {
		fieldsJSON, _ := json.Marshal(entry.Fields)
		errorJSON, _ := json.Marshal(entry.Error)
		
		batch.Queue(`
			INSERT INTO execution_logs (
				id, timestamp, level, message, execution_id, scheduler_id, 
				project_id, node_id, node_type, source, component, 
				fields, error_info, duration_ms, retry_attempt
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		`,
			entry.ID, entry.Timestamp, entry.Level, entry.Message,
			entry.ExecutionID, entry.SchedulerID, entry.ProjectID,
			entry.NodeID, entry.NodeType, entry.Source, entry.Component,
			fieldsJSON, errorJSON, entry.DurationMs, entry.RetryAttempt,
		)
	}
	
	br := la.db.Pool.SendBatch(ctx, batch)
	defer br.Close()
	
	for i := 0; i < len(entries); i++ {
		_, err := br.Exec()
		if err != nil {
			return fmt.Errorf("failed to insert log entry %d: %w", i, err)
		}
	}
	
	return br.Close()
}

// Search searches logs based on query
func (la *LogAggregator) Search(ctx context.Context, query LogQuery) (*LogAggregationResult, error) {
	whereClause, args := la.buildWhereClause(query)
	
	var totalCount int64
	countQuery := "SELECT COUNT(*) FROM execution_logs " + whereClause
	err := la.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount)
	if err != nil {
		return nil, fmt.Errorf("failed to count logs: %w", err)
	}
	
	levelCounts, err := la.getLevelCounts(ctx, whereClause, args)
	if err != nil {
		return nil, err
	}
	
	var timeBuckets []TimeBucket
	if query.StartTime != nil && query.EndTime != nil {
		timeBuckets, err = la.getTimeBuckets(ctx, *query.StartTime, *query.EndTime, whereClause, args)
		if err != nil {
			return nil, err
		}
	}
	
	entries, err := la.getEntries(ctx, query, whereClause, args)
	if err != nil {
		return nil, err
	}
	
	return &LogAggregationResult{
		TotalCount:  totalCount,
		LevelCounts: levelCounts,
		TimeBuckets: timeBuckets,
		Entries:     entries,
	}, nil
}

func (la *LogAggregator) buildWhereClause(query LogQuery) (string, []interface{}) {
	var conditions []string
	var args []interface{}
	argCount := 0
	
	addCondition := func(field string, value interface{}) {
		argCount++
		conditions = append(conditions, fmt.Sprintf("%s = $%d", field, argCount))
		args = append(args, value)
	}
	
	if query.ExecutionID != "" {
		addCondition("execution_id", query.ExecutionID)
	}
	if query.SchedulerID != "" {
		addCondition("scheduler_id", query.SchedulerID)
	}
	if query.ProjectID != "" {
		addCondition("project_id", query.ProjectID)
	}
	if query.NodeID != "" {
		addCondition("node_id", query.NodeID)
	}
	if len(query.Levels) > 0 {
		placeholders := make([]string, len(query.Levels))
		for i, level := range query.Levels {
			argCount++
			placeholders[i] = fmt.Sprintf("$%d", argCount)
			args = append(args, level)
		}
		conditions = append(conditions, fmt.Sprintf("level IN (%s)", strings.Join(placeholders, ",")))
	}
	if query.StartTime != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("timestamp >= $%d", argCount))
		args = append(args, *query.StartTime)
	}
	if query.EndTime != nil {
		argCount++
		conditions = append(conditions, fmt.Sprintf("timestamp <= $%d", argCount))
		args = append(args, *query.EndTime)
	}
	if query.SearchQuery != "" {
		argCount++
		conditions = append(conditions, fmt.Sprintf("message ILIKE $%d", argCount))
		args = append(args, "%"+query.SearchQuery+"%")
	}
	
	if len(conditions) == 0 {
		return "", args
	}
	
	return "WHERE " + strings.Join(conditions, " AND "), args
}

func (la *LogAggregator) getLevelCounts(ctx context.Context, whereClause string, args []interface{}) (map[LogLevel]int64, error) {
	query := "SELECT level, COUNT(*) FROM execution_logs " + whereClause + " GROUP BY level"
	
	rows, err := la.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	counts := make(map[LogLevel]int64)
	for rows.Next() {
		var level LogLevel
		var count int64
		if err := rows.Scan(&level, &count); err != nil {
			return nil, err
		}
		counts[level] = count
	}
	
	return counts, rows.Err()
}

func (la *LogAggregator) getTimeBuckets(ctx context.Context, start, end time.Time, whereClause string, args []interface{}) ([]TimeBucket, error) {
	duration := end.Sub(start)
	var bucketSize string
	
	switch {
	case duration <= time.Hour:
		bucketSize = "1 minute"
	case duration <= 24*time.Hour:
		bucketSize = "1 hour"
	default:
		bucketSize = "1 day"
	}
	
	query := fmt.Sprintf(`
		SELECT date_trunc('%s', timestamp) as bucket, COUNT(*), level
		FROM execution_logs %s
		GROUP BY bucket, level ORDER BY bucket
	`, bucketSize, whereClause)
	
	rows, err := la.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	bucketMap := make(map[time.Time]*TimeBucket)
	for rows.Next() {
		var bucket time.Time
		var count int64
		var level LogLevel
		if err := rows.Scan(&bucket, &count, &level); err != nil {
			return nil, err
		}
		
		if _, exists := bucketMap[bucket]; !exists {
			bucketMap[bucket] = &TimeBucket{
				Timestamp: bucket,
				Levels:    make(map[LogLevel]int64),
			}
		}
		
		bucketMap[bucket].Count += count
		bucketMap[bucket].Levels[level] = count
	}
	
	var buckets []TimeBucket
	for _, b := range bucketMap {
		buckets = append(buckets, *b)
	}
	
	return buckets, rows.Err()
}

func (la *LogAggregator) getEntries(ctx context.Context, query LogQuery, whereClause string, args []interface{}) ([]LogEntry, error) {
	sortField := "timestamp"
	if query.SortBy != "" {
		sortField = query.SortBy
	}
	sortOrder := "ASC"
	if query.SortDesc {
		sortOrder = "DESC"
	}
	
	limit := query.Limit
	if limit == 0 {
		limit = 100
	}
	
	queryStr := fmt.Sprintf(`
		SELECT id, timestamp, level, message, execution_id, scheduler_id,
			project_id, node_id, node_type, source, component,
			fields, error_info, duration_ms, retry_attempt
		FROM execution_logs %s ORDER BY %s %s LIMIT %d OFFSET %d
	`, whereClause, sortField, sortOrder, limit, query.Offset)
	
	rows, err := la.db.Pool.Query(ctx, queryStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var entries []LogEntry
	for rows.Next() {
		var entry LogEntry
		var fieldsJSON, errorJSON []byte
		
		err := rows.Scan(
			&entry.ID, &entry.Timestamp, &entry.Level, &entry.Message,
			&entry.ExecutionID, &entry.SchedulerID, &entry.ProjectID,
			&entry.NodeID, &entry.NodeType, &entry.Source, &entry.Component,
			&fieldsJSON, &errorJSON, &entry.DurationMs, &entry.RetryAttempt,
		)
		if err != nil {
			return nil, err
		}
		
		if len(fieldsJSON) > 0 {
			json.Unmarshal(fieldsJSON, &entry.Fields)
		}
		if len(errorJSON) > 0 {
			json.Unmarshal(errorJSON, &entry.Error)
		}
		
		entries = append(entries, entry)
	}
	
	return entries, rows.Err()
}

func (la *LogAggregator) flushLoop() {
	defer la.wg.Done()
	
	for {
		select {
		case <-la.flushTicker.C:
			la.Flush()
		case <-la.flushChan:
			return
		}
	}
}

func generateLogID() string {
	return fmt.Sprintf("log_%d", time.Now().UnixNano())
}
