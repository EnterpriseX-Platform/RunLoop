package connector

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	_ "github.com/lib/pq"
	_ "github.com/go-sql-driver/mysql"
)

// DatabaseConnector implements SQL database operations
type DatabaseConnector struct {
	db       *sql.DB
	dbType   string
	connStr  string
}

// NewDatabaseConnector creates a new database connector
func NewDatabaseConnector() *DatabaseConnector {
	return &DatabaseConnector{}
}

// Metadata returns connector metadata
func (d *DatabaseConnector) Metadata() ConnectorMetadata {
	return ConnectorMetadata{
		Type:        TypePostgres, // Using postgres as base type
		Name:        "Database (SQL)",
		Description: "Execute SQL queries on PostgreSQL, MySQL databases",
		Category:    CategoryDatabase,
		Icon:        "database",
		Version:     "1.0.0",
		ConfigSchema: ConfigSchema{
			Fields: []ConfigField{
				{
					Name:        "type",
					Type:        "select",
					Label:       "Database Type",
					Description: "Type of database",
					Required:    true,
					Options:     []string{"postgresql", "mysql"},
				},
				{
					Name:        "host",
					Type:        "string",
					Label:       "Host",
					Description: "Database server hostname",
					Required:    true,
				},
				{
					Name:        "port",
					Type:        "number",
					Label:       "Port",
					Description: "Database server port (default: 5432 for PG, 3306 for MySQL)",
					Required:    false,
				},
				{
					Name:        "database",
					Type:        "string",
					Label:       "Database Name",
					Description: "Database/schema name",
					Required:    true,
				},
				{
					Name:        "username",
					Type:        "string",
					Label:       "Username",
					Description: "Database username",
					Required:    true,
				},
				{
					Name:        "password",
					Type:        "string",
					Label:       "Password",
					Description: "Database password",
					Required:    true,
					Secret:      true,
				},
				{
					Name:        "ssl_mode",
					Type:        "select",
					Label:       "SSL Mode",
					Description: "SSL connection mode (PostgreSQL only)",
					Required:    false,
					Options:     []string{"disable", "require", "verify-ca", "verify-full"},
				},
				{
					Name:        "timeout",
					Type:        "number",
					Label:       "Query Timeout (seconds)",
					Description: "Maximum query execution time",
					Required:    false,
				},
			},
		},
		SupportsActions: true,
	}
}

// normalizeDBType collapses the various names callers use ("postgres",
// "postgresql", "pg", "mysql") into a single canonical value used internally.
// Returns "" for unsupported types.
func normalizeDBType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "postgres", "postgresql", "pg":
		return "postgresql"
	case "mysql", "mariadb":
		return "mysql"
	}
	return ""
}

// driverName maps the canonical type to the database/sql driver name actually
// registered by the imported driver package.
func driverName(dbType string) string {
	if dbType == "postgresql" {
		return "postgres" // lib/pq registers as "postgres"
	}
	return dbType
}

// ValidateConfig validates the configuration. Accepts both snake_case
// canonical names and the camelCase variants emitted by the flow editor
// UI (e.g. dbType, useConnectionString, connectionString).
func (d *DatabaseConnector) ValidateConfig(config map[string]interface{}) error {
	// Connection-string mode short-circuits the per-field requirements.
	if useConnStr := pickBool(config, false, "use_connection_string", "useConnectionString"); useConnStr {
		if pickStr(config, "connection_string", "connectionString", "dsn") == "" {
			return fmt.Errorf("connection_string is required when use_connection_string=true")
		}
		if pickStr(config, "type", "dbType", "db_type") == "" {
			return fmt.Errorf("type is required (postgres or mysql)")
		}
		return nil
	}

	checks := []struct {
		label   string
		aliases []string
	}{
		{"type", []string{"type", "dbType", "db_type"}},
		{"host", []string{"host", "hostname"}},
		{"database", []string{"database", "dbName", "db_name", "name"}},
		{"username", []string{"username", "user"}},
		{"password", []string{"password", "pass"}},
	}
	for _, c := range checks {
		if pickStr(config, c.aliases...) == "" {
			return fmt.Errorf("%s is required", c.label)
		}
	}

	rawType := pickStr(config, "type", "dbType", "db_type")
	if normalizeDBType(rawType) == "" {
		return fmt.Errorf("unsupported database type: %s (supported: postgres, postgresql, pg, mysql, mariadb)", rawType)
	}

	return nil
}

