package safehttp

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBlocked(t *testing.T) {
	cases := []struct {
		ip   string
		want bool
	}{
		{"169.254.169.254", true}, // AWS/GCP/Azure metadata
		{"169.254.170.2", true},   // ECS task metadata
		{"127.0.0.1", true},
		{"::1", true},
		{"0.0.0.0", true},
		{"fe80::1", true},
		{"8.8.8.8", false},
		{"93.184.216.34", false},
	}
	for _, c := range cases {
		if got := blocked(net.ParseIP(c.ip)); got != c.want {
			t.Errorf("blocked(%s)=%v want %v", c.ip, got, c.want)
		}
	}
	// RFC1918 is allowed unless the env flag is set.
	if blocked(net.ParseIP("10.1.2.3")) {
		t.Error("10.1.2.3 should be allowed by default")
	}
	t.Setenv("RUNLOOP_BLOCK_PRIVATE_EGRESS", "true")
	if !blocked(net.ParseIP("10.1.2.3")) {
		t.Error("10.1.2.3 should be blocked when RUNLOOP_BLOCK_PRIVATE_EGRESS=true")
	}
}

// The client must refuse a request to the metadata IP at dial time.
func TestClientRefusesMetadata(t *testing.T) {
	_, err := NewClient(5*time.Second, true).Get("http://169.254.169.254/latest/meta-data/")
	if err == nil {
		t.Fatal("expected the metadata request to be refused")
	}
	if !strings.Contains(err.Error(), "safehttp") {
		t.Fatalf("expected a safehttp refusal, got %v", err)
	}
}

// A normal public-style request still works (served from a loopback test
// server reached by its explicit address, which the guard would block — so
// assert the guard is what rejects loopback, confirming it is active).
func TestClientAllowsAndGuards(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	defer srv.Close()
	// srv is on 127.0.0.1, which the guard blocks: proves the guard runs.
	if _, err := NewClient(5*time.Second, true).Get(srv.URL); err == nil {
		t.Fatal("guard should block the loopback test server")
	}
}
