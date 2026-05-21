package core

import "testing"

func TestNormalizeDocGuidePath(t *testing.T) {
	cases := map[string]string{
		"":                           "/",
		"cluster/settings":           "/cluster/settings",
		"/cluster/settings?tab=k8s":  "/cluster/settings",
		"/cluster/settings#runtime":  "/cluster/settings",
		"/cluster/settings/":         "/cluster/settings",
		"/cluster/apps/cloud-vm/123": "/cluster/apps/cloud-vm/123",
	}
	for in, want := range cases {
		if got := normalizeDocGuidePath(in); got != want {
			t.Fatalf("normalizeDocGuidePath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestResolveBestDocGuidePrefersExactThenLongestPrefixThenGlobal(t *testing.T) {
	guides := []docGuideMeta{
		{GuideKey: "global", RoutePattern: "/", MatchType: "global", DocID: 1, Enabled: true},
		{GuideKey: "apps", RoutePattern: "/cluster/apps", MatchType: "prefix", DocID: 2, Enabled: true},
		{GuideKey: "cloud-vm", RoutePattern: "/cluster/apps/cloud-vm", MatchType: "prefix", DocID: 3, Enabled: true},
		{GuideKey: "cloud-vm-detail", RoutePattern: "/cluster/apps/cloud-vm/42", MatchType: "exact", DocID: 4, Enabled: true},
		{GuideKey: "disabled-detail", RoutePattern: "/cluster/apps/cloud-vm/99", MatchType: "exact", DocID: 5, Enabled: false},
	}

	got, fallback, ok := resolveBestDocGuide(guides, "/cluster/apps/cloud-vm/42")
	if !ok || got.GuideKey != "cloud-vm-detail" || fallback {
		t.Fatalf("exact match = (%+v, fallback=%v, ok=%v), want cloud-vm-detail without fallback", got, fallback, ok)
	}

	got, fallback, ok = resolveBestDocGuide(guides, "/cluster/apps/cloud-vm/99")
	if !ok || got.GuideKey != "cloud-vm" || fallback {
		t.Fatalf("disabled exact should fall back to longest enabled prefix, got (%+v, fallback=%v, ok=%v)", got, fallback, ok)
	}

	got, fallback, ok = resolveBestDocGuide(guides, "/unknown")
	if !ok || got.GuideKey != "global" || !fallback {
		t.Fatalf("unknown path should use global fallback, got (%+v, fallback=%v, ok=%v)", got, fallback, ok)
	}
}
