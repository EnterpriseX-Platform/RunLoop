package connector

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MongoDBConnector implements MongoDB operations
type MongoDBConnector struct {
	client   *mongo.Client
	database *mongo.Database
	uri      string
}

// NewMongoDBConnector creates a new MongoDB connector
func NewMongoDBConnector() *MongoDBConnector {
	return &MongoDBConnector{}
}

// Metadata returns connector metadata
func (m *MongoDBConnector) Metadata() ConnectorMetadata {
	return ConnectorMetadata{
		Type:        TypeMongoDB,
		Name:        "MongoDB",
		Description: "Query and manipulate MongoDB documents",
		Category:    CategoryDatabase,
		Icon:        "database",
		Version:     "1.0.0",
		ConfigSchema: ConfigSchema{
			Fields: []ConfigField{
				{
					Name:        "connection_string",
					Type:        "string",
					Label:       "Connection String",
					Description: "MongoDB connection string (mongodb:// or mongodb+srv://)",
					Required:    true,
					Secret:      true,
				},
				{
					Name:        "database",
					Type:        "string",
					Label:       "Database",
					Description: "Default database name",
					Required:    true,
				},
				{
					Name:        "timeout",
					Type:        "number",
					Label:       "Timeout (seconds)",
					Description: "Connection timeout",
					Required:    false,
				},
			},
		},
		SupportsActions: true,
	}
}

// ValidateConfig validates the configuration
func (m *MongoDBConnector) ValidateConfig(cfg map[string]interface{}) error {
	required := []string{"connection_string", "database"}
	for _, field := range required {
		if val, ok := cfg[field].(string); !ok || val == "" {
			return fmt.Errorf("%s is required", field)
		}
	}
	return nil
}

// Initialize initializes the connector
func (m *MongoDBConnector) Initialize(ctx context.Context, cfg map[string]interface{}) error {
	if err := m.ValidateConfig(cfg); err != nil {
		return err
	}

	uri := cfg["connection_string"].(string)
	database := cfg["database"].(string)
	
	m.uri = uri
	
	// Set timeout
	timeout := 10 * time.Second
	if t, ok := cfg["timeout"].(float64); ok && t > 0 {
		timeout = time.Duration(t) * time.Second
	}
	
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	
	// Connect to MongoDB
	clientOptions := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return fmt.Errorf("failed to connect to MongoDB: %w", err)
	}
	
	// Ping to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		return fmt.Errorf("failed to ping MongoDB: %w", err)
	}
	
	m.client = client
	m.database = client.Database(database)
	
	return nil
}

// HealthCheck checks if the connector is healthy
func (m *MongoDBConnector) HealthCheck(ctx context.Context) error {
	if m.client == nil {
		return fmt.Errorf("not initialized")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return m.client.Ping(ctx, nil)
}

// Close closes the connector
func (m *MongoDBConnector) Close() error {
	if m.client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return m.client.Disconnect(ctx)
	}
	return nil
}

