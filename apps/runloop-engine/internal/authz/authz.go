// Package authz enforces per-project (tenant) access on engine routes.
//
// JWTMiddleware only proves that a caller is authenticated; it does not
// bind the caller to the project that owns a resource. Without the guards
// here, any authenticated user — or any project-scoped API key — could read,
// modify, trigger or delete another tenant's flows, schedulers, executions,
// queues and dead-letter entries by id (cross-project IDOR).
package authz

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Accessible reports whether the current caller may act within projectID.
// A global ADMIN may act in any project; an API key only in the single
// project it is scoped to; any other user only in projects they belong to.
func Accessible(c *fiber.Ctx, pool *pgxpool.Pool, projectID string) (bool, error) {
	if projectID == "" {
		return false, nil
	}
	if role, _ := c.Locals("userRole").(string); role == "ADMIN" {
		return true, nil
	}
	if pid, ok := c.Locals("projectID").(string); ok && pid != "" {
		// API-key auth: the key is bound to exactly one project.
		return pid == projectID, nil
	}
	userID, _ := c.Locals("userID").(string)
	if userID == "" {
		return false, nil
	}
	var one int
	err := pool.QueryRow(c.Context(),
		`SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1`,
		projectID, userID).Scan(&one)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// Resource guards a detail route whose resource is addressed by a path
// param. table and idCol are fixed identifiers chosen at registration time
// (never user input). The resource's project_id is loaded and checked; a
// missing row is 404 and a non-member is 403, both before the handler runs.
func Resource(pool *pgxpool.Pool, table, idCol, param string) fiber.Handler {
	query := "SELECT project_id FROM " + table + " WHERE " + idCol + " = $1 LIMIT 1"
	return func(c *fiber.Ctx) error {
		id := c.Params(param)
		if id == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing identifier"})
		}
		var projectID string
		err := pool.QueryRow(c.Context(), query, id).Scan(&projectID)
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Not found"})
		}
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Access check failed"})
		}
		ok, err := Accessible(c, pool, projectID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Access check failed"})
		}
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden"})
		}
		return c.Next()
	}
}

// QueryProject guards a collection route that filters by ?projectId=. The
// query parameter becomes required and must name a project the caller can
// access, so a caller can no longer omit it to list every tenant's rows.
func QueryProject(pool *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		pid := c.Query("projectId")
		if pid == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId is required"})
		}
		ok, err := Accessible(c, pool, pid)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Access check failed"})
		}
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden"})
		}
		return c.Next()
	}
}

// RequireAdmin restricts a route to global ADMIN callers. Used for
// resources that are not project-scoped (plugins, global node templates).
func RequireAdmin() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if role, _ := c.Locals("userRole").(string); role == "ADMIN" {
			return c.Next()
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Admin only"})
	}
}
