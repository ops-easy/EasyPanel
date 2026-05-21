package core

import (
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
)

const platformKVKeyVCenterBastionPolicy = "vcenter:bastion:policy"

// BastionExtraHost 是非 vCenter/PVE API 纳管的固定地址目标。
type BastionExtraHost struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Address   string `json:"address"`
	Kind      string `json:"kind"` // linux | windows
	SSHPort   int    `json:"sshPort"`
	RDPPort   int    `json:"rdpPort"`
	SSHUser   string `json:"sshUser,omitempty"`
	RDPUser   string `json:"rdpUser,omitempty"`
	RDPWebURL string `json:"rdpWebUrl,omitempty"`
}

type BastionVmRdpWebEmbed struct {
	Moref string `json:"moref"`
	URL   string `json:"url"`
}

type BastionManualVmGroup struct {
	Name   string   `json:"name"`
	Morefs []string `json:"morefs"`
}

type BastionManualTargetGroup struct {
	Name      string   `json:"name"`
	TargetIDs []string `json:"targetIds"`
}

type BastionTargetRdpWebEmbed struct {
	TargetID string `json:"targetId"`
	URL      string `json:"url"`
}

type VCenterBastionPolicy struct {
	EnableACL          bool                       `json:"enableAcl"`
	UserVMs            map[string][]string        `json:"userVms"`
	ExtraHosts         []BastionExtraHost         `json:"extraHosts"`
	ManualVmGroups     []BastionManualVmGroup     `json:"manualVmGroups"`
	TargetGroups       []BastionManualTargetGroup `json:"targetGroups,omitempty"`
	HiddenVmMorefs     []string                   `json:"hiddenVmMorefs"`
	HiddenTargetIDs    []string                   `json:"hiddenTargetIds,omitempty"`
	VmRdpWebEmbeds     []BastionVmRdpWebEmbed     `json:"vmRdpWebEmbeds"`
	TargetRdpWebEmbeds []BastionTargetRdpWebEmbed `json:"targetRdpWebEmbeds,omitempty"`
	NativeSshEnabled   bool                       `json:"nativeSshEnabled"`
	NativeSshPort      int                        `json:"nativeSshPort"`
}

func bastionPolicyDefault() *VCenterBastionPolicy {
	return &VCenterBastionPolicy{
		EnableACL:          false,
		UserVMs:            map[string][]string{},
		ExtraHosts:         []BastionExtraHost{},
		ManualVmGroups:     []BastionManualVmGroup{},
		TargetGroups:       []BastionManualTargetGroup{},
		HiddenVmMorefs:     []string{},
		HiddenTargetIDs:    []string{},
		VmRdpWebEmbeds:     []BastionVmRdpWebEmbed{},
		TargetRdpWebEmbeds: []BastionTargetRdpWebEmbed{},
		NativeSshEnabled:   false,
		NativeSshPort:      2222,
	}
}

func loadVCenterBastionPolicy(kv PlatformKV) *VCenterBastionPolicy {
	def := bastionPolicyDefault()
	if kv == nil {
		return def
	}
	raw, ok := kv.Get(platformKVKeyVCenterBastionPolicy)
	if !ok || strings.TrimSpace(raw) == "" {
		return def
	}
	var p VCenterBastionPolicy
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return def
	}
	normalizeBastionPolicy(&p)
	return &p
}

func normalizeBastionPolicy(p *VCenterBastionPolicy) {
	if p.UserVMs == nil {
		p.UserVMs = map[string][]string{}
	}
	if p.ExtraHosts == nil {
		p.ExtraHosts = []BastionExtraHost{}
	}
	if p.ManualVmGroups == nil {
		p.ManualVmGroups = []BastionManualVmGroup{}
	}
	if p.TargetGroups == nil {
		p.TargetGroups = []BastionManualTargetGroup{}
	}
	if p.HiddenVmMorefs == nil {
		p.HiddenVmMorefs = []string{}
	}
	if p.HiddenTargetIDs == nil {
		p.HiddenTargetIDs = []string{}
	}
	if p.VmRdpWebEmbeds == nil {
		p.VmRdpWebEmbeds = []BastionVmRdpWebEmbed{}
	}
	if p.TargetRdpWebEmbeds == nil {
		p.TargetRdpWebEmbeds = []BastionTargetRdpWebEmbed{}
	}
	if p.NativeSshPort == 0 {
		p.NativeSshPort = 2222
	}
	for i := range p.ExtraHosts {
		if strings.TrimSpace(strings.ToLower(p.ExtraHosts[i].Kind)) == "windows" {
			p.ExtraHosts[i].RDPPort = 3389
		}
	}
}

func bastionRdpWebURLForVM(policy *VCenterBastionPolicy, moref string) string {
	return bastionRdpWebURLForTarget(policy, canonicalVCenterTargetID(moref))
}

func bastionVmMorefHidden(pol *VCenterBastionPolicy, moref string) bool {
	return bastionTargetHidden(pol, canonicalVCenterTargetID(moref))
}

func bastionManualGroupNameFor(policy *VCenterBastionPolicy, moref string) string {
	return bastionManualGroupNameForTarget(policy, canonicalVCenterTargetID(moref))
}

func bastionExtraTarget(id string) string {
	return canonicalExtraTargetID(id)
}

func bastionFindExtraHost(policy *VCenterBastionPolicy, id string) *BastionExtraHost {
	if policy == nil {
		return nil
	}
	id = strings.TrimSpace(strings.ToLower(id))
	for i := range policy.ExtraHosts {
		h := &policy.ExtraHosts[i]
		if strings.EqualFold(strings.TrimSpace(h.ID), id) {
			return h
		}
	}
	return nil
}

func bastionMayAccess(policy *VCenterBastionPolicy, username, target string, isAdmin bool) bool {
	return bastionMayAccessTarget(policy, username, target, isAdmin)
}

func vcenterBastionAbortIfForbiddenTarget(c *gin.Context, app *ServerApp, target string) bool {
	target = strings.TrimSpace(target)
	if target == "" {
		return false
	}
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	user := dashboardUsernameFromGin(c)
	admin := getDashboardRoleFromGin(c) == DashboardRoleAdmin
	if bastionMayAccessTarget(pol, user, target, admin) {
		return false
	}
	RespondAPIPermissionDenied(c)
	return true
}

func vcenterBastionAbortIfForbidden(c *gin.Context, app *ServerApp, moref string) bool {
	return vcenterBastionAbortIfForbiddenTarget(c, app, canonicalVCenterTargetID(moref))
}
