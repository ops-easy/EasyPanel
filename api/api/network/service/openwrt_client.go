package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	networkmodel "kube-bt-sync/api/network/model"
)

type openWrtCommandRunner interface {
	Run(ctx context.Context, dev networkmodel.Device, command string) (string, error)
}

type openWrtClient struct {
	runner openWrtCommandRunner
}

type openWrtProbeResult struct {
	Reachable bool           `json:"reachable"`
	Board     map[string]any `json:"board,omitempty"`
	System    map[string]any `json:"system,omitempty"`
	Errors    []string       `json:"errors,omitempty"`
	CheckedAt string         `json:"checkedAt"`
	Source    string         `json:"source"`
}

func newOpenWrtClient(runner openWrtCommandRunner) *openWrtClient {
	if runner == nil {
		runner = openWrtSSHRunner{}
	}
	return &openWrtClient{runner: runner}
}

func (c *openWrtClient) Probe(ctx context.Context, dev networkmodel.Device) (*openWrtProbeResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	boardRaw, boardErr := c.runner.Run(ctx, dev, "ubus call system board")
	systemRaw, systemErr := c.runner.Run(ctx, dev, "ubus call system info")
	result := &openWrtProbeResult{
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		Source:    "ssh-ubus",
	}
	if boardErr != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("system board: %v", boardErr))
	}
	if systemErr != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("system info: %v", systemErr))
	}
	if boardErr == nil {
		_ = json.Unmarshal([]byte(boardRaw), &result.Board)
	}
	if systemErr == nil {
		_ = json.Unmarshal([]byte(systemRaw), &result.System)
	}
	result.Reachable = boardErr == nil && systemErr == nil
	if !result.Reachable {
		return result, errors.New(strings.Join(result.Errors, "; "))
	}
	return result, nil
}

func (c *openWrtClient) Overview(ctx context.Context, dev networkmodel.Device) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	commands := map[string]string{
		"board":      "ubus call system board",
		"system":     "ubus call system info",
		"memory":     "cat /proc/meminfo",
		"disk":       "df -h",
		"interfaces": "ubus call network.interface dump",
	}
	raw, errs := c.runMany(ctx, dev, commands)
	out := map[string]any{
		"source":    "ssh-ubus",
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
		"raw":       raw,
		"errors":    errs,
	}
	for _, key := range []string{"board", "system", "interfaces"} {
		var v any
		if err := json.Unmarshal([]byte(raw[key]), &v); err == nil {
			out[key] = v
		}
	}
	return out, nil
}

func (c *openWrtClient) Interfaces(ctx context.Context, dev networkmodel.Device) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	raw, errs := c.runMany(ctx, dev, map[string]string{
		"interfaceDump": "ubus call network.interface dump",
		"ipAddr":        "ip -j addr",
		"ipRoute":       "ip -j route",
	})
	out := map[string]any{"source": "ssh-ubus", "checkedAt": time.Now().UTC().Format(time.RFC3339), "raw": raw, "errors": errs}
	for _, key := range []string{"interfaceDump", "ipAddr", "ipRoute"} {
		var v any
		if err := json.Unmarshal([]byte(raw[key]), &v); err == nil {
			out[key] = v
		}
	}
	return out, nil
}

func (c *openWrtClient) Clients(ctx context.Context, dev networkmodel.Device) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	raw, errs := c.runMany(ctx, dev, map[string]string{
		"dhcpLeases": "cat /tmp/dhcp.leases",
		"neighbors":  "ip neigh show",
	})
	return map[string]any{
		"source":    "ssh-ubus",
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
		"leases":    parseDHCPLeases(raw["dhcpLeases"]),
		"neighbors": parseIPNeighbors(raw["neighbors"]),
		"raw":       raw,
		"errors":    errs,
	}, nil
}

func (c *openWrtClient) Wireless(ctx context.Context, dev networkmodel.Device) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	raw, errs := c.runMany(ctx, dev, map[string]string{
		"wirelessUCI": "uci show wireless",
		"hostapdList": "ubus list hostapd.*",
	})
	ifaces := []string{}
	for _, line := range strings.Split(raw["hostapdList"], "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "hostapd.") {
			ifaces = append(ifaces, strings.TrimPrefix(line, "hostapd."))
		}
	}
	sort.Strings(ifaces)
	stations := []openWrtWirelessStation{}
	stationRaw := map[string]string{}
	for _, iface := range ifaces {
		ifaceName := safeOpenWrtObjectName(iface)
		if ifaceName == "" {
			continue
		}
		cmd := "ubus call hostapd." + ifaceName + " get_clients"
		got, err := c.runner.Run(ctx, dev, cmd)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", cmd, err))
			continue
		}
		stationRaw[iface] = got
		stations = append(stations, parseHostapdClients(iface, got)...)
	}
	raw["stations"] = marshalBestEffort(stationRaw)
	return map[string]any{
		"source":    "ssh-ubus",
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
		"radios":    parseUCIShow(raw["wirelessUCI"]),
		"ifaces":    ifaces,
		"stations":  stations,
		"raw":       raw,
		"errors":    errs,
	}, nil
}

func (c *openWrtClient) Firewall(ctx context.Context, dev networkmodel.Device) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	raw, errs := c.runMany(ctx, dev, map[string]string{
		"firewallUCI": "uci show firewall",
		"ruleset":     "nft list ruleset || iptables-save",
		"conntrack":   "cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null || true",
	})
	return map[string]any{
		"source":         "ssh-ubus",
		"checkedAt":      time.Now().UTC().Format(time.RFC3339),
		"firewallConfig": parseUCIShow(raw["firewallUCI"]),
		"conntrackCount": strings.TrimSpace(raw["conntrack"]),
		"raw":            raw,
		"errors":         errs,
	}, nil
}

func (c *openWrtClient) runMany(ctx context.Context, dev networkmodel.Device, commands map[string]string) (map[string]string, []string) {
	raw := map[string]string{}
	errs := []string{}
	keys := make([]string, 0, len(commands))
	for key := range commands {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		out, err := c.runner.Run(ctx, dev, commands[key])
		raw[key] = out
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", commands[key], err))
		}
	}
	return raw, errs
}

func marshalBestEffort(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}
