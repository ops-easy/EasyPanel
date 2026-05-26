package service

import (
	"context"
	"testing"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"
)

type fakeOpenWrtRunner map[string]string

func (f fakeOpenWrtRunner) Run(_ context.Context, _ networkmodel.Device, command string) (string, error) {
	return f[command], nil
}

func TestOpenWrtProbeUsesRealUbusCommands(t *testing.T) {
	client := newOpenWrtClient(fakeOpenWrtRunner{
		"ubus call system board": `{"hostname":"router","model":"x86_64"}`,
		"ubus call system info":  `{"uptime":123,"load":[1,2,3]}`,
	})
	got, err := client.Probe(context.Background(), networkmodel.Device{Kind: "openwrt", Host: "router.lan"})
	if err != nil {
		t.Fatalf("Probe returned error: %v", err)
	}
	if !got.Reachable || got.Board["hostname"] != "router" {
		t.Fatalf("unexpected probe result: %+v", got)
	}
}

func TestOpenWrtClientCollectorsUseRuntimeCommands(t *testing.T) {
	client := newOpenWrtClient(fakeOpenWrtRunner{
		"cat /tmp/dhcp.leases": "1716200000 aa:bb:cc:dd:ee:ff 192.168.1.23 laptop *\n",
		"ip neigh show":        "192.168.1.23 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE\n",
	})
	got, err := client.Clients(context.Background(), networkmodel.Device{Kind: "openwrt", Host: "router.lan"})
	if err != nil {
		t.Fatalf("Clients returned error: %v", err)
	}
	leases := got["leases"].([]openWrtClientLease)
	if len(leases) != 1 || leases[0].IP != "192.168.1.23" {
		t.Fatalf("unexpected leases: %+v", leases)
	}
	neighbors := got["neighbors"].([]openWrtNeighbor)
	if len(neighbors) != 1 || neighbors[0].Dev != "br-lan" {
		t.Fatalf("unexpected neighbors: %+v", neighbors)
	}
}
