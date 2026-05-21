package core

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestFileSSHStorePathEncodesProviderKey(t *testing.T) {
	s := &fileSSHStore{dir: t.TempDir()}
	p := s.path("pve:target-a:node1:qemu:101")
	if strings.Contains(filepath.Base(p), ":") {
		t.Fatalf("encoded path still contains colon: %s", p)
	}
}
