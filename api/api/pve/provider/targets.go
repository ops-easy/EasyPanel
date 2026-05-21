package provider

import (
	"encoding/json"
	"errors"
	"strings"

	pvemodel "kube-bt-sync/api/pve/model"
	sharedcrypto "kube-bt-sync/common/crypto"
	"kube-bt-sync/pkg/platformkv"

	"github.com/google/uuid"
)

const KVKeyTargets = "kubebt_pve_targets_v1"

type targetsPayload struct {
	Targets []pvemodel.Target `json:"targets"`
}

type TargetBody struct {
	Name          string `json:"name"`
	BaseURL       string `json:"baseUrl"`
	TokenID       string `json:"tokenId"`
	TokenSecret   string `json:"tokenSecret"`
	SkipTLS       bool   `json:"skipTls"`
	PrometheusJob string `json:"prometheusJob"`
}

func LoadTargets(kv platformkv.Store) ([]pvemodel.Target, error) {
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(KVKeyTargets)
	if !ok || strings.TrimSpace(raw) == "" {
		return []pvemodel.Target{}, nil
	}
	var p targetsPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	if p.Targets == nil {
		return []pvemodel.Target{}, nil
	}
	return p.Targets, nil
}

func SaveTargets(kv platformkv.Store, list []pvemodel.Target) error {
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	b, err := json.Marshal(targetsPayload{Targets: list})
	if err != nil {
		return err
	}
	return kv.Set(KVKeyTargets, string(b))
}

func NormalizeTargetFromBody(body TargetBody, cur *pvemodel.Target, key []byte, now string) (pvemodel.Target, error) {
	out := pvemodel.Target{}
	if cur != nil {
		out = *cur
	} else {
		out.ID = uuid.NewString()
		out.CreatedAt = now
	}
	out.Name = strings.TrimSpace(body.Name)
	if out.Name == "" {
		out.Name = "PVE"
	}
	base, err := NormalizeBaseURL(body.BaseURL)
	if err != nil {
		return out, err
	}
	out.BaseURL = base
	out.TokenID = strings.TrimSpace(body.TokenID)
	if out.TokenID == "" {
		return out, errors.New("tokenId 不能为空")
	}
	if strings.TrimSpace(body.TokenSecret) != "" && body.TokenSecret != "***" {
		enc, err := sharedcrypto.EncryptSecret(key, body.TokenSecret)
		if err != nil {
			return out, err
		}
		out.TokenSecretEnc = enc
	}
	if strings.TrimSpace(out.TokenSecretEnc) == "" {
		return out, errors.New("tokenSecret 不能为空")
	}
	out.SkipTLS = body.SkipTLS
	out.PrometheusJob = strings.TrimSpace(body.PrometheusJob)
	out.UpdatedAt = now
	return out, nil
}

func DecryptTargetSecret(key []byte, target pvemodel.Target) (string, error) {
	return sharedcrypto.DecryptSecret(key, target.TokenSecretEnc)
}
