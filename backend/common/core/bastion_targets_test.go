package core

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	pvemodel "github.com/ops-easy/EasyPanel/backend/api/pve/model"
	pveprovider "github.com/ops-easy/EasyPanel/backend/api/pve/provider"
)

func TestParseBastionTargetKey(t *testing.T) {
	cases := []struct {
		in       string
		provider string
		legacy   bool
	}{
		{in: "vm-42", provider: "vcenter", legacy: true},
		{in: "vcenter:vm-42", provider: "vcenter"},
		{in: "extra:router01", provider: "extra"},
		{in: "pve:target-a:node1:qemu:101", provider: "pve"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := parseBastionTargetKey(tc.in)
			if err != nil {
				t.Fatalf("parseBastionTargetKey(%q): %v", tc.in, err)
			}
			if got.Provider != tc.provider || got.LegacyVCenter != tc.legacy {
				t.Fatalf("parseBastionTargetKey(%q)=%+v", tc.in, got)
			}
		})
	}
}

func TestBastionPolicyAcceptsLegacyVCenterAndCanonicalTargets(t *testing.T) {
	pol := &VCenterBastionPolicy{
		EnableACL: true,
		UserVMs: map[string][]string{
			"alice": {"vm-1", "pve:t1:n1:qemu:101", "extra:router"},
		},
	}
	if !bastionMayAccessTarget(pol, "alice", "vcenter:vm-1", false) {
		t.Fatal("legacy vm-1 should allow vcenter:vm-1")
	}
	if !bastionMayAccessTarget(pol, "alice", "pve:t1:n1:qemu:101", false) {
		t.Fatal("canonical pve target should be allowed")
	}
	if !bastionMayAccessTarget(pol, "alice", "extra:router", false) {
		t.Fatal("extra target should be allowed")
	}
}

func TestBastionTargetSSHStoreKey(t *testing.T) {
	got := bastionTargetSSHStoreKey("pve:t1:n1:qemu:101")
	want := "bastion-target:pve:t1:n1:qemu:101"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestBastionPVESSHDefaultsToRoot(t *testing.T) {
	merged := mergeBastionPVESSHStored(Config{}, nil, BastionTargetOverride{})
	if merged.User != "root" {
		t.Fatalf("PVE SSH user=%q, want root", merged.User)
	}
	if merged.Port != 22 {
		t.Fatalf("PVE SSH port=%d, want 22", merged.Port)
	}
}

func TestBastionPVESSHReadyWithGlobalAuthWithoutGlobalUser(t *testing.T) {
	cfg := Config{VCenterVMSshPassword: "secret"}
	if !bastionPVESSHReady(cfg, nil) {
		t.Fatal("PVE SSH should be ready when global auth exists and the PVE default user can be used")
	}
}

func TestBastionPVESSHOverrideBeatsDefaultUser(t *testing.T) {
	merged := mergeBastionPVESSHStored(Config{}, nil, BastionTargetOverride{SSHUser: "ubuntu"})
	if merged.User != "ubuntu" {
		t.Fatalf("PVE SSH user=%q, want ubuntu", merged.User)
	}
}

func TestBastionPVESSHMergeLegacyStoredRecordKeepsGlobalHostKeyMode(t *testing.T) {
	cfg := Config{VCenterVMSshPassword: "secret", VCenterVMSshInsecureHostKey: true}
	legacy := &SSHVMStored{User: "root", Password: "secret", Port: 22}
	merged := mergeBastionPVESSHStored(cfg, legacy, BastionTargetOverride{})
	if !merged.InsecureHostKey {
		t.Fatal("legacy PVE SSH records should inherit the global host key mode")
	}
	if _, err := buildSSHClientConfigMerged(cfg, merged); err != nil {
		t.Fatalf("merged legacy PVE SSH settings should build an SSH client config: %v", err)
	}
}

func TestNormalizeBastionPolicyTargetFields(t *testing.T) {
	groups := normalizeBastionTargetGroups([]BastionManualTargetGroup{
		{Name: " core ", TargetIDs: []string{"pve:t1:n1:qemu:101", "PVE:t1:n1:QEMU:101", "extra:Router", ""}},
		{Name: "", TargetIDs: []string{"pve:t1:n1:lxc:102"}},
	})
	if len(groups) != 1 {
		t.Fatalf("unexpected groups: %+v", groups)
	}
	if groups[0].Name != "core" {
		t.Fatalf("unexpected group name %q", groups[0].Name)
	}
	wantIDs := []string{"pve:t1:n1:qemu:101", "extra:router"}
	if len(groups[0].TargetIDs) != len(wantIDs) {
		t.Fatalf("unexpected target ids: %+v", groups[0].TargetIDs)
	}
	for i := range wantIDs {
		if groups[0].TargetIDs[i] != wantIDs[i] {
			t.Fatalf("target id[%d]=%q want %q", i, groups[0].TargetIDs[i], wantIDs[i])
		}
	}

	hidden := normalizeBastionTargetIDList([]string{"vm-1", "vcenter:vm-1", "pve:t1:n1:lxc:102"})
	if len(hidden) != 2 || hidden[0] != "vcenter:vm-1" || hidden[1] != "pve:t1:n1:lxc:102" {
		t.Fatalf("unexpected hidden ids: %+v", hidden)
	}

	rdp := normalizeBastionTargetRdpEmbeds([]BastionTargetRdpWebEmbed{
		{TargetID: "vm-1", URL: " https://rdp.example/a "},
		{TargetID: "vcenter:vm-1", URL: "https://rdp.example/b"},
		{TargetID: "pve:t1:n1:qemu:101", URL: ""},
	})
	if len(rdp) != 1 || rdp[0].TargetID != "vcenter:vm-1" || rdp[0].URL != "https://rdp.example/a" {
		t.Fatalf("unexpected rdp embeds: %+v", rdp)
	}
}

func TestDecodePVEGuestRowsUseNumberAndInferVMID(t *testing.T) {
	rows, err := decodePVEGuestRows([]byte(`[{"id":"qemu/101","vmid":101,"name":"app","node":"pve01","type":"qemu","status":"running"}]`))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].VMID != "101" || rows[0].Node != "pve01" {
		t.Fatalf("unexpected rows: %+v", rows)
	}
	id := canonicalPVETargetID("target-a", rows[0].Node, normalizePVEGuestType(rows[0].Type, rows[0].ID), rows[0].VMID)
	if id != "pve:target-a:pve01:qemu:101" {
		t.Fatalf("unexpected id %q", id)
	}
}