// GetActions returns available actions
func (m *MongoDBConnector) GetActions() []ActionDefinition {
	return []ActionDefinition{
		{
			Name:        "find",
			Label:       "Find Documents",
			Description: "Query documents from a collection",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Description: "Collection name",
						Required:    true,
					},
					{
						Name:        "filter",
						Type:        "string",
						Label:       "Filter (JSON)",
						Description: "MongoDB query filter",
						Required:    false,
					},
					{
						Name:        "projection",
						Type:        "string",
						Label:       "Projection (JSON)",
						Description: "Fields to include/exclude",
						Required:    false,
					},
					{
						Name:        "sort",
						Type:        "string",
						Label:       "Sort (JSON)",
						Description: "Sort specification",
						Required:    false,
					},
					{
						Name:        "limit",
						Type:        "number",
						Label:       "Limit",
						Description: "Maximum documents to return",
						Required:    false,
					},
					{
						Name:        "skip",
						Type:        "number",
						Label:       "Skip",
						Description: "Number of documents to skip",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "documents",
						Type:        "string",
						Label:       "Documents (JSON array)",
						Required:    true,
					},
					{
						Name:        "count",
						Type:        "number",
						Label:       "Count",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "find_one",
			Label:       "Find One Document",
			Description: "Query a single document",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "filter",
						Type:        "string",
						Label:       "Filter (JSON)",
						Required:    false,
					},
					{
						Name:        "projection",
						Type:        "string",
						Label:       "Projection (JSON)",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "document",
						Type:        "string",
						Label:       "Document (JSON)",
						Required:    true,
					},
					{
						Name:        "found",
						Type:        "boolean",
						Label:       "Found",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "insert_one",
			Label:       "Insert One Document",
			Description: "Insert a single document",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "document",
						Type:        "string",
						Label:       "Document (JSON)",
						Description: "Document to insert",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "inserted_id",
						Type:        "string",
						Label:       "Inserted ID",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "insert_many",
			Label:       "Insert Many Documents",
			Description: "Insert multiple documents",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "documents",
						Type:        "string",
						Label:       "Documents (JSON array)",
						Description: "Array of documents to insert",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "inserted_count",
						Type:        "number",
						Label:       "Inserted Count",
						Required:    true,
					},
					{
						Name:        "inserted_ids",
						Type:        "string",
						Label:       "Inserted IDs (JSON array)",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "update_one",
			Label:       "Update One Document",
			Description: "Update a single document",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "filter",
						Type:        "string",
						Label:       "Filter (JSON)",
						Description: "Query to match document",
						Required:    true,
					},
					{
						Name:        "update",
						Type:        "string",
						Label:       "Update (JSON)",
						Description: "Update operations ($set, $unset, etc.)",
						Required:    true,
					},
					{
						Name:        "upsert",
						Type:        "boolean",
						Label:       "Upsert",
						Description: "Insert if document doesn't exist",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "matched",
						Type:        "number",
						Label:       "Matched Count",
						Required:    true,
					},
					{
						Name:        "modified",
						Type:        "number",
						Label:       "Modified Count",
						Required:    true,
					},
					{
						Name:        "upserted_id",
						Type:        "string",
						Label:       "Upserted ID",
						Required:    false,
					},
				},
			},
		},
		{
			Name:        "update_many",
			Label:       "Update Many Documents",
			Description: "Update multiple documents",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "filter",
						Type:        "string",
						Label:       "Filter (JSON)",
						Required:    true,
					},
					{
						Name:        "update",
						Type:        "string",
						Label:       "Update (JSON)",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "matched",
						Type:        "number",
						Label:       "Matched Count",
						Required:    true,
					},
					{
						Name:        "modified",
						Type:        "number",
						Label:       "Modified Count",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "delete_one",
			Label:       "Delete One Document",
			Description: "Delete a single document",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "filter",
						Type:        "string",
						Label:       "Filter (JSON)",
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
			Name:        "delete_many",
			Label:       "Delete Many Documents",
			Description: "Delete multiple documents",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "filter",
						Type:        "string",
						Label:       "Filter (JSON)",
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
			Name:        "aggregate",
			Label:       "Aggregate Pipeline",
			Description: "Run an aggregation pipeline",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "pipeline",
						Type:        "string",
						Label:       "Pipeline (JSON array)",
						Description: "Aggregation pipeline stages",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "results",
						Type:        "string",
						Label:       "Results (JSON array)",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "count",
			Label:       "Count Documents",
			Description: "Count documents matching filter",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "collection",
						Type:        "string",
						Label:       "Collection",
						Required:    true,
					},
					{
						Name:        "filter",
						Type:        "string",
						Label:       "Filter (JSON)",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "count",
						Type:        "number",
						Label:       "Count",
						Required:    true,
					},
				},
			},
		},
	}
}

// ExecuteAction executes an action
func (m *MongoDBConnector) ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error) {
	switch action {
	case "find":
		return m.find(ctx, params)
	case "find_one":
		return m.findOne(ctx, params)
	case "insert_one":
		return m.insertOne(ctx, params)
	case "insert_many":
		return m.insertMany(ctx, params)
	case "update_one":
		return m.updateOne(ctx, params)
	case "update_many":
		return m.updateMany(ctx, params)
	case "delete_one":
		return m.deleteOne(ctx, params)
	case "delete_many":
		return m.deleteMany(ctx, params)
	case "aggregate":
		return m.aggregate(ctx, params)
	case "count":
		return m.count(ctx, params)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (m *MongoDBConnector) find(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	filter := bson.M{}
	if f, ok := params["filter"].(string); ok && f != "" {
		if err := json.Unmarshal([]byte(f), &filter); err != nil {
			return nil, fmt.Errorf("invalid filter: %w", err)
		}
	}
	
	opts := options.Find()
	
	if proj, ok := params["projection"].(string); ok && proj != "" {
		var projection bson.M
		if err := json.Unmarshal([]byte(proj), &projection); err == nil {
			opts.SetProjection(projection)
		}
	}
	
	if sort, ok := params["sort"].(string); ok && sort != "" {
		var sortSpec bson.D
		if err := json.Unmarshal([]byte(sort), &sortSpec); err == nil {
			opts.SetSort(sortSpec)
		}
	}
	
	if limit, ok := params["limit"].(float64); ok {
		opts.SetLimit(int64(limit))
	}
	
	if skip, ok := params["skip"].(float64); ok {
		opts.SetSkip(int64(skip))
	}
	
	cursor, err := collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	
	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}
	
	resultsJSON, _ := json.Marshal(results)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"documents": string(resultsJSON),
			"count":     len(results),
		},
	}, nil
}

