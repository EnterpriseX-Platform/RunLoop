package connector

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisConnector implements Redis operations
type RedisConnector struct {
	client *redis.Client
	addr   string
}

// NewRedisConnector creates a new Redis connector
func NewRedisConnector() *RedisConnector {
	return &RedisConnector{}
}

// Metadata returns connector metadata
func (r *RedisConnector) Metadata() ConnectorMetadata {
	return ConnectorMetadata{
		Type:        TypeRedis,
		Name:        "Redis",
		Description: "Store and retrieve data from Redis",
		Category:    CategoryDatabase,
		Icon:        "database",
		Version:     "1.0.0",
		ConfigSchema: ConfigSchema{
			Fields: []ConfigField{
				{
					Name:        "host",
					Type:        "string",
					Label:       "Host",
					Description: "Redis server hostname",
					Required:    true,
				},
				{
					Name:        "port",
					Type:        "number",
					Label:       "Port",
					Description: "Redis server port (default: 6379)",
					Required:    false,
				},
				{
					Name:        "password",
					Type:        "string",
					Label:       "Password",
					Description: "Redis password (if required)",
					Required:    false,
					Secret:      true,
				},
				{
					Name:        "database",
					Type:        "number",
					Label:       "Database",
					Description: "Redis database number (0-15)",
					Required:    false,
				},
				{
					Name:        "use_tls",
					Type:        "boolean",
					Label:       "Use TLS",
					Description: "Enable TLS/SSL connection",
					Required:    false,
				},
				{
					Name:        "cluster",
					Type:        "boolean",
					Label:       "Cluster Mode",
					Description: "Connect to Redis Cluster",
					Required:    false,
				},
				{
					Name:        "nodes",
					Type:        "string",
					Label:       "Cluster Nodes",
					Description: "Comma-separated list of cluster nodes (host:port)",
					Required:    false,
				},
			},
		},
		SupportsActions: true,
	}
}

// ValidateConfig validates the configuration
func (r *RedisConnector) ValidateConfig(cfg map[string]interface{}) error {
	if val, ok := cfg["host"].(string); !ok || val == "" {
		return fmt.Errorf("host is required")
	}
	return nil
}

// Initialize initializes the connector
func (r *RedisConnector) Initialize(ctx context.Context, cfg map[string]interface{}) error {
	if err := r.ValidateConfig(cfg); err != nil {
		return err
	}

	host := cfg["host"].(string)
	port := "6379"
	if p, ok := cfg["port"].(float64); ok {
		port = fmt.Sprintf("%.0f", p)
	}
	
	addr := fmt.Sprintf("%s:%s", host, port)
	r.addr = addr
	
	opts := &redis.Options{
		Addr: addr,
	}
	
	if password, ok := cfg["password"].(string); ok && password != "" {
		opts.Password = password
	}
	
	if db, ok := cfg["database"].(float64); ok {
		opts.DB = int(db)
	}
	
	if useTLS, ok := cfg["use_tls"].(bool); ok && useTLS {
		opts.TLSConfig = &tls.Config{
			InsecureSkipVerify: false,
		}
	}
	
	// Check if cluster mode
	if isCluster, ok := cfg["cluster"].(bool); ok && isCluster {
		// Cluster mode would use redis.NewClusterClient
		// For now, use standalone
		r.client = redis.NewClient(opts)
	} else {
		r.client = redis.NewClient(opts)
	}
	
	// Test connection
	if err := r.client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to Redis: %w", err)
	}
	
	return nil
}

// HealthCheck checks if the connector is healthy
func (r *RedisConnector) HealthCheck(ctx context.Context) error {
	if r.client == nil {
		return fmt.Errorf("not initialized")
	}
	return r.client.Ping(ctx).Err()
}

// Close closes the connector
func (r *RedisConnector) Close() error {
	if r.client != nil {
		return r.client.Close()
	}
	return nil
}

