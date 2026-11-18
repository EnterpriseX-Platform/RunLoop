// Package authz enforces per-project (tenant) access on engine routes.
//
// JWTMiddleware only proves that a caller is authenticated; it does not
// bind the caller to the project that owns a resource. Without the guards
// here, any authenticated user — or any project-scoped API key — could read,
// modify, trigger or delete another tenant's flows, schedulers, executions,
// queues and dead-letter entries by id (cross-project IDOR).
package authz

import (
	"encoding/json"
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

// BodyProject guards a create route that carries its target project in the
// request body (field, e.g. "projectId"). The body is re-decoded here — Fiber
// buffers it, so the handler can still BodyParser it afterwards — and the
// named project must be one the caller can access, closing the hole where a
// caller POSTs a resource into another tenant's project.
func BodyProject(pool *pgxpool.Pool, field string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body map[string]json.RawMessage
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
		}
		var pid string
		if raw, ok := body[field]; ok {
			_ = json.Unmarshal(raw, &pid)
		}
		if pid == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": field + " is required"})
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

// BodyIDs guards a bulk route that carries a list of resource ids in the body
// (field, e.g. "ids"). Every referenced row's owning project is resolved in
// one query and each must be accessible to the caller; a row that does not
// exist is ignored (the handler reports it), but one row in another tenant's
// project fails the whole request, so a caller cannot delete or retry rows
// they can't see by mixing ids. table/idCol are fixed identifiers.
func BodyIDs(pool *pgxpool.Pool, table, idCol, field string) fiber.Handler {
	query := "SELECT DISTINCT project_id FROM " + table + " WHERE " + idCol + " = ANY($1)"
	return func(c *fiber.Ctx) error {
		var body map[string]json.RawMessage
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
		}
		var ids []string
		if raw, ok := body[field]; ok {
			_ = json.Unmarshal(raw, &ids)
		}
		if len(ids) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": field + " array required"})
		}
		rows, err := pool.Query(c.Context(), query, ids)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Access check failed"})
		}
		defer rows.Close()
		var projects []string
		for rows.Next() {
			var pid string
			if err := rows.Scan(&pid); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Access check failed"})
			}
			projects = append(projects, pid)
		}
		if err := rows.Err(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Access check failed"})
		}
		for _, pid := range projects {
			ok, err := Accessible(c, pool, pid)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Access check failed"})
			}
			if !ok {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden"})
			}
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
