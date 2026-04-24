package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/runloop/runloop-engine/internal/config"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/rs/zerolog/log"
)

// APIKeyTokenPrefix is the prefix that identifies a RunLoop API key token.
const APIKeyTokenPrefix = "rl_"

// JWTMiddleware creates a JWT authentication middleware that also accepts
// RunLoop API key tokens (Authorization: Bearer rl_<token>).
//
// When database is nil, API-key auth is disabled and only JWTs are accepted.
func JWTMiddleware(cfg *config.Config, database *db.Postgres) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Skip auth in development mode
		if cfg.SkipAuth {
			c.Locals("userID", "dev-user")
			c.Locals("userEmail", "dev@runloop.io")
			c.Locals("userRole", "ADMIN")
			return c.Next()
		}

		// Token can come from the Authorization header OR the `token`
		// cookie — the Next.js web app drops the JWT as an httpOnly
		// cookie on login, and same-origin fetch() calls to proxied
		// /api/* routes forward the cookie here but not the header.
		var tokenString string
		authHeader := c.Get("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "Invalid authorization header format",
				})
			}
			tokenString = parts[1]
		} else if cookie := c.Cookies("token"); cookie != "" {
			tokenString = cookie
		} else {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing authorization header",
			})
		}

		// If token looks like an API key, try API-key auth first.
		if strings.HasPrefix(tokenString, APIKeyTokenPrefix) {
			if database == nil {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "API key auth unavailable",
				})
			}
			if err := authenticateAPIKey(c, database, tokenString); err != nil {
				log.Debug().Err(err).Msg("API key authentication failed")
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "Invalid or expired API key",
				})
			}
			return c.Next()
		}

		// Parse and validate token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// Validate signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil {
			log.Debug().Err(err).Msg("Failed to parse JWT token")
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid token",
			})
		}

		// Check if token is valid
		if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
			// Check expiration
			if exp, ok := claims["exp"].(float64); ok {
				if time.Now().Unix() > int64(exp) {
					return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
						"error": "Token expired",
					})
				}
			}

			// Store user info in context. The Next.js login route signs
			// JWTs with `userId` + `email` + `role`; accept either `userId`
			// or the standard `sub` claim to stay compatible.
			var userID any = claims["sub"]
			if userID == nil || userID == "" {
				userID = claims["userId"]
			}
			c.Locals("userID", userID)
			c.Locals("userEmail", claims["email"])
			c.Locals("userRole", claims["role"])

			return c.Next()
		}

		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid token",
		})
	}
}

// authenticateAPIKey hashes the raw token and looks it up in the api_keys table.
// On success it populates c.Locals with userID and projectID and updates last_used_at.
func authenticateAPIKey(c *fiber.Ctx, database *db.Postgres, rawToken string) error {
	sum := sha256.Sum256([]byte(rawToken))
	hashed := hex.EncodeToString(sum[:])

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var (
		id        string
		userID    string
		projectID *string
	)

	query := `
		SELECT id, user_id, project_id
		FROM api_keys
		WHERE key = $1
		  AND revoked_at IS NULL
		  AND (expires_at IS NULL OR expires_at > NOW())
		LIMIT 1
	`

	err := database.Pool.QueryRow(ctx, query, hashed).Scan(&id, &userID, &projectID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("api key not found")
		}
		return err
	}

	c.Locals("userID", userID)
	c.Locals("userRole", "API_KEY")
	if projectID != nil {
		c.Locals("projectID", *projectID)
	}

	// Best-effort: update last_used_at. Do not fail the request on error.
	go func(keyID string) {
		updateCtx, updateCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer updateCancel()
		if _, err := database.Pool.Exec(updateCtx, `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, keyID); err != nil {
			log.Debug().Err(err).Str("api_key_id", keyID).Msg("Failed to update api key last_used_at")
		}
	}(id)

	return nil
}

// RequireRole creates a middleware that requires specific role
func RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRole, ok := c.Locals("userRole").(string)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Role not found",
			})
		}

		for _, role := range roles {
			if userRole == role {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Insufficient permissions",
		})
	}
}

// LoggerMiddleware logs request details
func LoggerMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		duration := time.Since(start)

		log.Info().
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", c.Response().StatusCode()).
			Dur("duration", duration).
			Str("ip", c.IP()).
			Msg("HTTP Request")

		return err
	}
}
