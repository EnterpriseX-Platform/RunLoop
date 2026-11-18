package scheduler

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestUtcPtr(t *testing.T) {
	if utcPtr(nil) != nil {
		t.Fatal("nil in, nil out")
	}
	bkk, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		t.Skip("tzdata not available")
	}
	in := time.Date(2026, 11, 14, 22, 0, 0, 0, bkk) // 22:00 +07 == 15:00 UTC
	out := utcPtr(&in)
	if out.Location() != time.UTC || out.Hour() != 15 || !out.Equal(in) {
		t.Fatalf("got %v, want 15:00 UTC (same instant)", out)
	}
}

// TestNextRunRoundTrip writes a Bangkok-zoned time into a
// `timestamp without time zone` column the way updateNextRun does and
// reads it back as UTC. Before the fix the stored wall clock was 22:00,
// i.e. 7 hours late. Runs only when TEST_DATABASE_URL is set.
func TestNextRunRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Skipf("no database: %v", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, `CREATE TEMP TABLE t_next (v timestamp without time zone)`); err != nil {
		t.Fatal(err)
	}
	bkk, _ := time.LoadLocation("Asia/Bangkok")
	in := time.Date(2026, 11, 14, 22, 0, 0, 0, bkk)
	if _, err := conn.Exec(ctx, `INSERT INTO t_next VALUES ($1)`, utcPtr(&in)); err != nil {
		t.Fatal(err)
	}
	var got time.Time
	if err := conn.QueryRow(ctx, `SELECT v FROM t_next`).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if !got.Equal(in) {
		t.Fatalf("stored %v, want same instant as %v", got, in.UTC())
	}
}
