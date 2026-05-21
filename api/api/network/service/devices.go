package service

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"

	networkmodel "kube-bt-sync/api/network/model"
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/authz"
	sharedcrypto "kube-bt-sync/common/crypto"
	"kube-bt-sync/common/result"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ServerApp = appctx.ServerApp
type PlatformKV = appctx.PlatformKV
type Config = appctx.Config

const kvKeyNetworkDevices = "kubebt_network_devices_v1"

const (
	networkDeviceKindIkuai       = "ikuai"
	networkDeviceKindOpenWrt     = "openwrt"
	openWrtAuthTypeSSHPassword   = "ssh-password"
	openWrtAuthTypeSSHPrivateKey = "ssh-key"
)

type networkDevicesPayload struct {
	Devices []networkmodel.Device `json:"devices"`
}

func normalizeNetworkDeviceKind(kind string) (string, error) {
	k := strings.ToLower(strings.TrimSpace(kind))
	switch k {
	case networkDeviceKindIkuai, networkDeviceKindOpenWrt:
		return k, nil
	default:
		return "", errors.New("kind 必须为 ikuai 或 openwrt")
	}
}

func normalizeNetworkPrometheusScope(scope string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(scope))
	if s == "" {
		s = "network"
	}
	switch s {
	case "network", "vcenter", "default":
		return s, nil
	default:
		return "", errors.New("prometheusScope 必须为 network、vcenter 或 default")
	}
}

func normalizeOpenWrtAuthType(authType string) (string, error) {
	a := strings.ToLower(strings.TrimSpace(authType))
	switch a {
	case "", "ssh", "password", openWrtAuthTypeSSHPassword:
		return openWrtAuthTypeSSHPassword, nil
	case "key", "private-key", openWrtAuthTypeSSHPrivateKey:
		return openWrtAuthTypeSSHPrivateKey, nil
	default:
		return "", errors.New("authType 必须为 ssh-password 或 ssh-key")
	}
}

func loadNetworkDevices(kv PlatformKV) ([]networkmodel.Device, error) {
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(kvKeyNetworkDevices)
	if !ok || strings.TrimSpace(raw) == "" {
		return []networkmodel.Device{}, nil
	}
	var p networkDevicesPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	if p.Devices == nil {
		return []networkmodel.Device{}, nil
	}
	return p.Devices, nil
}

func saveNetworkDevices(kv PlatformKV, list []networkmodel.Device) error {
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	b, err := json.Marshal(networkDevicesPayload{Devices: list})
	if err != nil {
		return err
	}
	return kv.Set(kvKeyNetworkDevices, string(b))
}

func requireNetworkAdmin(c *gin.Context) bool {
	if authz.DashboardRoleFromGin(c) == authz.DashboardRoleAdmin {
		return true
	}
	if authz.EffectiveDashboardPermissionsFromGin(c).Network == authz.ModuleAccessRW {
		return true
	}
	result.PermissionDenied(c)
	return false
}

func networkEncryptionKey(app *ServerApp) ([]byte, error) {
	if app == nil {
		return nil, errors.New("应用上下文不可用")
	}
	return sharedcrypto.DeriveAESKey(app.Cfg().EncryptionKey)
}

func normalizeNetworkDeviceFromBody(body networkDeviceBody, cur *networkmodel.Device, key []byte) (networkmodel.Device, error) {
	now := NowShanghaiRFC3339()
	out := networkmodel.Device{}
	if cur != nil {
		out = *cur
	} else {
		out.ID = uuid.NewString()
		out.CreatedAt = now
	}
	kind, err := normalizeNetworkDeviceKind(body.Kind)
	if err != nil {
		return out, err
	}
	scope, err := normalizeNetworkPrometheusScope(body.PrometheusScope)
	if err != nil {
		return out, err
	}
	out.Kind = kind
	out.Name = strings.TrimSpace(body.Name)
	if out.Name == "" {
		out.Name = strings.ToUpper(kind)
	}
	out.APIURL = strings.TrimSpace(body.APIURL)
	out.Host = strings.TrimSpace(body.Host)
	out.Port = body.Port
	out.AuthType = strings.TrimSpace(body.AuthType)
	out.Username = strings.TrimSpace(body.Username)
	out.SkipTLSVerify = body.SkipTLSVerify
	out.PrometheusScope = scope
	out.InstanceLabel = strings.TrimSpace(body.InstanceLabel)
	out.JobLabel = strings.TrimSpace(body.JobLabel)
	out.Notes = strings.TrimSpace(body.Notes)

	if out.Kind == networkDeviceKindOpenWrt {
		if err := normalizeOpenWrtDeviceFields(&out, body, cur, key); err != nil {
			return out, err
		}
	} else {
		out.APIURL = ""
		out.Host = ""
		out.Port = 0
		out.AuthType = ""
		out.Username = ""
		out.PasswordEnc = ""
		out.PrivateKeyEnc = ""
		out.SkipTLSVerify = false
	}
	out.Password = ""
	out.PrivateKey = ""
	out.UpdatedAt = now
	return out, nil
}

