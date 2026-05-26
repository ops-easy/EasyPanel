package service

import (
	"context"
	"time"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"
)

func (c *openWrtClient) ConfigSnapshot(ctx context.Context, dev networkmodel.Device, domain string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	commands := openWrtConfigSnapshotCommands(domain)
	raw, errs := c.runMany(ctx, dev, commands)
	sections := []openWrtUCIEntry{}
	for _, key := range []string{"networkUCI", "dhcpUCI", "wirelessUCI", "firewallUCI", "systemUCI"} {
		sections = append(sections, parseUCIShow(raw[key])...)
	}
	capability := "ssh-uci"
	if len(errs) > 0 {
		capability = "partial"
	}
	return map[string]any{
		"provider":   networkDeviceKindOpenWrt,
		"domain":     normalizeConfigDomain(domain),
		"source":     "ssh-ubus-uci",
		"capability": capability,
		"checkedAt":  time.Now().UTC().Format(time.RFC3339),
		"sections":   sections,
		"raw":        raw,
		"errors":     errs,
	}, nil
}

func openWrtConfigSnapshotCommands(domain string) map[string]string {
	switch normalizeConfigDomain(domain) {
	case "interfaces":
		return map[string]string{
			"networkUCI":    "uci show network",
			"interfaceDump": "ubus call network.interface dump",
			"ipAddr":        "ip -j addr",
		}
	case "clients", "dhcp":
		return map[string]string{
			"dhcpUCI":    "uci show dhcp",
			"dhcpLeases": "cat /tmp/dhcp.leases",
			"neighbors":  "ip neigh show",
		}
	case "wireless":
		return map[string]string{
			"wirelessUCI": "uci show wireless",
			"hostapdList": "ubus list hostapd.*",
		}
	case "connections":
		return map[string]string{
			"firewallUCI": "uci show firewall",
			"ruleset":     "nft list ruleset || iptables-save",
			"conntrack":   "cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null || true",
		}
	case "dns":
		return map[string]string{
			"dhcpUCI": "uci show dhcp",
		}
	case "monitoring", "services", "system":
		return map[string]string{
			"systemUCI": "uci show system",
			"board":     "ubus call system board",
			"system":    "ubus call system info",
		}
	default:
		return map[string]string{
			"networkUCI":  "uci show network",
			"dhcpUCI":     "uci show dhcp",
			"firewallUCI": "uci show firewall",
		}
	}
}
