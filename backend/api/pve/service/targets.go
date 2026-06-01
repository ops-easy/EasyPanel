package service

import (
	"net/http"
	"strings"

	pvemodel "github.com/ops-easy/EasyPanel/backend/api/pve/model"
	pveprovider "github.com/ops-easy/EasyPanel/backend/api/pve/provider"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	"github.com/ops-easy/EasyPanel/backend/common/authz"
	sharedcrypto "github.com/ops-easy/EasyPanel/backend/common/crypto"
	"github.com/ops-easy/EasyPanel/backend/common/result"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp
type PlatformKV = appctx.PlatformKV

const kvKeyPVETargets = pveprovider.KVKeyTargets

type pveTargetBody = pveprovider.TargetBody

func loadPVETargets(kv PlatformKV) ([]pvemodel.Target, error) {
	return pveprovider.LoadTargets(kv)
}

func savePVETargets(kv PlatformKV, list []pvemodel.Target) error {
	return pveprovider.SaveTargets(kv, list)
}

func pveTargetListItem(x pvemodel.Target, key []byte) pvemodel.TargetListItem {
	authMethod := pveprovider.TargetAuthMethod(x)
	username := x.Username
	realm := x.Realm
	if authMethod == pveprovider.AuthMethodPassword {
		username, realm = pveprovider.PasswordIdentity(x)
	}
	item := pvemodel.TargetListItem{
		ID:             x.ID,
		Name:           x.Name,
		BaseURL:        x.BaseURL,
		AuthMethod:     authMethod,
		Username:       username,
		Realm:          realm,
		PasswordSet:    strings.TrimSpace(x.PasswordEnc) != "",
		TokenID:        x.TokenID,
		TokenSecretSet: strings.TrimSpace(x.TokenSecretEnc) != "",
		SkipTLS:        x.SkipTLS,
		PrometheusJob:  x.PrometheusJob,
		CreatedAt:      x.CreatedAt,
		UpdatedAt:      x.UpdatedAt,
	}
	if authMethod == pveprovider.AuthMethodPassword && item.PasswordSet {
		item.PasswordPreview = "已保存"
	}
	if key != nil && strings.TrimSpace(x.TokenSecretEnc) != "" {
		if plain, err := pveprovider.DecryptTargetSecret(key, x); err == nil {
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
	if authz.EffectiveDashboardPermissionsFromGin(c).Compute == authz.ModuleAccessRW {
		return true
	}
	result.PermissionDenied(c)
	return false
}

func pveEncryptionKey(app *ServerApp) ([]byte, error) {
	return sharedcrypto.DeriveAESKey(app.Cfg().EncryptionKey)
}

func normalizePVETargetFromBody(body pveTargetBody, cur *pvemodel.Target, key []byte) (pvemodel.Target, error) {
	return pveprovider.NormalizeTargetFromBody(body, cur, key, NowBeijingRFC3339())
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

func singlePVETargetFromList(list []pvemodel.Target) (pvemodel.Target, bool) {
	collapsed := collapsePVETargetsToSingleton(list)
	if len(collapsed) == 0 {
		return pvemodel.Target{}, false
	}
	return collapsed[0], true
}

func collapsePVETargetsToSingleton(list []pvemodel.Target) []pvemodel.Target {
	for _, target := range list {
		if strings.TrimSpace(target.ID) != "" {
			return []pvemodel.Target{target}
		}
	}
	return []pvemodel.Target{}
}

func decryptPVETargetSecret(app *ServerApp, target pvemodel.Target) (string, error) {
	key, err := pveEncryptionKey(app)
	if err != nil {
		return "", err
	}
	return pveprovider.DecryptTargetSecret(key, target)
}

func decryptPVETargetCredential(app *ServerApp, target pvemodel.Target) (string, error) {
	key, err := pveEncryptionKey(app)
	if err != nil {
		return "", err
	}
	return pveprovider.DecryptTargetCredential(key, target)
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
	effective := collapsePVETargetsToSingleton(list)
	out := make([]pvemodel.TargetListItem, 0, len(effective))
	for _, x := range effective {
		out = append(out, pveTargetListItem(x, key))
	}
	c.JSON(http.StatusOK, gin.H{"targets": out})
}

func handlePVETargetCreate(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	var body pveTargetBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !requirePVEConfirm(c, body.Confirm, "PVE target create") {
		return
	}
	key, err := pveEncryptionKey(app)
	if err != nil {
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
	list = []pvemodel.Target{target}
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
	var body pveTargetBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !requirePVEConfirm(c, body.Confirm, "PVE target update") {
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
	cur, _ := findPVETarget(list, c.Param("id"))
	if cur == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "PVE 目标不存在"})
		return
	}
	target, err := normalizePVETargetFromBody(body, cur, key)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	list = []pvemodel.Target{target}
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
	if !requirePVEConfirm(c, pveConfirmed(c.Query("confirm")), "PVE target delete") {
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
	plain, err := decryptPVETargetCredential(app, *target)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法解密 PVE 凭据: " + err.Error()})
		return nil, pvemodel.Target{}, false
	}
	client, err := newPVEAPIClient(*target, plain)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, pvemodel.Target{}, false
	}
	return client, *target, true
}
