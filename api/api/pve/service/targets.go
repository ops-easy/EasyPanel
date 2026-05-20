package service

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	pvemodel "kube-bt-sync/api/pve/model"
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/authz"
	sharedcrypto "kube-bt-sync/common/crypto"
	"kube-bt-sync/common/result"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ServerApp = appctx.ServerApp
type PlatformKV = appctx.PlatformKV

const kvKeyPVETargets = "kubebt_pve_targets_v1"

type pveTargetsPayload struct {
	Targets []pvemodel.Target `json:"targets"`
}

func loadPVETargets(kv PlatformKV) ([]pvemodel.Target, error) {
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(kvKeyPVETargets)
	if !ok || strings.TrimSpace(raw) == "" {
		return []pvemodel.Target{}, nil
	}
	var p pveTargetsPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	if p.Targets == nil {
		return []pvemodel.Target{}, nil
	}
	return p.Targets, nil
}

func savePVETargets(kv PlatformKV, list []pvemodel.Target) error {
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	b, err := json.Marshal(pveTargetsPayload{Targets: list})
	if err != nil {
		return err
	}
	return kv.Set(kvKeyPVETargets, string(b))
}

func pveTargetListItem(x pvemodel.Target, key []byte) pvemodel.TargetListItem {
	item := pvemodel.TargetListItem{
		ID:             x.ID,
		Name:           x.Name,
		BaseURL:        x.BaseURL,
		TokenID:        x.TokenID,
		TokenSecretSet: strings.TrimSpace(x.TokenSecretEnc) != "",
		SkipTLS:        x.SkipTLS,
		PrometheusJob:  x.PrometheusJob,
		CreatedAt:      x.CreatedAt,
		UpdatedAt:      x.UpdatedAt,
	}
	if key != nil && strings.TrimSpace(x.TokenSecretEnc) != "" {
		if plain, err := sharedcrypto.DecryptSecret(key, x.TokenSecretEnc); err == nil {
			item.TokenSecretPreview = maskPVESecretPreview(plain)
		}
	}
	return item
}

func maskPVESecretPreview(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if len(s) <= 8 {
		return "****"
	}
	return s[:4] + "****" + s[len(s)-4:]
}

func requirePVEAdmin(c *gin.Context) bool {
	if authz.DashboardRoleFromGin(c) == authz.DashboardRoleAdmin {
		return true
	}
	result.PermissionDenied(c)
	return false
}

func pveEncryptionKey(app *ServerApp) ([]byte, error) {
	return sharedcrypto.DeriveAESKey(app.Cfg().EncryptionKey)
}

type pveTargetBody struct {
	Name          string `json:"name"`
	BaseURL       string `json:"baseUrl"`
	TokenID       string `json:"tokenId"`
	TokenSecret   string `json:"tokenSecret"`
	SkipTLS       bool   `json:"skipTls"`
	PrometheusJob string `json:"prometheusJob"`
}

func normalizePVETargetFromBody(body pveTargetBody, cur *pvemodel.Target, key []byte) (pvemodel.Target, error) {
	now := NowBeijingRFC3339()
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
	base, err := normalizePVEBaseURL(body.BaseURL)
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

func findPVETarget(list []pvemodel.Target, id string) (*pvemodel.Target, int) {
	id = strings.TrimSpace(id)
	for i := range list {
		if list[i].ID == id {
			return &list[i], i
		}
	}
	return nil, -1
}

func decryptPVETargetSecret(app *ServerApp, target pvemodel.Target) (string, error) {
	key, err := pveEncryptionKey(app)
	if err != nil {
		return "", err
	}
	return sharedcrypto.DecryptSecret(key, target.TokenSecretEnc)
}

func handlePVETargetsList(c *gin.Context, app *ServerApp) {
	if app.PlatformKV() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "platform_kv 不可用"})
		return
	}
	list, err := loadPVETargets(app.PlatformKV())
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	key, _ := pveEncryptionKey(app)
	out := make([]pvemodel.TargetListItem, 0, len(list))
	for _, x := range list {
		out = append(out, pveTargetListItem(x, key))
	}
	c.JSON(http.StatusOK, gin.H{"targets": out})
}

func handlePVETargetCreate(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	key, err := pveEncryptionKey(app)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body pveTargetBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	target, err := normalizePVETargetFromBody(body, nil, key)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	list, err := loadPVETargets(app.PlatformKV())
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	list = append([]pvemodel.Target{target}, list...)
	if err := savePVETargets(app.PlatformKV(), list); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"target": pveTargetListItem(target, key)})
}

func handlePVETargetUpdate(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	key, err := pveEncryptionKey(app)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	list, err := loadPVETargets(app.PlatformKV())
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	cur, idx := findPVETarget(list, c.Param("id"))
	if cur == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "PVE 目标不存在"})
		return
	}
	var body pveTargetBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	target, err := normalizePVETargetFromBody(body, cur, key)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	list[idx] = target
	if err := savePVETargets(app.PlatformKV(), list); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"target": pveTargetListItem(target, key)})
}

func handlePVETargetDelete(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	list, err := loadPVETargets(app.PlatformKV())
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	out := make([]pvemodel.Target, 0, len(list))
	for _, x := range list {
		if x.ID != id {
			out = append(out, x)
		}
	}
	if err := savePVETargets(app.PlatformKV(), out); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func pveClientForRequest(c *gin.Context, app *ServerApp) (*pveAPIClient, pvemodel.Target, bool) {
	list, err := loadPVETargets(app.PlatformKV())
	if err != nil {
		result.Error500(c, err.Error())
		return nil, pvemodel.Target{}, false
	}
	target, _ := findPVETarget(list, c.Param("id"))
	if target == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "PVE 目标不存在"})
		return nil, pvemodel.Target{}, false
	}
	plain, err := decryptPVETargetSecret(app, *target)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法解密 PVE Token: " + err.Error()})
		return nil, pvemodel.Target{}, false
	}
	client, err := newPVEAPIClient(*target, plain)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, pvemodel.Target{}, false
	}
	return client, *target, true
}
