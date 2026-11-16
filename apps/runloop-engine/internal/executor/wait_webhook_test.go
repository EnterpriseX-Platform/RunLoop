package executor

import (
	"os"
	"testing"
)

// With no secret, signing is disabled: any token (incl. empty) is accepted.
func TestWaitToken_Disabled(t *testing.T) {
	os.Unsetenv("WEBHOOK_WAIT_SECRET")
	if WaitToken("abc") != "" {
		t.Fatal("expected empty token when secret unset")
	}
	if !validToken("abc", "") {
		t.Fatal("expected empty token accepted when secret unset")
	}
	if !validToken("abc", "anything") {
		t.Fatal("expected any token accepted when secret unset")
	}
}

// With a secret, only the correct HMAC for the id is accepted, and tokens
// are id-specific (a token for one id must not unlock another).
func TestWaitToken_Enabled(t *testing.T) {
	os.Setenv("WEBHOOK_WAIT_SECRET", "s3cr3t")
	defer os.Unsetenv("WEBHOOK_WAIT_SECRET")

	tok := WaitToken("order-123")
	if tok == "" {
		t.Fatal("expected non-empty token when secret set")
	}
	if !validToken("order-123", tok) {
		t.Fatal("correct token should validate")
	}
	if validToken("order-123", "") {
		t.Fatal("missing token must be rejected")
	}
	if validToken("order-123", "deadbeef") {
		t.Fatal("wrong token must be rejected")
	}
	if validToken("order-999", tok) {
		t.Fatal("token for a different id must be rejected")
	}
}
