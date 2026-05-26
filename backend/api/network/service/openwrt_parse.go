package service

import (
	"encoding/json"
	"strings"
)

type openWrtClientLease struct {
	Expires string `json:"expires"`
	MAC     string `json:"mac"`
	IP      string `json:"ip"`
	Host    string `json:"host"`
	ID      string `json:"id,omitempty"`
	Source  string `json:"source"`
}

type openWrtNeighbor struct {
	IP     string `json:"ip"`
	Dev    string `json:"dev,omitempty"`
	MAC    string `json:"mac,omitempty"`
	State  string `json:"state,omitempty"`
	Source string `json:"source"`
}

type openWrtUCIEntry struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Package string `json:"package,omitempty"`
	Section string `json:"section,omitempty"`
	Option  string `json:"option,omitempty"`
}

type openWrtWirelessStation struct {
	Interface string         `json:"interface"`
	MAC       string         `json:"mac"`
	Signal    any            `json:"signal,omitempty"`
	RXRate    any            `json:"rxRate,omitempty"`
	TXRate    any            `json:"txRate,omitempty"`
	Raw       map[string]any `json:"raw,omitempty"`
}

func parseDHCPLeases(raw string) []openWrtClientLease {
	rows := []openWrtClientLease{}
	for _, line := range strings.Split(raw, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		row := openWrtClientLease{
			Expires: fields[0],
			MAC:     strings.ToLower(fields[1]),
			IP:      fields[2],
			Host:    fields[3],
			Source:  "dhcp",
		}
		if len(fields) > 4 {
			row.ID = fields[4]
		}
		rows = append(rows, row)
	}
	return rows
}

func parseIPNeighbors(raw string) []openWrtNeighbor {
	rows := []openWrtNeighbor{}
	for _, line := range strings.Split(raw, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		row := openWrtNeighbor{IP: fields[0], Source: "neigh"}
		for i := 1; i < len(fields); i++ {
			switch fields[i] {
			case "dev":
				if i+1 < len(fields) {
					row.Dev = fields[i+1]
					i++
				}
			case "lladdr":
				if i+1 < len(fields) {
					row.MAC = strings.ToLower(fields[i+1])
					i++
				}
			default:
				if i == len(fields)-1 {
					row.State = fields[i]
				}
			}
		}
		rows = append(rows, row)
	}
	return rows
}

func parseUCIShow(raw string) []openWrtUCIEntry {
	rows := []openWrtUCIEntry{}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		key := strings.TrimSpace(parts[0])
		value := strings.Trim(strings.TrimSpace(parts[1]), "'\"")
		row := openWrtUCIEntry{Key: key, Value: value}
		keyParts := strings.Split(key, ".")
		if len(keyParts) > 0 {
			row.Package = keyParts[0]
		}
		if len(keyParts) > 1 {
			row.Section = keyParts[1]
		}
		if len(keyParts) > 2 {
			row.Option = strings.Join(keyParts[2:], ".")
		}
		rows = append(rows, row)
	}
	return rows
}

func parseHostapdClients(iface, raw string) []openWrtWirelessStation {
	var payload struct {
		Clients map[string]map[string]any `json:"clients"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil
	}
	out := make([]openWrtWirelessStation, 0, len(payload.Clients))
	for mac, data := range payload.Clients {
		row := openWrtWirelessStation{
			Interface: iface,
			MAC:       strings.ToLower(mac),
			Raw:       data,
		}
		row.Signal = firstAny(data, "signal", "signal_avg", "rssi")
		row.RXRate = firstAny(data, "rx_rate", "rx bitrate", "rxRate")
		row.TXRate = firstAny(data, "tx_rate", "tx bitrate", "txRate")
		out = append(out, row)
	}
	return out
}

func firstAny(m map[string]any, keys ...string) any {
	for _, key := range keys {
		if v, ok := m[key]; ok {
			return v
		}
	}
	return nil
}
