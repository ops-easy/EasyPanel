package core

import "strings"

func normalizeBastionTargetIDList(in []string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, raw := range in {
		id := normalizePolicyTargetID(raw)
		if id == "" {
			continue
		}
		lk := strings.ToLower(id)
		if seen[lk] {
			continue
		}
		seen[lk] = true
		out = append(out, id)
	}
	return out
}

func normalizeBastionTargetGroups(in []BastionManualTargetGroup) []BastionManualTargetGroup {
	out := make([]BastionManualTargetGroup, 0, len(in))
	for _, g := range in {
		name := strings.TrimSpace(g.Name)
		if name == "" {
			continue
		}
		targetIDs := normalizeBastionTargetIDList(g.TargetIDs)
		out = append(out, BastionManualTargetGroup{Name: name, TargetIDs: targetIDs})
	}
	return out
}

func normalizeBastionTargetRdpEmbeds(in []BastionTargetRdpWebEmbed) []BastionTargetRdpWebEmbed {
	out := make([]BastionTargetRdpWebEmbed, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, row := range in {
		id := normalizePolicyTargetID(row.TargetID)
		url := strings.TrimSpace(row.URL)
		if id == "" || url == "" {
			continue
		}
		lk := strings.ToLower(id)
		if seen[lk] {
			continue
		}
		seen[lk] = true
		out = append(out, BastionTargetRdpWebEmbed{TargetID: id, URL: url})
	}
	return out
}
