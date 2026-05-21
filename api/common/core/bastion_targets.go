package core

import (
	"errors"
	"strings"
)

const (
	bastionProviderVCenter = "vcenter"
	bastionProviderPVE     = "pve"
	bastionProviderExtra   = "extra"
)

type BastionTarget struct {
	ID          string                 `json:"id"`
	Provider    string                 `json:"provider"`
	SourceID    string                 `json:"sourceId,omitempty"`
	Name        string                 `json:"name"`
	Kind        string                 `json:"kind"`
	GuestType   string                 `json:"guestType,omitempty"`
	PowerState  string                 `json:"powerState,omitempty"`
	Address     string                 `json:"address,omitempty"`
	Node        string                 `json:"node,omitempty"`
	FolderPath  string                 `json:"folderPath,omitempty"`
	ManualGroup string                 `json:"manualGroup,omitempty"`
	GuestID     string                 `json:"guestId,omitempty"`
	RDPWebURL   string                 `json:"rdpWebUrl,omitempty"`
	Moref       string                 `json:"moref,omitempty"`
	Raw         map[string]interface{} `json:"-"`
}

type BastionTargetKey struct {
	Raw           string
	Canonical     string
	Provider      string
	VCenterMoRef  string
	ExtraID       string
	PVETargetID   string
	PVENode       string
	PVEGuestType  string
	PVEVMID       string
	LegacyVCenter bool
}

func canonicalVCenterTargetID(moref string) string {
	moref = strings.TrimSpace(moref)
	if moref == "" {
		return ""
	}
	return bastionProviderVCenter + ":" + moref
}

func canonicalExtraTargetID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	return bastionProviderExtra + ":" + strings.ToLower(id)
}

func canonicalPVETargetID(targetID, node, guestType, vmid string) string {
	targetID = strings.TrimSpace(targetID)
	node = strings.TrimSpace(node)
	guestType = strings.ToLower(strings.TrimSpace(guestType))
	vmid = strings.TrimSpace(vmid)
	if targetID == "" || node == "" || guestType == "" || vmid == "" {
		return ""
	}
	return strings.Join([]string{bastionProviderPVE, targetID, node, guestType, vmid}, ":")
}

func parseBastionTargetKey(raw string) (BastionTargetKey, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return BastionTargetKey{}, errors.New("target 为空")
	}
	parts := strings.Split(raw, ":")
	switch strings.ToLower(parts[0]) {
	case bastionProviderVCenter:
		if len(parts) != 2 || strings.TrimSpace(parts[1]) == "" {
			return BastionTargetKey{}, errors.New("vcenter target 格式应为 vcenter:<moref>")
		}
		moref := strings.TrimSpace(parts[1])
		return BastionTargetKey{Raw: raw, Canonical: canonicalVCenterTargetID(moref), Provider: bastionProviderVCenter, VCenterMoRef: moref}, nil
	case bastionProviderExtra:
		if len(parts) != 2 || strings.TrimSpace(parts[1]) == "" {
			return BastionTargetKey{}, errors.New("extra target 格式应为 extra:<id>")
		}
		id := strings.TrimSpace(parts[1])
		return BastionTargetKey{Raw: raw, Canonical: canonicalExtraTargetID(id), Provider: bastionProviderExtra, ExtraID: id}, nil
	case bastionProviderPVE:
		if len(parts) != 5 {
			return BastionTargetKey{}, errors.New("pve target 格式应为 pve:<targetId>:<node>:<guestType>:<vmid>")
		}
		targetID := strings.TrimSpace(parts[1])
		node := strings.TrimSpace(parts[2])
		guestType := strings.ToLower(strings.TrimSpace(parts[3]))
		vmid := strings.TrimSpace(parts[4])
		if targetID == "" || node == "" || guestType == "" || vmid == "" {
			return BastionTargetKey{}, errors.New("pve target 字段不能为空")
		}
		return BastionTargetKey{
			Raw:          raw,
			Canonical:    canonicalPVETargetID(targetID, node, guestType, vmid),
			Provider:     bastionProviderPVE,
			PVETargetID:  targetID,
			PVENode:      node,
			PVEGuestType: guestType,
			PVEVMID:      vmid,
		}, nil
	default:
		return BastionTargetKey{
			Raw:           raw,
			Canonical:     canonicalVCenterTargetID(raw),
			Provider:      bastionProviderVCenter,
			VCenterMoRef:  raw,
			LegacyVCenter: true,
		}, nil
	}
}

