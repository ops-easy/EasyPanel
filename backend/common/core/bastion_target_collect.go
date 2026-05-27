package core

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	pveprovider "github.com/ops-easy/EasyPanel/backend/api/pve/provider"
)

type bastionTargetListResult struct {
	Targets           []BastionTarget
	FolderPathPending bool
	Warnings          []string
}

func collectBastionTargets(ctx context.Context, app *ServerApp, force bool) bastionTargetListResult {
	out := bastionTargetListResult{Targets: []BastionTarget{}, Warnings: []string{}}
	vcenterTargets, pending, warnings := collectVCenterBastionTargets(ctx, app, force)
	out.Targets = append(out.Targets, vcenterTargets...)
	out.FolderPathPending = pending
	out.Warnings = append(out.Warnings, warnings...)
	pveTargets, warnings := collectPVEBastionTargets(ctx, app)
	out.Targets = append(out.Targets, pveTargets...)
	out.Warnings = append(out.Warnings, warnings...)
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	out.Targets = append(out.Targets, collectExtraBastionTargets(pol)...)
	return out
}

func collectVCenterBastionTargets(ctx context.Context, app *ServerApp, force bool) ([]BastionTarget, bool, []string) {
	vc := app.VCenter()
	if vc == nil || !vc.cfg.vCenterConfigured() {
		return []BastionTarget{}, false, nil
	}
	payload, _, folderPathPending, err := vcenterVMListSnapshotBytes(ctx, app, force, true)
	if err != nil {
		if errors.Is(err, errVCenterNotConfiguredForVMList) {
			return []BastionTarget{}, false, nil
		}
		return []BastionTarget{}, false, []string{"vCenter: " + err.Error()}
	}
	var envelope struct {
		VMs               []map[string]interface{} `json:"vms"`
		FolderPathPending bool                     `json:"folderPathPending"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return []BastionTarget{}, false, []string{"vCenter JSON: " + err.Error()}
	}
	targets := make([]BastionTarget, 0, len(envelope.VMs))
	for _, vm := range envelope.VMs {
		moref := bastionMapString(vm, "moref")
		if moref == "" {
			continue
		}
		targets = append(targets, BastionTarget{
			ID:         canonicalVCenterTargetID(moref),
			Provider:   bastionProviderVCenter,
			SourceID:   moref,
			Moref:      moref,
			Name:       bastionFirstNonEmpty(bastionMapString(vm, "name"), moref),
			Kind:       "vm",
			GuestType:  bastionMapString(vm, "guestId"),
			PowerState: bastionMapString(vm, "powerState"),
			Address:    bastionMapString(vm, "ip"),
			FolderPath: bastionMapString(vm, "folderPath"),
			GuestID:    bastionMapString(vm, "guestId"),
			Raw:        vm,
		})
	}
	return targets, folderPathPending || envelope.FolderPathPending, nil
}

func collectPVEBastionTargets(ctx context.Context, app *ServerApp) ([]BastionTarget, []string) {
	kv := app.PlatformKV()
	if kv == nil {
		return []BastionTarget{}, nil
	}
	targetDefs, err := pveprovider.LoadTargets(kv)
	if err != nil {
		return []BastionTarget{}, []string{"PVE targets: " + err.Error()}
	}
	if len(targetDefs) == 0 {
		return []BastionTarget{}, nil
	}
	key, keyErr := deriveAESKey(app.Cfg().EncryptionKey)
	if keyErr != nil {
		return []BastionTarget{}, []string{"PVE encryption: " + keyErr.Error()}
	}
	out := make([]BastionTarget, 0)
	warnings := make([]string, 0)
	overrides := loadBastionTargetOverrides(kv)
	q := url.Values{}
	q.Set("type", "vm")
	for _, target := range targetDefs {
		secret, err := pveprovider.DecryptTargetCredential(key, target)
		if err != nil {
			warnings = append(warnings, "PVE "+target.Name+": "+err.Error())
			continue
		}
		client, err := pveprovider.NewClient(target, secret)
		if err != nil {
			warnings = append(warnings, "PVE "+target.Name+": "+err.Error())
			continue
		}
		data, err := client.Do(ctx, http.MethodGet, "/cluster/resources", q, nil)
		if err != nil {
			warnings = append(warnings, "PVE "+target.Name+": "+err.Error())
			continue
		}
		rows, err := decodePVEGuestRows(data)
		if err != nil {
			warnings = append(warnings, "PVE "+target.Name+" JSON: "+err.Error())
			continue
		}
		for _, row := range rows {
			guestType := normalizePVEGuestType(row.Type, row.ID)
			vmid := strings.TrimSpace(row.VMID)
			if vmid == "" {
				vmid = pveVMIDFromResourceID(row.ID)
			}
			node := strings.TrimSpace(row.Node)
			id := canonicalPVETargetID(target.ID, node, guestType, vmid)
			if id == "" {
				continue
			}
			ov := overrides[id]
			out = append(out, BastionTarget{
				ID:         id,
				Provider:   bastionProviderPVE,
				SourceID:   target.ID,
				Name:       bastionFirstNonEmpty(row.Name, target.Name+"-"+vmid, vmid),
				Kind:       pveGuestKind(guestType),
				GuestType:  guestType,
				PowerState: row.Status,
				Address:    strings.TrimSpace(ov.SSHHost),
				Node:       node,
			})
		}
	}
	return out, warnings
}

func collectExtraBastionTargets(pol *VCenterBastionPolicy) []BastionTarget {
	if pol == nil {
		return []BastionTarget{}
	}
	out := make([]BastionTarget, 0, len(pol.ExtraHosts))
	for _, h := range pol.ExtraHosts {
		id := canonicalExtraTargetID(h.ID)
		if id == "" {
			continue
		}
		out = append(out, BastionTarget{
			ID:        id,
			Provider:  bastionProviderExtra,
			SourceID:  h.ID,
			Name:      bastionFirstNonEmpty(h.Name, h.ID),
			Kind:      bastionFirstNonEmpty(strings.ToLower(strings.TrimSpace(h.Kind)), "linux"),
			Address:   h.Address,
			RDPWebURL: strings.TrimSpace(h.RDPWebURL),
		})
	}
	return out
}

type pveGuestRow struct {
	ID     string
	VMID   string
	Name   string
	Node   string
	Type   string
	Status string
}

func decodePVEGuestRows(raw json.RawMessage) ([]pveGuestRow, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var rows []map[string]interface{}
	if err := dec.Decode(&rows); err != nil {
		return nil, err
	}
	out := make([]pveGuestRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, pveGuestRow{
			ID:     bastionAnyString(row["id"]),
			VMID:   bastionAnyString(row["vmid"]),
			Name:   bastionAnyString(row["name"]),
			Node:   bastionAnyString(row["node"]),
			Type:   bastionAnyString(row["type"]),
			Status: bastionAnyString(row["status"]),
		})
	}
	return out, nil
}

func normalizePVEGuestType(raw, resourceID string) string {
	t := strings.ToLower(strings.TrimSpace(raw))
	switch t {
	case "qemu", "lxc":
		return t
	case "vm":
		return "qemu"
	case "ct":
		return "lxc"
	}
	prefix := strings.ToLower(strings.TrimSpace(strings.Split(resourceID, "/")[0]))
	if prefix == "qemu" || prefix == "lxc" {
		return prefix
	}
	return t
}

func pveGuestKind(guestType string) string {
	switch strings.ToLower(strings.TrimSpace(guestType)) {
	case "lxc":
		return "container"
	default:
		return "vm"
	}
}

func pveVMIDFromResourceID(id string) string {
	parts := strings.Split(strings.TrimSpace(id), "/")
	if len(parts) == 2 {
		return strings.TrimSpace(parts[1])
	}
	return ""
}

func applyBastionPolicyToTarget(pol *VCenterBastionPolicy, t BastionTarget) BastionTarget {
	if mg := bastionManualGroupNameForTarget(pol, t.ID); mg != "" {
		t.ManualGroup = mg
	}
	if u := bastionRdpWebURLForTarget(pol, t.ID); u != "" {
		t.RDPWebURL = u
	}
	return t
}

func filterBastionTargetsForUser(
	targets []BastionTarget,
	pol *VCenterBastionPolicy,
	username string,
	isAdmin bool,
	policyEdit bool,
) []BastionTarget {
	out := make([]BastionTarget, 0, len(targets))
	for _, target := range targets {
		if !bastionMayAccessTarget(pol, username, target.ID, isAdmin) {
			continue
		}
		if !policyEdit && bastionTargetHidden(pol, target.ID) {
			continue
		}
		out = append(out, applyBastionPolicyToTarget(pol, target))
	}
	return out
}

func bastionTargetsToLegacyVMs(targets []BastionTarget) []map[string]interface{} {
	out := make([]map[string]interface{}, 0)
	for _, target := range targets {
		if target.Provider != bastionProviderVCenter {
			continue
		}
		row := map[string]interface{}{}
		for k, v := range target.Raw {
			row[k] = v
		}
		if len(row) == 0 {
			row["moref"] = target.Moref
			row["name"] = target.Name
			row["powerState"] = target.PowerState
			row["guestId"] = target.GuestID
			row["ip"] = target.Address
			row["folderPath"] = target.FolderPath
		}
		if target.ManualGroup != "" {
			row["manualGroup"] = target.ManualGroup
		}
		if target.RDPWebURL != "" {
			row["rdpWebUrl"] = target.RDPWebURL
		}
		out = append(out, row)
	}
	return out
}

func bastionTargetsToLegacyExtras(targets []BastionTarget, pol *VCenterBastionPolicy) []ginHCompat {
	out := make([]ginHCompat, 0)
	for _, target := range targets {
		if target.Provider != bastionProviderExtra {
			continue
		}
		h := bastionFindExtraHost(pol, target.SourceID)
		if h == nil {
			continue
		}
		rdpPort := h.RDPPort
		if strings.TrimSpace(strings.ToLower(h.Kind)) == "windows" {
			rdpPort = 3389
		}
		eh := ginHCompat{
			"id":      h.ID,
			"name":    h.Name,
			"address": h.Address,
			"kind":    h.Kind,
			"sshPort": h.SSHPort,
			"rdpPort": rdpPort,
			"sshUser": h.SSHUser,
			"rdpUser": h.RDPUser,
		}
		if strings.TrimSpace(target.RDPWebURL) != "" {
			eh["rdpWebUrl"] = strings.TrimSpace(target.RDPWebURL)
		}
		out = append(out, eh)
	}
	return out
}

type ginHCompat map[string]interface{}

func bastionMapString(row map[string]interface{}, key string) string {
	if row == nil {
		return ""
	}
	return bastionAnyString(row[key])
}

func bastionAnyString(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(x)
	case json.Number:
		return strings.TrimSpace(x.String())
	case float64:
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	default:
		return strings.TrimSpace(fmt.Sprint(x))
	}
}

func bastionFirstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