func normalizeOpenWrtDeviceFields(out *networkmodel.Device, body networkDeviceBody, cur *networkmodel.Device, key []byte) error {
	if out.APIURL == "" && cur != nil {
		out.APIURL = strings.TrimSpace(cur.APIURL)
	}
	if out.Host == "" && cur != nil {
		out.Host = strings.TrimSpace(cur.Host)
	}
	if out.Host == "" && out.APIURL != "" {
		if u, err := url.Parse(out.APIURL); err == nil {
			out.Host = u.Hostname()
			if out.Port == 0 {
				if p := u.Port(); p != "" {
					if p == "22" {
						out.Port = 22
					}
				}
			}
		}
	}
	if out.Host == "" {
		return errors.New("OpenWrt 目标必须填写 host 或 apiUrl")
	}
	if out.Port == 0 {
		if cur != nil && cur.Port > 0 {
			out.Port = cur.Port
		} else {
			out.Port = 22
		}
	}
	if out.Username == "" {
		if cur != nil && strings.TrimSpace(cur.Username) != "" {
			out.Username = strings.TrimSpace(cur.Username)
		} else {
			out.Username = "root"
		}
	}
	authType, err := normalizeOpenWrtAuthType(out.AuthType)
	if err != nil {
		return err
	}
	out.AuthType = authType

	if cur != nil {
		out.PasswordEnc = cur.PasswordEnc
		out.PrivateKeyEnc = cur.PrivateKeyEnc
	}
	if strings.TrimSpace(body.Password) != "" && body.Password != "***" {
		enc, err := sharedcrypto.EncryptSecret(key, body.Password)
		if err != nil {
			return err
		}
		out.PasswordEnc = enc
	}
	if strings.TrimSpace(body.PrivateKey) != "" && body.PrivateKey != "***" {
		enc, err := sharedcrypto.EncryptSecret(key, body.PrivateKey)
		if err != nil {
			return err
		}
		out.PrivateKeyEnc = enc
	}
	switch out.AuthType {
	case openWrtAuthTypeSSHPassword:
		if strings.TrimSpace(out.PasswordEnc) == "" {
			return errors.New("OpenWrt SSH 密码不能为空")
		}
	case openWrtAuthTypeSSHPrivateKey:
		if strings.TrimSpace(out.PrivateKeyEnc) == "" {
			return errors.New("OpenWrt SSH 私钥不能为空")
		}
	}
	return nil
}

func normalizeNetworkDeviceInput(body networkmodel.Device) networkmodel.Device {
	out := body
	kind, _ := normalizeNetworkDeviceKind(out.Kind)
	out.Kind = kind
	if out.Kind == networkDeviceKindOpenWrt {
		if out.Host == "" && out.APIURL != "" {
			if u, err := url.Parse(out.APIURL); err == nil {
				out.Host = u.Hostname()
			}
		}
		if out.Port == 0 {
			out.Port = 22
		}
		if out.Username == "" {
			out.Username = "root"
		}
		if auth, err := normalizeOpenWrtAuthType(out.AuthType); err == nil {
			out.AuthType = auth
		}
	}
	return out
}