// GetActions returns available actions
func (r *RedisConnector) GetActions() []ActionDefinition {
	return []ActionDefinition{
		{
			Name:        "get",
			Label:       "Get Value",
			Description: "Get a value by key",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "key",
						Type:        "string",
						Label:       "Key",
						Description: "Redis key",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "value",
						Type:        "string",
						Label:       "Value",
						Required:    true,
					},
					{
						Name:        "exists",
						Type:        "boolean",
						Label:       "Exists",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "set",
			Label:       "Set Value",
			Description: "Set a key-value pair",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "key",
						Type:        "string",
						Label:       "Key",
						Required:    true,
					},
					{
						Name:        "value",
						Type:        "string",
						Label:       "Value",
						Required:    true,
					},
					{
						Name:        "ttl",
						Type:        "number",
						Label:       "TTL (seconds)",
						Description: "Time to live in seconds (0 = no expiration)",
						Required:    false,
					},
					{
						Name:        "only_if_not_exists",
						Type:        "boolean",
						Label:       "Only if not exists (NX)",
						Description: "Only set if key doesn't exist",
						Required:    false,
					},
					{
						Name:        "only_if_exists",
						Type:        "boolean",
						Label:       "Only if exists (XX)",
						Description: "Only set if key exists",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "success",
						Type:        "boolean",
						Label:       "Success",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "delete",
			Label:       "Delete Key",
			Description: "Delete one or more keys",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "keys",
						Type:        "string",
						Label:       "Keys",
						Description: "Comma-separated list of keys to delete",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "deleted",
						Type:        "number",
						Label:       "Deleted Count",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "exists",
			Label:       "Check Exists",
			Description: "Check if keys exist",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "keys",
						Type:        "string",
						Label:       "Keys",
						Description: "Comma-separated list of keys",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "exists",
						Type:        "number",
						Label:       "Existing Count",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "expire",
			Label:       "Set Expiration",
			Description: "Set TTL on a key",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "key",
						Type:        "string",
						Label:       "Key",
						Required:    true,
					},
					{
						Name:        "seconds",
						Type:        "number",
						Label:       "Seconds",
						Description: "TTL in seconds",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "success",
						Type:        "boolean",
						Label:       "Success",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "list_push",
			Label:       "List Push",
			Description: "Push values to a list (LPUSH/RPUSH)",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "key",
						Type:        "string",
						Label:       "Key",
						Required:    true,
					},
					{
						Name:        "values",
						Type:        "string",
						Label:       "Values (JSON array)",
						Description: "Array of values to push",
						Required:    true,
					},
					{
						Name:        "side",
						Type:        "select",
						Label:       "Side",
						Description: "Which side to push to",
						Required:    false,
						Options:     []string{"left", "right"},
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "length",
						Type:        "number",
						Label:       "List Length",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "list_range",
			Label:       "List Range",
			Description: "Get a range of elements from a list",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "key",
						Type:        "string",
						Label:       "Key",
						Required:    true,
					},
					{
						Name:        "start",
						Type:        "number",
						Label:       "Start Index",
						Description: "Start index (0-based, inclusive)",
						Required:    false,
					},
					{
						Name:        "stop",
						Type:        "number",
						Label:       "Stop Index",
						Description: "Stop index (inclusive, -1 for last)",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "values",
						Type:        "string",
						Label:       "Values (JSON array)",
						Required:    true,
					},
					{
						Name:        "length",
						Type:        "number",
						Label:       "List Length",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "hash_set",
			Label:       "Hash Set",
			Description: "Set fields in a hash",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "key",
						Type:        "string",
						Label:       "Key",
						Required:    true,
					},
					{
						Name:        "fields",
						Type:        "string",
						Label:       "Fields (JSON object)",
						Description: "Object with field-value pairs",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "added",
						Type:        "number",
						Label:       "Fields Added",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "hash_get",
			Label:       "Hash Get",
			Description: "Get fields from a hash",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "key",
						Type:        "string",
						Label:       "Key",
						Required:    true,
					},
					{
						Name:        "fields",
						Type:        "string",
						Label:       "Fields (JSON array)",
						Description: "Array of field names to get",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "values",
						Type:        "string",
						Label:       "Values (JSON object)",
						Required:    true,
					},
				},
			},
		},
	}
}

// ExecuteAction executes an action
func (r *RedisConnector) ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error) {
	switch action {
	case "get":
		return r.get(ctx, params)
	case "set":
		return r.set(ctx, params)
	case "delete":
		return r.delete(ctx, params)
	case "exists":
		return r.exists(ctx, params)
	case "expire":
		return r.expire(ctx, params)
	case "list_push":
		return r.listPush(ctx, params)
	case "list_range":
		return r.listRange(ctx, params)
	case "hash_set":
		return r.hashSet(ctx, params)
	case "hash_get":
		return r.hashGet(ctx, params)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (r *RedisConnector) get(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	key := params["key"].(string)
	
	val, err := r.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return &ActionResult{
			Success: true,
			Data: map[string]interface{}{
				"value":  "",
				"exists": false,
			},
		}, nil
	}
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"value":  val,
			"exists": true,
		},
	}, nil
}

