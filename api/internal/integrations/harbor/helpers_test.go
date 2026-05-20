package harbor

import "testing"

func TestSanitizeRepositoryListQ(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"busybox:", "busybox"},
		{"busybox：", "busybox"},
		{" busybox:  ", "busybox"},
		{"busybox:1.36", "busybox"},
		{"busybox:1.36.0", "busybox"},
		{"group/sub:1.0", "group/sub"},
		{"group/sub:bad tag", "group/sub:bad tag"},
		{"plain-name", "plain-name"},
		{"", ""},
		{":::", ""},
	}
	for _, tc := range cases {
		if got := SanitizeRepositoryListQ(tc.in); got != tc.want {
			t.Fatalf("SanitizeRepositoryListQ(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestRepositoryPathSegmentCandidates(t *testing.T) {
	got := RepositoryPathSegmentCandidates("team/app")
	if len(got) != 2 || got[0] != "team%2Fapp" || got[1] != "team%252Fapp" {
		t.Fatalf("unexpected candidates: %#v", got)
	}
}

func TestImageReference(t *testing.T) {
	if got := ImageReference("registry.local", "library", "busybox", "1.36"); got != "registry.local/library/busybox:1.36" {
		t.Fatalf("tag ref = %q", got)
	}
	if got := ImageReference("registry.local", "library", "busybox", "sha256:abc"); got != "registry.local/library/busybox@sha256:abc" {
		t.Fatalf("digest ref = %q", got)
	}
}
