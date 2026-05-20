package harbor

import (
	"net/http"
	"testing"
)

func TestFormatAuthFailureParsesHarborErrors(t *testing.T) {
	human, items := FormatAuthFailure(http.StatusUnauthorized, []byte(`{"errors":[{"code":"UNAUTHORIZED","message":"bad credential"}]}`))
	if human != "UNAUTHORIZED：bad credential" {
		t.Fatalf("human = %q", human)
	}
	if len(items) != 1 || items[0].Code != "UNAUTHORIZED" {
		t.Fatalf("items = %#v", items)
	}
}

func TestFormatAuthFailureFallback(t *testing.T) {
	human, items := FormatAuthFailure(http.StatusForbidden, nil)
	if human != "403 禁止访问" {
		t.Fatalf("human = %q", human)
	}
	if len(items) != 0 {
		t.Fatalf("items = %#v", items)
	}
}