func TestUsableGuestIPv4SkipsLoopbackAndCIDR(t *testing.T) {
	if got := usableGuestIPv4("127.0.0.1"); got != "" {
		t.Fatalf("loopback should be skipped, got %q", got)
	}
	if got := usableGuestIPv4("192.168.10.21/24"); got != "192.168.10.21" {
		t.Fatalf("got %q", got)
	}
}

func TestPVEResolveQemuGuestIPFallsBackToCloudInitConfig(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api2/json/nodes/pve-a/qemu/104/agent/network-get-interfaces", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"data":null,"message":"No QEMU guest agent configured\n"}`))
	})
	mux.HandleFunc("/api2/json/nodes/pve-a/qemu/104/config", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"ipconfig0":"ip=192.168.40.104/24,gw=192.168.40.1"}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := pveprovider.NewClient(pvemodel.Target{
		BaseURL: srv.URL,
		TokenID: "root@pam!test",
		SkipTLS: true,
	}, "secret")
	if err != nil {
		t.Fatal(err)
	}

	got, err := pveResolveQemuGuestIP(context.Background(), client, "pve-a", "104")
	if err != nil {
		t.Fatal(err)
	}
	if got != "192.168.40.104" {
		t.Fatalf("got %q", got)
	}
}

func TestPVEResolveLXCGuestIPFallsBackToConfigNetIP(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api2/json/nodes/pve-a/lxc/204/interfaces", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[]}`))
	})
	mux.HandleFunc("/api2/json/nodes/pve-a/lxc/204/config", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"net0":"name=eth0,bridge=vmbr0,ip=10.20.30.204/24,gw=10.20.30.1"}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := pveprovider.NewClient(pvemodel.Target{
		BaseURL: srv.URL,
		TokenID: "root@pam!test",
	}, "secret")
	if err != nil {
		t.Fatal(err)
	}

	got, err := pveResolveLXCGuestIP(context.Background(), client, "pve-a", "204")
	if err != nil {
		t.Fatal(err)
	}
	if got != "10.20.30.204" {
		t.Fatalf("got %q", got)
	}
}
