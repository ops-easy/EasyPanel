package core

import (
	"strings"
	"testing"
	"time"
)

func TestVerifySessionTokenRejectsUnknownRole(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	token := mintSessionToken("alice", "owner", time.Now().Add(time.Hour).Unix(), "nonce-1", key)

	_, _, _, err := verifySessionToken(token, key)
	if err == nil {
		t.Fatal("expected unknown session role to be rejected")
	}
	if !strings.Contains(err.Error(), "invalid role") {
		t.Fatalf("expected invalid role error, got %v", err)
	}
}
