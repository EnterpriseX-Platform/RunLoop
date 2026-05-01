package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog/log"
)

// knownDefaultSecrets are hardcoded defaults that must never be used in production.
var knownDefaultSecrets = []string{
	"runloop-secret-change-in-production",
	"dev-secret-key-change-in-production",
	"secret",
	"changeme",
}

// Config represents the application configuration
type Config struct {
	// Server
	ServerPort         string
	ServerReadTimeout  time.Duration
	ServerWriteTimeout time.Duration
	BasePath           string
	BodyLimitBytes     int      // Max request body. Default 4MB; raise for large flow JSON.
	AllowedOrigins     []string // CORS allowlist. Empty = same-origin only. "*" only honoured outside production.
	TrustedWSOrigins   []string // WebSocket Origin allowlist. Falls back to AllowedOrigins when empty.

	// Rate limiting
	LoginRateLimit       int           // Max login attempts per window per IP. Default 10.
	LoginRateLimitWindow time.Duration // Window for login attempts. Default 1m.

	// Database
	DatabaseURL        string
	DatabaseMaxConns   int
	DatabaseMaxIdle    int

	// Worker Pool
	WorkerCount        int
	WorkerQueueSize    int
	WorkerMaxRetries   int

	// JWT
	JWTSecret          string
	JWTExpiryHours     int

	// Logging
	LogLevel           string
	LogFormat          string // json or console

	// Executor
	DefaultTimeout     time.Duration
	MaxTimeout         time.Duration

	// Features
	EnableMetrics      bool
	EnablePprof        bool

	// Development
	SkipAuth           bool // Skip authentication for development
}

// Load loads configuration from environment variables
func Load() *Config {
	// Load .env file if exists
	if err := godotenv.Load(); err != nil {
		log.Debug().Msg("No .env file found, using environment variables")
	}

	cfg := &Config{
		// Server defaults
		ServerPort:         getEnv("EXECUTOR_PORT", "8080"),
		ServerReadTimeout:  getDuration("SERVER_READ_TIMEOUT", 10*time.Second),
		ServerWriteTimeout: getDuration("SERVER_WRITE_TIMEOUT", 30*time.Second),
		BasePath:           getEnv("BASE_PATH", "/rl"),
		BodyLimitBytes:     getInt("BODY_LIMIT_BYTES", 4*1024*1024),
		AllowedOrigins:     splitCSV(getEnv("ALLOWED_ORIGINS", "")),
		TrustedWSOrigins:   splitCSV(getEnv("WS_ALLOWED_ORIGINS", "")),

		// Rate limiting
		LoginRateLimit:       getInt("LOGIN_RATE_LIMIT", 10),
		LoginRateLimitWindow: getDuration("LOGIN_RATE_WINDOW", 1*time.Minute),

		// Database defaults
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/runloop?sslmode=disable"),
		DatabaseMaxConns:   getInt("DATABASE_MAX_CONNS", 20),
		DatabaseMaxIdle:    getInt("DATABASE_MAX_IDLE", 5),

		// Worker Pool defaults
		WorkerCount:        getInt("WORKER_COUNT", 10),
		WorkerQueueSize:    getInt("WORKER_QUEUE_SIZE", 100),
		WorkerMaxRetries:   getInt("WORKER_MAX_RETRIES", 3),

		// JWT defaults
		JWTSecret:          getEnv("JWT_SECRET", "runloop-secret-change-in-production"),
		JWTExpiryHours:     getInt("JWT_EXPIRY_HOURS", 24),

		// Logging defaults
		LogLevel:           getEnv("LOG_LEVEL", "info"),
		LogFormat:          getEnv("LOG_FORMAT", "console"),

		// Executor defaults
		DefaultTimeout:     getDuration("DEFAULT_TIMEOUT", 5*time.Minute),
		MaxTimeout:         getDuration("MAX_TIMEOUT", 1*time.Hour),

		// Features
		EnableMetrics:      getBool("ENABLE_METRICS", true),
		EnablePprof:        getBool("ENABLE_PPROF", false),

		// Development
		SkipAuth:           getBool("SKIP_AUTH", false),
	}

	validateJWTSecret(cfg)

	return cfg
}

// splitCSV parses a comma-separated env var into a deduplicated slice,
// dropping empty entries. Whitespace around items is trimmed.
func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	seen := make(map[string]struct{})
	out := make([]string, 0, 4)
	for _, raw := range strings.Split(s, ",") {
		v := strings.TrimSpace(raw)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func validateJWTSecret(cfg *Config) {
	if cfg.SkipAuth {
		return // Auth is disabled; no JWT secret needed
	}
	if len(cfg.JWTSecret) < 32 {
		log.Fatal().Msg("JWT_SECRET must be at least 32 characters — set a strong secret in your environment")
	}
	for _, known := range knownDefaultSecrets {
		if cfg.JWTSecret == known {
			log.Fatal().Msg("JWT_SECRET is set to a known insecure default — set a strong secret in your environment")
		}
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}

func getDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return defaultValue
}