func (r *RedisConnector) set(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	key := params["key"].(string)
	value := params["value"].(string)
	
	// Handle TTL
	var ttl time.Duration = 0
	if ttlSecs, ok := params["ttl"].(float64); ok && ttlSecs > 0 {
		ttl = time.Duration(ttlSecs) * time.Second
	}
	
	var err error
	var status string
	
	// Handle NX/XX
	onlyNX, _ := params["only_if_not_exists"].(bool)
	onlyXX, _ := params["only_if_exists"].(bool)
	
	if onlyNX {
		var ok bool
		ok, err = r.client.SetNX(ctx, key, value, ttl).Result()
		if ok {
			status = "OK"
		}
	} else if onlyXX {
		var ok bool
		ok, err = r.client.SetXX(ctx, key, value, ttl).Result()
		if ok {
			status = "OK"
		}
	} else if ttl > 0 {
		status, err = r.client.Set(ctx, key, value, ttl).Result()
	} else {
		status, err = r.client.Set(ctx, key, value, 0).Result()
	}
	
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: status == "OK" || status == "" || status == "true",
		Data: map[string]interface{}{
			"success": status == "OK" || status == "" || status == "true",
		},
	}, nil
}

func (r *RedisConnector) delete(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	keysStr := params["keys"].(string)
	keys := splitComma(keysStr)
	
	deleted, err := r.client.Del(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"deleted": deleted,
		},
	}, nil
}

func (r *RedisConnector) exists(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	keysStr := params["keys"].(string)
	keys := splitComma(keysStr)
	
	exists, err := r.client.Exists(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"exists": exists,
		},
	}, nil
}

func (r *RedisConnector) expire(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	key := params["key"].(string)
	seconds := int64(params["seconds"].(float64))
	
	success, err := r.client.Expire(ctx, key, time.Duration(seconds)*time.Second).Result()
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: success,
		Data: map[string]interface{}{
			"success": success,
		},
	}, nil
}

func (r *RedisConnector) listPush(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	key := params["key"].(string)
	valuesStr := params["values"].(string)
	
	var values []interface{}
	if err := json.Unmarshal([]byte(valuesStr), &values); err != nil {
		return nil, fmt.Errorf("invalid values JSON: %w", err)
	}
	
	side := "right"
	if s, ok := params["side"].(string); ok && s != "" {
		side = s
	}
	
	var length int64
	var err error
	
	if side == "left" {
		length, err = r.client.LPush(ctx, key, values...).Result()
	} else {
		length, err = r.client.RPush(ctx, key, values...).Result()
	}
	
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"length": length,
		},
	}, nil
}

func (r *RedisConnector) listRange(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	key := params["key"].(string)
	
	start := int64(0)
	if s, ok := params["start"].(float64); ok {
		start = int64(s)
	}
	
	stop := int64(-1)
	if s, ok := params["stop"].(float64); ok {
		stop = int64(s)
	}
	
	vals, err := r.client.LRange(ctx, key, start, stop).Result()
	if err != nil {
		return nil, err
	}
	
	length, _ := r.client.LLen(ctx, key).Result()
	
	valsJSON, _ := json.Marshal(vals)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"values": string(valsJSON),
			"length": length,
		},
	}, nil
}

func (r *RedisConnector) hashSet(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	key := params["key"].(string)
	fieldsStr := params["fields"].(string)
	
	var fields map[string]interface{}
	if err := json.Unmarshal([]byte(fieldsStr), &fields); err != nil {
		return nil, fmt.Errorf("invalid fields JSON: %w", err)
	}
	
	values := make([]interface{}, 0, len(fields)*2)
	for k, v := range fields {
		values = append(values, k, fmt.Sprintf("%v", v))
	}
	
	added, err := r.client.HSet(ctx, key, values...).Result()
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"added": added,
		},
	}, nil
}

func (r *RedisConnector) hashGet(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	key := params["key"].(string)
	
	result := make(map[string]string)
	
	if fieldsStr, ok := params["fields"].(string); ok && fieldsStr != "" {
		var fields []string
		if err := json.Unmarshal([]byte(fieldsStr), &fields); err != nil {
			return nil, fmt.Errorf("invalid fields JSON: %w", err)
		}
		vals, err := r.client.HMGet(ctx, key, fields...).Result()
		if err != nil {
			return nil, err
		}
		for i, field := range fields {
			if i < len(vals) && vals[i] != nil {
				result[field] = fmt.Sprintf("%v", vals[i])
			}
		}
	} else {
		var err error
		result, err = r.client.HGetAll(ctx, key).Result()
		if err != nil {
			return nil, err
		}
	}
	
	resultJSON, _ := json.Marshal(result)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"values": string(resultJSON),
		},
	}, nil
}
