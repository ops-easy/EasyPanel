package provider

import (
	"encoding/json"
	"errors"
	"strings"

	pvemodel "github.com/ops-easy/EasyPanel/backend/api/pve/model"
	sharedcrypto "github.com/ops-easy/EasyPanel/backend/common/crypto"
	"github.com/ops-easy/EasyPanel/backend/pkg/platformkv"

	"github.com/google/uuid"
)

const KVKeyTargets = "easypanel_pve_targets_v1"

const (
	AuthMethodPassword = "password"
	AuthMethodToken    = "token"
	DefaultPVERealm    = "pam"
)

type targetsPayload struct {
	Targets []pvemodel.Target `json:"targets"`
}

type TargetBody struct {
	Name          string `json:"name"`
	BaseURL       string `json:"baseUrl"`
	AuthMethod    string `json:"authMethod"`
	Username      string `json:"username"`
	Realm         string `json:"realm"`
	Password      string `json:"password"`
	TokenID       string `json:"tokenId"`
	TokenSecret   string `json:"tokenSecret"`
	SkipTLS       bool   `json:"skipTls"`
	PrometheusJob string `json:"prometheusJob"`
	Confirm       bool   `json:"confirm"`
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

func TargetAuthMethod(target pvemodel.Target) string {
	method := strings.ToLower(strings.TrimSpace(target.AuthMethod))
	if method == AuthMethodPassword || method == AuthMethodToken {
		return method
	}
	if strings.TrimSpace(target.Username) != "" || strings.TrimSpace(target.PasswordEnc) != "" {
		return AuthMethodPassword
	}
	return AuthMethodToken
}

func targetAuthMethodFromBody(body TargetBody, cur *pvemodel.Target) string {
	method := strings.ToLower(strings.TrimSpace(body.AuthMethod))
	if method == AuthMethodPassword || method == AuthMethodToken {
		return method
	}
	if strings.TrimSpace(body.Username) != "" || strings.TrimSpace(body.Password) != "" {
		return AuthMethodPassword
	}
	if strings.TrimSpace(body.TokenID) != "" || strings.TrimSpace(body.TokenSecret) != "" {
		return AuthMethodToken
	}
	if cur != nil {
		return TargetAuthMethod(*cur)
	}
	return AuthMethodPassword
}

func NormalizePasswordIdentity(username, realm string) (string, string, error) {
	u := strings.TrimSpace(username)
	r := strings.TrimSpace(realm)
	if at := strings.LastIndex(u, "@"); at > 0 {
		embeddedRealm := strings.TrimSpace(u[at+1:])
		u = strings.TrimSpace(u[:at])
		if embeddedRealm != "" {
			r = embeddedRealm
		}
	}
	if u == "" {
		return "", "", errors.New("用户名不能为空")
	}
	if r == "" {
		r = DefaultPVERealm
	}
	return u, r, nil
}

func PasswordIdentity(target pvemodel.Target) (string, string) {
	u, r, err := NormalizePasswordIdentity(target.Username, target.Realm)
	if err != nil {
		return strings.TrimSpace(target.Username), strings.TrimSpace(target.Realm)
	}
	return u, r
}

func PasswordLoginUsername(target pvemodel.Target) string {
	u, r := PasswordIdentity(target)
	if strings.TrimSpace(u) == "" {
		return ""
	}
	if strings.TrimSpace(r) == "" {
		return strings.TrimSpace(u)
	}
	return strings.TrimSpace(u) + "@" + strings.TrimSpace(r)
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
	out.AuthMethod = targetAuthMethodFromBody(body, cur)
	switch out.AuthMethod {
	case AuthMethodPassword:
		username := strings.TrimSpace(body.Username)
		realm := strings.TrimSpace(body.Realm)
		if username == "" && cur != nil && TargetAuthMethod(*cur) == AuthMethodPassword {
			username = strings.TrimSpace(cur.Username)
			realm = strings.TrimSpace(cur.Realm)
		}
		normalizedUser, normalizedRealm, err := NormalizePasswordIdentity(username, realm)
		if err != nil {
			return out, err
		}
		out.Username = normalizedUser
		out.Realm = normalizedRealm
		if strings.TrimSpace(body.Password) != "" && body.Password != "***" {
			enc, err := sharedcrypto.EncryptSecret(key, body.Password)
			if err != nil {
				return out, err
			}
			out.PasswordEnc = enc
		}
		if strings.TrimSpace(out.PasswordEnc) == "" {
			return out, errors.New("密码不能为空")
		}
		out.TokenID = ""
		out.TokenSecretEnc = ""
	case AuthMethodToken:
		out.Realm = ""
		out.TokenID = strings.TrimSpace(body.TokenID)
		if out.TokenID == "" && cur != nil && TargetAuthMethod(*cur) == AuthMethodToken {
			out.TokenID = strings.TrimSpace(cur.TokenID)
		}
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
		out.Username = ""
		out.PasswordEnc = ""
	default:
		return out, errors.New("认证方式无效")
	}
	out.SkipTLS = body.SkipTLS
	out.PrometheusJob = strings.TrimSpace(body.PrometheusJob)
	out.UpdatedAt = now
	return out, nil
}

func DecryptTargetSecret(key []byte, target pvemodel.Target) (string, error) {
	return sharedcrypto.DecryptSecret(key, target.TokenSecretEnc)
}

func DecryptTargetPassword(key []byte, target pvemodel.Target) (string, error) {
	return sharedcrypto.DecryptSecret(key, target.PasswordEnc)
}

func DecryptTargetCredential(key []byte, target pvemodel.Target) (string, error) {
	if TargetAuthMethod(target) == AuthMethodPassword {
		return DecryptTargetPassword(key, target)
	}
	return DecryptTargetSecret(key, target)
}
