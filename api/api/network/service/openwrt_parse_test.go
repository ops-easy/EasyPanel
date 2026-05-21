package service

import "testing"

func TestParseDHCPLeases(t *testing.T) {
	got := parseDHCPLeases("1716200000 aa:bb:cc:dd:ee:ff 192.168.1.23 laptop *\n")
	if len(got) != 1 || got[0].IP != "192.168.1.23" || got[0].Host != "laptop" || got[0].Source != "dhcp" {
		t.Fatalf("unexpected leases: %+v", got)
	}
}

func TestParseIPNeighbors(t *testing.T) {
	got := parseIPNeighbors("192.168.1.23 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE\n")
	if len(got) != 1 || got[0].Dev != "br-lan" || got[0].MAC != "aa:bb:cc:dd:ee:ff" || got[0].State != "REACHABLE" {
		t.Fatalf("unexpected neighbors: %+v", got)
	}
}

func TestParseUCIShow(t *testing.T) {
	got := parseUCIShow("firewall.@zone[0].name='lan'\nwireless.radio0.channel='auto'\n")
	if len(got) != 2 || got[0].Package != "firewall" || got[0].Option != "name" || got[1].Package != "wireless" {
		t.Fatalf("unexpected uci rows: %+v", got)
	}
}

func TestBuildOpenWrtConfigCommands(t *testing.T) {
	got, err := buildOpenWrtConfigCommands(openWrtConfigRequest{
		Changes: []openWrtConfigChange{
			{Section: "network.lan.ipaddr", Value: "192.168.1.1"},
			{Section: "wireless.@wifi-iface[0].disabled", Value: "0"},
		},
		Reload: "network",
	})
	if err != nil {
		t.Fatalf("buildOpenWrtConfigCommands returned error: %v", err)
	}
	wantLast := "/etc/init.d/network reload"
	if len(got.Commands) != 5 || got.Commands[len(got.Commands)-1] != wantLast || !got.RequiresConfirmation {
		t.Fatalf("unexpected commands: %+v", got)
	}
}
