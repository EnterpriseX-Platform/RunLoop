// Package secret implements engine-side resolution of `${{secrets.NAME}}`
// placeholders embedded in node configs.
//
// Until now Next.js resolved secrets *before* submitting a flow to the
// engine, which meant plaintext secrets travelled through executions.input,
// log lines, and DLQ.original_input. This package lets the engine pull
// encrypted secrets from Postgres and decrypt them at the point of use,
// so plaintext only exists inside the executor goroutine.
//
// The encryption format is identical to the Next.js implementation in
// `apps/runloop/src/lib/encryption.ts` so values written from either side
// can be decrypted from the other:
//
//   AES-256-GCM, 16-byte IV, 16-byte auth tag, all three (ciphertext, iv,
//   tag) stored as base64 strings in three separate columns.
package secret

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/idgen"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/scrypt"
)

const (
	keyLen     = 32 // AES-256
	devKeyHint = "runloop-dev-key"
	devSalt    = "salt"
)

// Store is a thin alias of the executor.SecretStore interface so callers
// can depend on this package directly without import cycles.
type Store interface {
	GetSecret(ctx context.Context, name string, projectID string) (string, error)
}

// PostgresStore reads secrets from the `secrets` table and decrypts them
// with AES-256-GCM. It also writes an audit row to `secret_access_logs`
// for every read, success or failure.
type PostgresStore struct {
	db  *db.Postgres
	key []byte
}

// New constructs a PostgresStore. The encryption key is loaded from the
// SECRET_ENCRYPTION_KEY env var (64 hex chars). In dev (no env var set),
// it derives a deterministic key — the same one the Next.js side derives
// in development — so the two services stay in sync.
func New(database *db.Postgres) (*PostgresStore, error) {
	key, err := loadKey()
	if err != nil {
		return nil, err
	}
	return &PostgresStore{db: database, key: key}, nil
}

func loadKey() ([]byte, error) {
	hexKey := os.Getenv("SECRET_ENCRYPTION_KEY")
	if hexKey == "" {
		// Dev fallback. Mirror Next.js scryptSync('runloop-dev-key', 'salt', 32).
		// Node's scryptSync defaults: N=16384, r=8, p=1.
		// Require an explicit development signal across the env vars we
		// recognise. An UNSET environment must NOT silently fall through to
		// the deterministic dev key, otherwise an operator who forgets both
		// SECRET_ENCRYPTION_KEY and the env hint ends up running prod with
		// a publicly-known key.
		if !isExplicitDev() {
			return nil, errors.New("SECRET_ENCRYPTION_KEY is required (set NODE_ENV=development or ENGINE_ENV=development to use the deterministic dev key)")
		}
		k, err := scrypt.Key([]byte(devKeyHint), []byte(devSalt), 16384, 8, 1, keyLen)
		if err != nil {
			return nil, fmt.Errorf("derive dev key: %w", err)
		}
		log.Warn().Msg("SecretStore: using deterministic dev key — set SECRET_ENCRYPTION_KEY in production")
		return k, nil
	}
	if len(hexKey) != keyLen*2 {
		return nil, fmt.Errorf("SECRET_ENCRYPTION_KEY must be %d hex chars (got %d)", keyLen*2, len(hexKey))
	}
	k, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("decode SECRET_ENCRYPTION_KEY hex: %w", err)
	}
	return k, nil
}

// isExplicitDev reports whether any of the env vars we honour says we're
// in development. Mirrors main.go isProduction() but inverted — must be
// explicit, not the absence of a production signal.
func isExplicitDev() bool {
	for _, k := range []string{"ENGINE_ENV", "RUNTIME_ENV", "NODE_ENV", "ENV"} {
		v := strings.ToLower(os.Getenv(k))
		if v == "development" || v == "dev" {
			return true
		}
	}
	return false
}

// GetSecret looks up `name` for the given project, falling back to GLOBAL
// scope when no project-scoped secret exists. Returns the plaintext value
// or an error. Records an access log row either way.
//
// Name resolution order:
//  1. (projectId, name) — the most common case, most specific
//  2. scope=GLOBAL with the same name — cross-project shared secrets
//
// We don't fall through silently between these — once a project-scoped
// row exists, that's the answer (even if expired or restricted), so the
// operator gets a clear error rather than mysteriously hitting a global
// fallback.
func (s *PostgresStore) GetSecret(ctx context.Context, name string, projectID string) (string, error) {
	if name == "" || projectID == "" {
		return "", errors.New("secret name and project id are required")
	}

	row, err := s.fetch(ctx, projectID, name)
	if err != nil {
		s.logAccess(ctx, secretAccessAttempt{
			Name: name, ProjectID: projectID, Success: false, ErrorMessage: err.Error(),
		})
		return "", err
	}

	if row.expiresAt != nil && row.expiresAt.Before(time.Now()) {
		err := fmt.Errorf("secret %q has expired", name)
		s.logAccess(ctx, secretAccessAttempt{
			SecretID: row.id, Name: name, ProjectID: projectID, Success: false, ErrorMessage: err.Error(),
		})
		return "", err
	}

	plain, err := s.decrypt(row.value, row.iv, row.authTag)
	if err != nil {
		s.logAccess(ctx, secretAccessAttempt{
			SecretID: row.id, Name: name, ProjectID: projectID, Success: false, ErrorMessage: "decrypt failed",
		})
		return "", fmt.Errorf("decrypt %q: %w", name, err)
	}

	// Side effects on success: bump usage counters + log access. Both are
	// best-effort; a counter failure shouldn't break execution.
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = s.db.Pool.Exec(bgCtx,
			`UPDATE secrets SET use_count = use_count + 1, last_used_at = NOW() WHERE id = $1`,
			row.id,
		)
		s.logAccess(bgCtx, secretAccessAttempt{
			SecretID: row.id, Name: name, ProjectID: projectID, Success: true,
		})
	}()

	return plain, nil
}

