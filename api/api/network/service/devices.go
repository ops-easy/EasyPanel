package service

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	networkmodel "kube-bt-sync/api/network/model"
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/authz"
	"kube-bt-sync/common/result"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ServerApp = appctx.ServerApp
type PlatformKV = appctx.PlatformKV
type Config = appctx.Config

const kvKeyNetworkDevices = "kubebt_network_devices_v1"

type networkDevicesPayload struct {
	Devices []networkmodel.Device `json:"devices"`
}

func normalizeNetworkDeviceKind(kind string) (string, error) {
	k := strings.ToLower(strings.TrimSpace(kind))
	switch k {
	case "ikuai", "openwrt":
		return k, nil
	default:
		return "", errors.New("kind 须为 ikuai 或 openwrt")
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
		return "", errors.New("prometheusScope 须为 network、vcenter 或 default")
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

func normalizeNetworkDeviceFromBody(body networkDeviceBody, cur *networkmodel.Device) (networkmodel.Device, error) {
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
	out.PrometheusScope = scope
	out.InstanceLabel = strings.TrimSpace(body.InstanceLabel)
	out.JobLabel = strings.TrimSpace(body.JobLabel)
	out.Notes = strings.TrimSpace(body.Notes)
	out.UpdatedAt = now
	return out, nil
}

type networkDeviceBody struct {
	Kind            string `json:"kind"`
	Name            string `json:"name"`
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

func handleNetworkDevicesList(c *gin.Context, app *ServerApp) {
	list, err := loadNetworkDevices(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"devices": list})
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
	dev, err := normalizeNetworkDeviceFromBody(body, nil)
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
	c.JSON(http.StatusOK, gin.H{"device": dev})
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
	dev, err := normalizeNetworkDeviceFromBody(body, cur)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	list[idx] = dev
	if err := saveNetworkDevices(app.PlatformKV(), list); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"device": dev})
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