func (m *MongoDBConnector) findOne(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	filter := bson.M{}
	if f, ok := params["filter"].(string); ok && f != "" {
		if err := json.Unmarshal([]byte(f), &filter); err != nil {
			return nil, fmt.Errorf("invalid filter: %w", err)
		}
	}
	
	opts := options.FindOne()
	
	if proj, ok := params["projection"].(string); ok && proj != "" {
		var projection bson.M
		if err := json.Unmarshal([]byte(proj), &projection); err == nil {
			opts.SetProjection(projection)
		}
	}
	
	var result bson.M
	err := collection.FindOne(ctx, filter, opts).Decode(&result)
	
	if err == mongo.ErrNoDocuments {
		return &ActionResult{
			Success: true,
			Data: map[string]interface{}{
				"document": "{}",
				"found":    false,
			},
		}, nil
	}
	if err != nil {
		return nil, err
	}
	
	resultJSON, _ := json.Marshal(result)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"document": string(resultJSON),
			"found":    true,
		},
	}, nil
}

func (m *MongoDBConnector) insertOne(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	var document interface{}
	if d, ok := params["document"].(string); ok {
		if err := json.Unmarshal([]byte(d), &document); err != nil {
			return nil, fmt.Errorf("invalid document: %w", err)
		}
	}
	
	result, err := collection.InsertOne(ctx, document)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"inserted_id": fmt.Sprintf("%v", result.InsertedID),
		},
	}, nil
}

func (m *MongoDBConnector) insertMany(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	var documents []interface{}
	if d, ok := params["documents"].(string); ok {
		if err := json.Unmarshal([]byte(d), &documents); err != nil {
			return nil, fmt.Errorf("invalid documents: %w", err)
		}
	}
	
	result, err := collection.InsertMany(ctx, documents)
	if err != nil {
		return nil, err
	}
	
	ids := make([]string, len(result.InsertedIDs))
	for i, id := range result.InsertedIDs {
		ids[i] = fmt.Sprintf("%v", id)
	}
	idsJSON, _ := json.Marshal(ids)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"inserted_count": len(result.InsertedIDs),
			"inserted_ids":   string(idsJSON),
		},
	}, nil
}

func (m *MongoDBConnector) updateOne(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	filter := bson.M{}
	if f, ok := params["filter"].(string); ok {
		if err := json.Unmarshal([]byte(f), &filter); err != nil {
			return nil, fmt.Errorf("invalid filter: %w", err)
		}
	}
	
	var update interface{}
	if u, ok := params["update"].(string); ok {
		if err := json.Unmarshal([]byte(u), &update); err != nil {
			return nil, fmt.Errorf("invalid update: %w", err)
		}
	}
	
	opts := options.Update()
	if upsert, ok := params["upsert"].(bool); ok {
		opts.SetUpsert(upsert)
	}
	
	result, err := collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return nil, err
	}
	
	data := map[string]interface{}{
		"matched":  result.MatchedCount,
		"modified": result.ModifiedCount,
	}
	
	if result.UpsertedID != nil {
		data["upserted_id"] = fmt.Sprintf("%v", result.UpsertedID)
	}
	
	return &ActionResult{
		Success: true,
		Data:    data,
	}, nil
}

func (m *MongoDBConnector) updateMany(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	filter := bson.M{}
	if f, ok := params["filter"].(string); ok {
		if err := json.Unmarshal([]byte(f), &filter); err != nil {
			return nil, fmt.Errorf("invalid filter: %w", err)
		}
	}
	
	var update interface{}
	if u, ok := params["update"].(string); ok {
		if err := json.Unmarshal([]byte(u), &update); err != nil {
			return nil, fmt.Errorf("invalid update: %w", err)
		}
	}
	
	result, err := collection.UpdateMany(ctx, filter, update)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"matched":  result.MatchedCount,
			"modified": result.ModifiedCount,
		},
	}, nil
}

func (m *MongoDBConnector) deleteOne(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	filter := bson.M{}
	if f, ok := params["filter"].(string); ok {
		if err := json.Unmarshal([]byte(f), &filter); err != nil {
			return nil, fmt.Errorf("invalid filter: %w", err)
		}
	}
	
	result, err := collection.DeleteOne(ctx, filter)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"deleted": result.DeletedCount,
		},
	}, nil
}

func (m *MongoDBConnector) deleteMany(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	filter := bson.M{}
	if f, ok := params["filter"].(string); ok {
		if err := json.Unmarshal([]byte(f), &filter); err != nil {
			return nil, fmt.Errorf("invalid filter: %w", err)
		}
	}
	
	result, err := collection.DeleteMany(ctx, filter)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"deleted": result.DeletedCount,
		},
	}, nil
}

func (m *MongoDBConnector) aggregate(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	var pipeline interface{}
	if p, ok := params["pipeline"].(string); ok {
		if err := json.Unmarshal([]byte(p), &pipeline); err != nil {
			return nil, fmt.Errorf("invalid pipeline: %w", err)
		}
	}
	
	cursor, err := collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	
	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}
	
	resultsJSON, _ := json.Marshal(results)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"results": string(resultsJSON),
		},
	}, nil
}

func (m *MongoDBConnector) count(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	collection := m.database.Collection(params["collection"].(string))
	
	filter := bson.M{}
	if f, ok := params["filter"].(string); ok && f != "" {
		if err := json.Unmarshal([]byte(f), &filter); err != nil {
			return nil, fmt.Errorf("invalid filter: %w", err)
		}
	}
	
	count, err := collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"count": count,
		},
	}, nil
}