// secretRow is the subset of the Secret row we care about at read time.
type secretRow struct {
	id        string
	value     string
	iv        string
	authTag   string
	expiresAt *time.Time
	scope     string
}

func (s *PostgresStore) fetch(ctx context.Context, projectID, name string) (*secretRow, error) {
	const projectScopeQ = `
		SELECT id, value, iv, auth_tag, expires_at, scope
		FROM secrets
		WHERE project_id = $1 AND name = $2
		LIMIT 1
	`
	row := &secretRow{}
	err := s.db.Pool.QueryRow(ctx, projectScopeQ, projectID, name).Scan(
		&row.id, &row.value, &row.iv, &row.authTag, &row.expiresAt, &row.scope,
	)
	if err == nil {
		return row, nil
	}

	// Fall back to GLOBAL scope.
	const globalScopeQ = `
		SELECT id, value, iv, auth_tag, expires_at, scope
		FROM secrets
		WHERE scope = 'GLOBAL' AND name = $1
		LIMIT 1
	`
	row = &secretRow{}
	err = s.db.Pool.QueryRow(ctx, globalScopeQ, name).Scan(
		&row.id, &row.value, &row.iv, &row.authTag, &row.expiresAt, &row.scope,
	)
	if err != nil {
		return nil, fmt.Errorf("secret %q not found in project or global scope", name)
	}
	return row, nil
}

func (s *PostgresStore) decrypt(b64Cipher, b64IV, b64Tag string) (string, error) {
	ct, err := base64.StdEncoding.DecodeString(b64Cipher)
	if err != nil {
		return "", fmt.Errorf("ciphertext base64: %w", err)
	}
	iv, err := base64.StdEncoding.DecodeString(b64IV)
	if err != nil {
		return "", fmt.Errorf("iv base64: %w", err)
	}
	tag, err := base64.StdEncoding.DecodeString(b64Tag)
	if err != nil {
		return "", fmt.Errorf("tag base64: %w", err)
	}

	block, err := aes.NewCipher(s.key)
	if err != nil {
		return "", err
	}
	// Node's createCipheriv uses the IV length we hand it (16 bytes here),
	// so on the Go side we must build a GCM with a matching nonce size
	// rather than the default 12.
	gcm, err := cipher.NewGCMWithNonceSize(block, len(iv))
	if err != nil {
		return "", err
	}

	// Go's GCM wants ciphertext||tag concatenated.
	full := make([]byte, 0, len(ct)+len(tag))
	full = append(full, ct...)
	full = append(full, tag...)

	plain, err := gcm.Open(nil, iv, full, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

type secretAccessAttempt struct {
	SecretID     string
	Name         string
	ProjectID    string
	Success      bool
	ErrorMessage string
}

// logAccess writes one row to secret_access_logs. Schema mirrors the
// Prisma model in apps/runloop/prisma/schema.prisma.
func (s *PostgresStore) logAccess(ctx context.Context, a secretAccessAttempt) {
	id := idgen.New()
	const q = `
		INSERT INTO secret_access_logs (
			id, secret_id, secret_name, accessed_by, action, success, error_message, created_at
		) VALUES ($1, $2, $3, 'engine', 'READ', $4, $5, NOW())
	`
	var errMsg *string
	if a.ErrorMessage != "" {
		errMsg = &a.ErrorMessage
	}
	if _, err := s.db.Pool.Exec(ctx, q, id, a.SecretID, a.Name, a.Success, errMsg); err != nil {
		log.Debug().Err(err).Str("secret_name", a.Name).Msg("secret access log insert failed")
	}
}

// SecretRefRegex matches ${{secrets.NAME}} placeholders. Exported so other
// packages (DLQ redaction, log scrubbers) can reuse the same definition
// instead of re-defining the pattern.
const SecretRef = `\$\{\{secrets\.(\w+)\}\}`

// PlaceholderNames returns the set of secret names referenced inside any
// string in `s`. Used by DLQ redaction to know which post-resolution
// values to scrub.
func PlaceholderNames(s string) []string {
	var out []string
	idx := 0
	for {
		open := strings.Index(s[idx:], "${{secrets.")
		if open < 0 {
			break
		}
		open += idx
		close := strings.Index(s[open:], "}}")
		if close < 0 {
			break
		}
		end := open + close
		out = append(out, s[open+len("${{secrets.") : end])
		idx = end + 2
	}
	return out
}
