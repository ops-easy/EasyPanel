package service

import (
	"fmt"
	"strings"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"
	sharedaudit "github.com/ops-easy/EasyPanel/backend/common/audit"

	"github.com/gin-gonic/gin"
)

func networkProviderAuditLabel(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case networkDeviceKindOpenWrt:
		return "OpenWrt"
	case networkDeviceKindIkuai:
		return "iKuai"
	default:
		if strings.TrimSpace(provider) == "" {
			return "network"
		}
		return strings.TrimSpace(provider)
	}
}

func networkDeviceAuditLabel(dev networkmodel.Device) string {
	name := strings.TrimSpace(dev.Name)
	if name == "" {
		name = strings.TrimSpace(dev.Host)
	}
	if name == "" {
		name = strings.TrimSpace(dev.APIURL)
	}
	if name == "" {
		name = strings.TrimSpace(dev.ID)
	}
	if name == "" {
		name = "unknown"
	}
	id := strings.TrimSpace(dev.ID)
	if id == "" {
		return name
	}
	return fmt.Sprintf("%s id=%s", name, id)
}

func networkActionAuditDetail(provider string, dev networkmodel.Device, action string) string {
	return fmt.Sprintf("%s %s action=%s", networkProviderAuditLabel(provider), networkDeviceAuditLabel(dev), strings.TrimSpace(action))
}

func networkConfigAuditDetail(provider string, dev networkmodel.Device, domain string, changeCount int, reload string) string {
	parts := []string{
		networkProviderAuditLabel(provider),
		networkDeviceAuditLabel(dev),
		"config",
		"domain=" + normalizeConfigDomain(domain),
		fmt.Sprintf("changes=%d", changeCount),
	}
	if strings.TrimSpace(reload) != "" {
		parts = append(parts, "reload="+strings.TrimSpace(reload))
	}
	return strings.Join(parts, " ")
}

func setNetworkAuditDetail(c *gin.Context, detail string) {
	sharedaudit.SetDetail(c, detail)
}
