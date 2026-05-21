package core

import (
	"encoding/json"
	"strings"
)

const platformKVKeyBastionTargetOverrides = "bastion:target:overrides:v1"

type BastionTargetOverride struct {
	TargetID  string `json:"targetId"`
	SSHHost   string `json:"sshHost,omitempty"`
	SSHPort   int    `json:"sshPort,omitempty"`
	SSHUser   string `json:"sshUser,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

type bastionTargetOverridesPayload struct {
	Targets map[string]BastionTargetOverride `json:"targets"`
}

func loadBastionTargetOverrides(kv PlatformKV) map[string]BastionTargetOverride {
	out := map[string]BastionTargetOverride{}
	if kv == nil {
		return out
	}
	raw, ok := kv.Get(platformKVKeyBastionTargetOverrides)
	if !ok || strings.TrimSpace(raw) == "" {
		return out
	}
	var payload bastionTargetOverridesPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil || payload.Targets == nil {
		return out
	}
	for k, v := range payload.Targets {
		id := normalizePolicyTargetID(k)
		if id == "" {
			id = normalizePolicyTargetID(v.TargetID)
		}
		if id == "" {
			continue
		}
		v.TargetID = id
		out[id] = v
	}
	return out
}

func saveBastionTargetOverrides(kv PlatformKV, m map[string]BastionTargetOverride) error {
	if kv == nil {
		return nil
	}
	if m == nil {
		m = map[string]BastionTargetOverride{}
	}
	payload := bastionTargetOverridesPayload{Targets: m}
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return kv.Set(platformKVKeyBastionTargetOverrides, string(b))
}

func getBastionTargetOverride(kv PlatformKV, targetID string) BastionTargetOverride {
	id := normalizePolicyTargetID(targetID)
	if id == "" {
		return BastionTargetOverride{}
	}
	return loadBastionTargetOverrides(kv)[id]
}

func putBastionTargetOverride(kv PlatformKV, targetID string, patch BastionTargetOverride) error {
	id := normalizePolicyTargetID(targetID)
	if id == "" {
		return nil
	}
	m := loadBastionTargetOverrides(kv)
	patch.TargetID = id
	m[id] = patch
	return saveBastionTargetOverrides(kv, m)
}

func deleteBastionTargetOverride(kv PlatformKV, targetID string) error {
	id := normalizePolicyTargetID(targetID)
	if id == "" {
		return nil
	}
	m := loadBastionTargetOverrides(kv)
	delete(m, id)
	return saveBastionTargetOverrides(kv, m)
}
