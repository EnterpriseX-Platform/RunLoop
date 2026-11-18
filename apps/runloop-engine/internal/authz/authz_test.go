package authz

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"
)

// The role and API-key branches of Accessible return before touching the
// database, so they can be checked with a bare context and a nil pool.
func TestAccessibleBranches(t *testing.T) {
	app := fiber.New()

	cases := []struct {
		name      string
		role      string
		keyProj   string // projectID local (API key scope); "" = unset
		userID    string
		target    string
		wantAllow bool
	}{
		{"admin sees any project", "ADMIN", "", "u1", "proj-A", true},
		{"empty target denied", "ADMIN", "", "u1", "", false},
		{"api key same project", "API_KEY", "proj-A", "key", "proj-A", true},
		{"api key other project", "API_KEY", "proj-A", "key", "proj-B", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := app.AcquireCtx(&fasthttp.RequestCtx{})
			defer app.ReleaseCtx(c)
			c.Locals("userRole", tc.role)
			if tc.keyProj != "" {
				c.Locals("projectID", tc.keyProj)
			}
			c.Locals("userID", tc.userID)
			got, err := Accessible(c, nil, tc.target)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.wantAllow {
				t.Fatalf("Accessible=%v want %v", got, tc.wantAllow)
			}
		})
	}
}
