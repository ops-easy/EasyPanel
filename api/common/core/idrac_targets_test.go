package core

import "testing"

func TestMergeRuntimeIdracTargetsIntoConfigUsesDefaultTarget(t *testing.T) {
	rs := &RuntimeSettings{
		IdracTargets: []RuntimeIdracTarget{
			{ID: "rack-a", Name: "Rack A", Host: "idrac-a.example.com", User: "root", Password: "secret-a", Insecure: true},
			{ID: "rack-b", Name: "Rack B", Host: "idrac-b.example.com", User: "admin", Password: "secret-b", Default: true},
		},
	}
	var cfg Config

	mergeRuntimeIdracTargetsIntoConfig(rs, &cfg)

	if len(cfg.IdracTargets) != 2 {
		t.Fatalf("IdracTargets len=%d", len(cfg.IdracTargets))
	}
	if cfg.IdracHost != "idrac-b.example.com" || cfg.IdracUser != "admin" || cfg.IdracPassword != "secret-b" {
		t.Fatalf("default target not copied to legacy fields: %#v", cfg)
	}
}

func TestMergeAndValidateRuntimeIdracTargetsOnPutRestoresMaskedPasswords(t *testing.T) {
	cur := &RuntimeSettings{
		IdracTargets: []RuntimeIdracTarget{
			{ID: "rack-a", Host: "idrac-a.example.com", User: "root", Password: "old-secret", Insecure: true, Default: true},
		},
	}
	body := &RuntimeSettings{
		IdracTargets: []RuntimeIdracTarget{
			{ID: "rack-a", Name: "Rack A", Host: " idrac-a.example.com ", User: " root ", Password: "***", Insecure: true},
			{ID: "rack-b", Host: "idrac-b.example.com", User: "admin", Password: "new-secret"},
		},
	}

	if err := mergeAndValidateRuntimeIdracTargetsOnPut(body, cur); err != nil {
		t.Fatalf("merge idrac targets: %v", err)
	}
	if body.IdracTargets[0].Password != "old-secret" {
		t.Fatalf("masked password not restored: %#v", body.IdracTargets[0])
	}
	if !body.IdracTargets[0].Default {
		t.Fatalf("first target should become default when none selected: %#v", body.IdracTargets)
	}
	if body.IdracHost != "idrac-a.example.com" || body.IdracUser != "root" {
		t.Fatalf("legacy fields not synced: host=%q user=%q", body.IdracHost, body.IdracUser)
	}
}