// Initialize initializes the connector
func (d *DatabaseConnector) Initialize(ctx context.Context, config map[string]interface{}) error {
	if err := d.ValidateConfig(config); err != nil {
		return err
	}

	rawType := pickStr(config, "type", "dbType", "db_type")
	d.dbType = normalizeDBType(rawType)
	// Re-write the canonical key so downstream buildConnectionString reads
	// it from the standard location regardless of which alias was used.
	config["type"] = d.dbType
	d.connStr = d.buildConnectionString(config)

	db, err := sql.Open(driverName(d.dbType), d.connStr)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	
	d.db = db
	
	// Test connection
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}
	
	return nil
}

// HealthCheck checks if the connector is healthy
func (d *DatabaseConnector) HealthCheck(ctx context.Context) error {
	if d.db == nil {
		return fmt.Errorf("not initialized")
	}
	return d.db.PingContext(ctx)
}

// Close closes the connector
func (d *DatabaseConnector) Close() error {
	if d.db != nil {
		return d.db.Close()
	}
	return nil
}

// GetActions returns available actions
func (d *DatabaseConnector) GetActions() []ActionDefinition {
	return []ActionDefinition{
		{
			Name:        "query",
			Label:       "Execute Query",
			Description: "Execute a SELECT query and return results",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "sql",
						Type:        "string",
						Label:       "SQL Query",
						Description: "SELECT query to execute",
						Required:    true,
					},
					{
						Name:        "params",
						Type:        "string",
						Label:       "Query Parameters (JSON array)",
						Description: "Parameters for parameterized queries",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "rows",
						Type:        "string",
						Label:       "Result Rows (JSON)",
						Required:    true,
					},
					{
						Name:        "rowCount",
						Type:        "number",
						Label:       "Row Count",
						Required:    true,
					},
					{
						Name:        "columns",
						Type:        "string",
						Label:       "Column Names (JSON array)",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "execute",
			Label:       "Execute Statement",
			Description: "Execute INSERT, UPDATE, DELETE, or DDL statements",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "sql",
						Type:        "string",
						Label:       "SQL Statement",
						Description: "SQL statement to execute",
						Required:    true,
					},
					{
						Name:        "params",
						Type:        "string",
						Label:       "Parameters (JSON array)",
						Description: "Parameters for parameterized statements",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "rowsAffected",
						Type:        "number",
						Label:       "Rows Affected",
						Required:    true,
					},
					{
						Name:        "lastInsertId",
						Type:        "number",
						Label:       "Last Insert ID",
						Required:    false,
					},
				},
			},
		},
		{
			Name:        "transaction",
			Label:       "Execute Transaction",
			Description: "Execute multiple statements in a transaction",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "statements",
						Type:        "string",
						Label:       "Statements (JSON array)",
						Description: "Array of {sql, params} objects",
						Required:    true,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "results",
						Type:        "string",
						Label:       "Results (JSON)",
						Required:    true,
					},
				},
			},
		},
	}
}

