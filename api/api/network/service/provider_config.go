package service

import (
	"net/http"
	"strings"

	networkmodel "github.com/ops-easy/EasyPanel/api/api/network/model"

	"github.com/gin-gonic/gin"
)

type networkConfigChange struct {
	Operation string         `json:"operation"`
	Target    string         `json:"target"`
	Section   string         `json:"section"`
	Value     string         `json:"value"`
	FuncName  string         `json:"funcName"`
	Action    string         `json:"action"`
	Param     map[string]any `json:"param"`
	Fields    map[string]any `json:"fields"`
}

type networkChangeSet struct {
	Domain  string                `json:"domain"`
	Changes []networkConfigChange `json:"changes"`
	Reload  string                `json:"reload"`
	Confirm bool                  `json:"confirm"`
}

type networkChangePreview struct {
	Provider             string               `json:"provider"`
	Domain               string               `json:"domain"`
	Capability           string               `json:"capability"`
	Commands             []string             `json:"commands,omitempty"`
	Requests             []ikuaiActionRequest `json:"requests,omitempty"`
	Warnings             []string             `json:"warnings,omitempty"`
	Unsupported          []string             `json:"unsupported,omitempty"`
	RequiresConfirmation bool                 `json:"requiresConfirmation"`
	Raw                  any                  `json:"raw,omitempty"`
}

type networkActionRequest struct {
	Action  string         `json:"action"`
	Confirm bool           `json:"confirm"`
	Fields  map[string]any `json:"fields"`
}

func handleProviderConfigSnapshot(c *gin.Context, app *ServerApp) {
	provider, domain, dev, ok := providerDeviceForRequest(c, app)
	if !ok {
		return
	}
	switch provider {
	case networkDeviceKindOpenWrt:
		out, err := newOpenWrtClient(nil).ConfigSnapshot(c.Request.Context(), dev, domain)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "device": networkDeviceListItem(dev)})
			return
		}
		out["device"] = networkDeviceListItem(dev)
		c.JSON(http.StatusOK, out)
	case networkDeviceKindIkuai:
		out, err := ikuaiHTTPClientForDevice(dev).ConfigSnapshot(c.Request.Context(), dev, domain)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "device": networkDeviceListItem(dev)})
			return
		}
		out["device"] = networkDeviceListItem(dev)
		c.JSON(http.StatusOK, out)
	}
}

func handleProviderConfigDryRun(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	provider, domain, _, ok := providerDeviceForRequest(c, app)
	if !ok {
		return
	}
	var body networkChangeSet
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Domain = effectiveConfigDomain(domain, body.Domain)
	switch provider {
	case networkDeviceKindOpenWrt:
		preview, err := buildOpenWrtConfigCommands(openWrtRequestFromChangeSet(body))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, networkChangePreview{
			Provider:             provider,
			Domain:               body.Domain,
			Capability:           "ssh-uci",
			Commands:             preview.Commands,
			RequiresConfirmation: preview.RequiresConfirmation,
		})
	case networkDeviceKindIkuai:
		preview, err := buildIkuaiChangePreview(body.Domain, body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, preview)
	}
}

func handleProviderConfigApply(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	provider, domain, dev, ok := providerDeviceForRequest(c, app)
	if !ok {
		return
	}
	var body networkChangeSet
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Domain = effectiveConfigDomain(domain, body.Domain)
	if !body.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "network config apply requires confirm=true"})
		return
	}
	switch provider {
	case networkDeviceKindOpenWrt:
		out, err := newOpenWrtClient(nil).ApplyConfig(c.Request.Context(), dev, openWrtRequestFromChangeSet(body))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "result": out})
			return
		}
		c.JSON(http.StatusOK, gin.H{"provider": provider, "domain": body.Domain, "ok": true, "result": out})
	case networkDeviceKindIkuai:
		out, err := ikuaiHTTPClientForDevice(dev).ApplyChangeSet(c.Request.Context(), dev, body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "result": out})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func handleProviderAction(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	provider, _, dev, ok := providerDeviceForRequest(c, app)
	if !ok {
		return
	}
	var body networkActionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	switch provider {
	case networkDeviceKindOpenWrt:
		if strings.EqualFold(strings.TrimSpace(body.Action), "reboot") && !body.Confirm {
			c.JSON(http.StatusBadRequest, gin.H{"error": "OpenWrt reboot requires confirm=true"})
			return
		}
		out, err := newOpenWrtClient(nil).RunAction(c.Request.Context(), dev, body.Action)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "result": out})
			return
		}
		c.JSON(http.StatusOK, out)
	case networkDeviceKindIkuai:
		out, err := ikuaiHTTPClientForDevice(dev).RunAction(c.Request.Context(), dev, body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "result": out})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func providerDeviceForRequest(c *gin.Context, app *ServerApp) (string, string, networkmodel.Device, bool) {
	provider, err := normalizeNetworkDeviceKind(c.Param("provider"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return "", "", networkmodel.Device{}, false
	}
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return "", "", networkmodel.Device{}, false
	}
	if dev.Kind != provider {
		c.JSON(http.StatusBadRequest, gin.H{"error": "network device provider mismatch"})
		return "", "", networkmodel.Device{}, false
	}
	dev, err = decryptNetworkDeviceSecrets(app, dev)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unable to decrypt network device credentials: " + err.Error()})
		return "", "", networkmodel.Device{}, false
	}
	return provider, normalizeConfigDomain(c.Param("domain")), dev, true
}

func normalizeConfigDomain(domain string) string {
	d := strings.ToLower(strings.TrimSpace(domain))
	switch d {
	case "interface":
		return "interfaces"
	case "client", "terminal", "terminals":
		return "clients"
	case "wifi":
		return "wireless"
	case "connection", "firewall", "nat":
		return "connections"
	case "monitor", "exporter":
		return "monitoring"
	case "", "system", "interfaces", "clients", "wireless", "connections", "monitoring", "dhcp", "dns", "services":
		if d == "" {
			return "system"
		}
		return d
	default:
		return d
	}
}

func effectiveConfigDomain(routeDomain, bodyDomain string) string {
	if d := normalizeConfigDomain(bodyDomain); d != "system" || strings.TrimSpace(bodyDomain) != "" {
		return d
	}
	return normalizeConfigDomain(routeDomain)
}

func openWrtRequestFromChangeSet(body networkChangeSet) openWrtConfigRequest {
	changes := make([]openWrtConfigChange, 0, len(body.Changes))
	for _, ch := range body.Changes {
		key := strings.TrimSpace(ch.Section)
		if key == "" {
			key = strings.TrimSpace(ch.Target)
		}
		changes = append(changes, openWrtConfigChange{
			Operation: ch.Operation,
			Section:   key,
			Value:     ch.Value,
		})
	}
	return openWrtConfigRequest{
		Changes: changes,
		Reload:  body.Reload,
		Confirm: body.Confirm,
	}
}