func networkDeviceListItem(x networkmodel.Device) networkmodel.DeviceListItem {
	return networkmodel.DeviceListItem{
		ID:              x.ID,
		Kind:            x.Kind,
		Name:            x.Name,
		APIURL:          x.APIURL,
		Host:            x.Host,
		Port:            x.Port,
		AuthType:        x.AuthType,
		Username:        x.Username,
		PasswordSet:     strings.TrimSpace(x.PasswordEnc) != "",
		PrivateKeySet:   strings.TrimSpace(x.PrivateKeyEnc) != "",
		SkipTLSVerify:   x.SkipTLSVerify,
		PrometheusScope: x.PrometheusScope,
		InstanceLabel:   x.InstanceLabel,
		JobLabel:        x.JobLabel,
		Notes:           x.Notes,
		CreatedAt:       x.CreatedAt,
		UpdatedAt:       x.UpdatedAt,
	}
}

type networkDeviceBody struct {
	Kind            string `json:"kind"`
	Name            string `json:"name"`
	APIURL          string `json:"apiUrl"`
	Host            string `json:"host"`
	Port            int    `json:"port"`
	AuthType        string `json:"authType"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	PrivateKey      string `json:"privateKey"`
	SkipTLSVerify   bool   `json:"skipTlsVerify"`
	PrometheusScope string `json:"prometheusScope"`
	InstanceLabel   string `json:"instanceLabel"`
	JobLabel        string `json:"jobLabel"`
	Notes           string `json:"notes"`
}

func findNetworkDevice(list []networkmodel.Device, id string) (*networkmodel.Device, int) {
	id = strings.TrimSpace(id)
	for i := range list {
		if list[i].ID == id {
			return &list[i], i
		}
	}
	return nil, -1
}

func decryptNetworkDeviceSecrets(app *ServerApp, dev networkmodel.Device) (networkmodel.Device, error) {
	if dev.Kind != networkDeviceKindOpenWrt {
		return dev, nil
	}
	key, err := networkEncryptionKey(app)
	if err != nil {
		return dev, err
	}
	if strings.TrimSpace(dev.PasswordEnc) != "" {
		dev.Password, err = sharedcrypto.DecryptSecret(key, dev.PasswordEnc)
		if err != nil {
			return dev, err
		}
	}
	if strings.TrimSpace(dev.PrivateKeyEnc) != "" {
		dev.PrivateKey, err = sharedcrypto.DecryptSecret(key, dev.PrivateKeyEnc)
		if err != nil {
			return dev, err
		}
	}
	return dev, nil
}

func handleNetworkDevicesList(c *gin.Context, app *ServerApp) {
	list, err := loadNetworkDevices(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	out := make([]networkmodel.DeviceListItem, 0, len(list))
	for _, x := range list {
		out = append(out, networkDeviceListItem(x))
	}
	c.JSON(http.StatusOK, gin.H{"devices": out})
}

func handleNetworkDeviceCreate(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	var body networkDeviceBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var key []byte
	if strings.EqualFold(strings.TrimSpace(body.Kind), networkDeviceKindOpenWrt) {
		var err error
		key, err = networkEncryptionKey(app)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	dev, err := normalizeNetworkDeviceFromBody(body, nil, key)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	list, err := loadNetworkDevices(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	list = append([]networkmodel.Device{dev}, list...)
	if err := saveNetworkDevices(app.PlatformKV(), list); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"device": networkDeviceListItem(dev)})
}

func handleNetworkDeviceUpdate(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	list, err := loadNetworkDevices(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	cur, idx := findNetworkDevice(list, c.Param("id"))
	if cur == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "网络设备不存在"})
		return
	}
	var body networkDeviceBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var key []byte
	if strings.EqualFold(strings.TrimSpace(body.Kind), networkDeviceKindOpenWrt) || cur.Kind == networkDeviceKindOpenWrt {
		key, err = networkEncryptionKey(app)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	dev, err := normalizeNetworkDeviceFromBody(body, cur, key)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	list[idx] = dev
	if err := saveNetworkDevices(app.PlatformKV(), list); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"device": networkDeviceListItem(dev)})
}

func handleNetworkDeviceDelete(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	list, err := loadNetworkDevices(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	out := make([]networkmodel.Device, 0, len(list))
	for _, x := range list {
		if x.ID != id {
			out = append(out, x)
		}
	}
	if err := saveNetworkDevices(app.PlatformKV(), out); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