func normalizePolicyTargetID(raw string) string {
	parsed, err := parseBastionTargetKey(raw)
	if err != nil {
		return ""
	}
	return parsed.Canonical
}

func bastionTargetSSHStoreKey(targetID string) string {
	targetID = normalizePolicyTargetID(targetID)
	if targetID == "" {
		return ""
	}
	return "bastion-target:" + targetID
}

func bastionPolicyTargetMatches(policyValue, targetID string) bool {
	policyValue = strings.TrimSpace(policyValue)
	if policyValue == "*" {
		return true
	}
	pol := normalizePolicyTargetID(policyValue)
	target := normalizePolicyTargetID(targetID)
	return pol != "" && target != "" && strings.EqualFold(pol, target)
}

func bastionMayAccessTarget(policy *VCenterBastionPolicy, username, targetID string, isAdmin bool) bool {
	if isAdmin {
		return true
	}
	if policy == nil || !policy.EnableACL {
		return true
	}
	targetID = normalizePolicyTargetID(targetID)
	if targetID == "" {
		return false
	}
	u := strings.ToLower(strings.TrimSpace(username))
	list := policy.UserVMs[u]
	if len(list) == 0 {
		return false
	}
	for _, v := range list {
		if bastionPolicyTargetMatches(v, targetID) {
			return true
		}
	}
	return false
}

func bastionTargetHidden(policy *VCenterBastionPolicy, targetID string) bool {
	if policy == nil {
		return false
	}
	targetID = normalizePolicyTargetID(targetID)
	if targetID == "" {
		return false
	}
	for _, x := range policy.HiddenTargetIDs {
		if strings.EqualFold(normalizePolicyTargetID(x), targetID) {
			return true
		}
	}
	for _, x := range policy.HiddenVmMorefs {
		if strings.EqualFold(canonicalVCenterTargetID(x), targetID) {
			return true
		}
	}
	return false
}

func bastionManualGroupNameForTarget(policy *VCenterBastionPolicy, targetID string) string {
	if policy == nil {
		return ""
	}
	targetID = normalizePolicyTargetID(targetID)
	if targetID == "" {
		return ""
	}
	for _, g := range policy.TargetGroups {
		name := strings.TrimSpace(g.Name)
		if name == "" {
			continue
		}
		for _, x := range g.TargetIDs {
			if strings.EqualFold(normalizePolicyTargetID(x), targetID) {
				return name
			}
		}
	}
	for _, g := range policy.ManualVmGroups {
		name := strings.TrimSpace(g.Name)
		if name == "" {
			continue
		}
		for _, x := range g.Morefs {
			if strings.EqualFold(canonicalVCenterTargetID(x), targetID) {
				return name
			}
		}
	}
	return ""
}

func bastionRdpWebURLForTarget(policy *VCenterBastionPolicy, targetID string) string {
	if policy == nil {
		return ""
	}
	targetID = normalizePolicyTargetID(targetID)
	if targetID == "" {
		return ""
	}
	for _, e := range policy.TargetRdpWebEmbeds {
		if strings.EqualFold(normalizePolicyTargetID(e.TargetID), targetID) {
			return strings.TrimSpace(e.URL)
		}
	}
	for _, e := range policy.VmRdpWebEmbeds {
		if strings.EqualFold(canonicalVCenterTargetID(e.Moref), targetID) {
			return strings.TrimSpace(e.URL)
		}
	}
	return ""
}