// ExecuteAction executes an action
func (d *DatabaseConnector) ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error) {
	switch action {
	case "query":
		return d.executeQuery(ctx, params)
	case "execute":
		return d.executeStatement(ctx, params)
	case "transaction":
		return d.executeTransaction(ctx, params)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (d *DatabaseConnector) executeQuery(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	sqlStr := params["sql"].(string)
	
	// Validate it's a SELECT
	if !strings.HasPrefix(strings.ToUpper(strings.TrimSpace(sqlStr)), "SELECT") {
		return nil, fmt.Errorf("only SELECT queries allowed for 'query' action")
	}
	
	var args []interface{}
	if paramsStr, ok := params["params"].(string); ok && paramsStr != "" {
		if err := json.Unmarshal([]byte(paramsStr), &args); err != nil {
			return nil, fmt.Errorf("invalid params JSON: %w", err)
		}
	}
	
	rows, err := d.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()
	
	// Get column names
	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("failed to get columns: %w", err)
	}
	
	// Fetch results
	var results []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}
		
		row := make(map[string]interface{})
		for i, col := range columns {
			row[col] = values[i]
		}
		results = append(results, row)
	}
	
	resultsJSON, _ := json.Marshal(results)
	columnsJSON, _ := json.Marshal(columns)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"rows":     string(resultsJSON),
			"rowCount": len(results),
			"columns":  string(columnsJSON),
		},
	}, nil
}

func (d *DatabaseConnector) executeStatement(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	sqlStr := params["sql"].(string)
	
	var args []interface{}
	if paramsStr, ok := params["params"].(string); ok && paramsStr != "" {
		if err := json.Unmarshal([]byte(paramsStr), &args); err != nil {
			return nil, fmt.Errorf("invalid params JSON: %w", err)
		}
	}
	
	result, err := d.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("execution failed: %w", err)
	}
	
	rowsAffected, _ := result.RowsAffected()
	lastID, _ := result.LastInsertId()
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"rowsAffected": rowsAffected,
			"lastInsertId": lastID,
		},
	}, nil
}

func (d *DatabaseConnector) executeTransaction(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	statementsStr := params["statements"].(string)
	
	var statements []struct {
		SQL    string        `json:"sql"`
		Params []interface{} `json:"params"`
	}
	if err := json.Unmarshal([]byte(statementsStr), &statements); err != nil {
		return nil, fmt.Errorf("invalid statements JSON: %w", err)
	}
	
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()
	
	var results []map[string]interface{}
	
	for i, stmt := range statements {
		result := map[string]interface{}{
			"statement": i + 1,
		}
		
		res, err := tx.ExecContext(ctx, stmt.SQL, stmt.Params...)
		if err != nil {
			result["error"] = err.Error()
			result["success"] = false
			return &ActionResult{
				Success: false,
				Data:    map[string]interface{}{"results": results},
				Error:   fmt.Sprintf("statement %d failed: %v", i+1, err),
			}, nil
		}
		
		rowsAffected, _ := res.RowsAffected()
		result["rowsAffected"] = rowsAffected
		result["success"] = true
		results = append(results, result)
	}
	
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}
	
	resultsJSON, _ := json.Marshal(results)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"results": string(resultsJSON),
		},
	}, nil
}

func (d *DatabaseConnector) buildConnectionString(config map[string]interface{}) string {
	// Honour the connection-string mode if the UI flagged it.
	if pickBool(config, false, "use_connection_string", "useConnectionString") {
		if dsn := pickStr(config, "connection_string", "connectionString", "dsn"); dsn != "" {
			return dsn
		}
	}

	host := pickStr(config, "host", "hostname")
	username := pickStr(config, "username", "user")
	password := pickStr(config, "password", "pass")
	dbname := pickStr(config, "database", "dbName", "db_name", "name")

	defaultPort := 5432
	if d.dbType == "mysql" {
		defaultPort = 3306
	}
	port := fmt.Sprintf("%d", pickInt(config, defaultPort, "port"))

	if d.dbType == "postgresql" {
		sslMode := pickStr(config, "ssl_mode", "sslMode")
		if sslMode == "" {
			sslMode = "require"
		}
		return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			host, port, username, password, dbname, sslMode)
	}

	// MySQL
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s",
		username, password, host, port, dbname)
}
