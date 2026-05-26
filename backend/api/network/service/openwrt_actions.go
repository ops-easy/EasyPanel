package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"
)

var openWrtUCIKeyRe = regexp.MustCompile(`^[A-Za-z0-9_@.\-\[\]]+$`)
var openWrtObjectNameRe = regexp.MustCompile(`^[A-Za-z0-9_.:-]+$`)

type openWrtActionRequest struct {
	Action  string `json:"action"`
	Confirm bool   `json:"confirm"`
}

type openWrtConfigChange struct {
	Operation string `json:"operation"`
	Section   string `json:"section"`
	Value     string `json:"value"`
}

type openWrtConfigRequest struct {
	Changes []openWrtConfigChange `json:"changes"`
	Reload  string                `json:"reload"`
	Confirm bool                  `json:"confirm"`
}

type openWrtCommandPreview struct {
	Commands             []string `json:"commands"`
	RequiresConfirmation bool     `json:"requiresConfirmation"`
}

func (c *openWrtClient) RunAction(ctx context.Context, dev networkmodel.Device, action string) (map[string]any, error) {
	cmd, err := openWrtActionCommand(action)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	out, err := c.runner.Run(ctx, dev, cmd)
	return map[string]any{
		"action":    action,
		"command":   cmd,
		"output":    out,
		"ok":        err == nil,
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
	}, err
}

func openWrtActionCommand(action string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "reload-network":
		return "/etc/init.d/network reload", nil
	case "reload-wifi":
		return "wifi reload", nil
	case "restart-dnsmasq":
		return "/etc/init.d/dnsmasq restart", nil
	case "reboot":
		return "reboot", nil
	default:
		return "", errors.New("不支持的 OpenWrt 操作")
	}
}

func buildOpenWrtConfigCommands(req openWrtConfigRequest) (openWrtCommandPreview, error) {
	commands := []string{}
	pkgs := map[string]bool{}
	for _, ch := range req.Changes {
		key := strings.TrimSpace(ch.Section)
		minDots := 2
		if strings.EqualFold(strings.TrimSpace(ch.Operation), "delete") || strings.EqualFold(strings.TrimSpace(ch.Operation), "remove") {
			minDots = 1
		}
		if key == "" || !openWrtUCIKeyRe.MatchString(key) || strings.Count(key, ".") < minDots {
			return openWrtCommandPreview{}, fmt.Errorf("无效 UCI 配置项: %s", key)
		}
		pkg := strings.SplitN(key, ".", 2)[0]
		pkgs[pkg] = true
		switch strings.ToLower(strings.TrimSpace(ch.Operation)) {
		case "", "set", "update":
			commands = append(commands, "uci set "+key+"="+shellQuote(ch.Value))
		case "delete", "remove":
			commands = append(commands, "uci delete "+key)
		default:
			return openWrtCommandPreview{}, fmt.Errorf("unsupported UCI operation %s", ch.Operation)
		}
	}
	pkgNames := make([]string, 0, len(pkgs))
	for pkg := range pkgs {
		pkgNames = append(pkgNames, pkg)
	}
	sort.Strings(pkgNames)
	for _, pkg := range pkgNames {
		commands = append(commands, "uci commit "+pkg)
	}
	if reload := openWrtReloadCommand(req.Reload); reload != "" {
		commands = append(commands, reload)
	}
	return openWrtCommandPreview{Commands: commands, RequiresConfirmation: true}, nil
}

func (c *openWrtClient) ApplyConfig(ctx context.Context, dev networkmodel.Device, req openWrtConfigRequest) (map[string]any, error) {
	preview, err := buildOpenWrtConfigCommands(req)
	if err != nil {
		return nil, err
	}
	if !req.Confirm {
		return nil, errors.New("应用 OpenWrt 配置必须显式 confirm=true")
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	outputs := []map[string]any{}
	for _, cmd := range preview.Commands {
		out, err := c.runner.Run(ctx, dev, cmd)
		outputs = append(outputs, map[string]any{"command": cmd, "output": out, "ok": err == nil})
		if err != nil {
			return map[string]any{"commands": outputs}, err
		}
	}
	return map[string]any{"commands": outputs, "ok": true, "checkedAt": time.Now().UTC().Format(time.RFC3339)}, nil
}

func openWrtReloadCommand(reload string) string {
	switch strings.ToLower(strings.TrimSpace(reload)) {
	case "", "none":
		return ""
	case "network":
		return "/etc/init.d/network reload"
	case "wireless", "wifi":
		return "wifi reload"
	case "dnsmasq", "dhcp":
		return "/etc/init.d/dnsmasq restart"
	case "firewall":
		return "/etc/init.d/firewall reload"
	default:
		return ""
	}
}

func safeOpenWrtObjectName(name string) string {
	name = strings.TrimSpace(name)
	if !openWrtObjectNameRe.MatchString(name) {
		return ""
	}
	return name
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
