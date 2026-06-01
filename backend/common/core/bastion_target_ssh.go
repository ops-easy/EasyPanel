package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"

	pvemodel "github.com/ops-easy/EasyPanel/backend/api/pve/model"
	pveprovider "github.com/ops-easy/EasyPanel/backend/api/pve/provider"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

const defaultBastionPVESSHUser = "root"

func bastionTargetCredentialStoreKey(key BastionTargetKey) string {
	switch key.Provider {
	case bastionProviderVCenter:
		return key.VCenterMoRef
	case bastionProviderExtra:
		return BastionExtraSSHStoreKey(key.ExtraID)
	default:
		return bastionTargetSSHStoreKey(key.Canonical)
	}
}

func bastionDialSSHToTarget(ctx context.Context, app *ServerApp, targetID string) (*ssh.Client, error) {
	key, err := parseBastionTargetKey(targetID)
	if err != nil {
		return nil, err
	}
	switch key.Provider {
	case bastionProviderVCenter:
		encKey, kerr := sshEncryptionKey(app.Cfg())
		if kerr != nil {
			return nil, kerr
		}
		return sshDialVCenterVMClient(ctx, app.VCenter(), app.Cfg(), app.SSHStore(), key.VCenterMoRef, encKey)
	case bastionProviderExtra:
		pol := loadVCenterBastionPolicy(app.PlatformKV())
		h := bastionFindExtraHost(pol, key.ExtraID)
		if h == nil {
			return nil, errors.New("extra target not found")
		}
		return bastionDialSSHToExtra(ctx, app, key.ExtraID, h)
	case bastionProviderPVE:
		return bastionDialSSHToPVE(ctx, app, key)
	default:
		return nil, fmt.Errorf("unsupported target provider %q", key.Provider)
	}
}

func bastionDialSSHToPVE(ctx context.Context, app *ServerApp, targetKey BastionTargetKey) (*ssh.Client, error) {
	target, secret, err := bastionPVEClientMaterial(app, targetKey.PVETargetID)
	if err != nil {
		return nil, err
	}
	client, err := pveprovider.NewClient(target, secret)
	if err != nil {
		return nil, err
	}
	ov := getBastionTargetOverride(app.PlatformKV(), targetKey.Canonical)
	addr := strings.TrimSpace(ov.SSHHost)
	if addr == "" {
		addr, err = pveResolveGuestSSHHost(ctx, client, targetKey)
		if err != nil {
			return nil, fmt.Errorf("无法自动获取 PVE Guest SSH 地址: %w; 请在 SSH 设置中填写 SSH Host，或在虚拟机内安装并启用 qemu-guest-agent", err)
		}
	}
	if addr == "" {
		return nil, errors.New("PVE guest address is empty")
	}
	cfg := app.Cfg()
	encKey, kerr := sshEncryptionKey(cfg)
	var st *SSHVMStored
	if app.SSHStore() != nil && kerr == nil && len(encKey) > 0 {
		st, _ = app.SSHStore().GetVM(ctx, bastionTargetCredentialStoreKey(targetKey), encKey)
	}
	merged := mergeBastionPVESSHStored(cfg, st, ov)
	sshCfg, err := buildSSHClientConfigMerged(cfg, merged)
	if err != nil {
		return nil, err
	}
	return ssh.Dial("tcp", net.JoinHostPort(addr, strconv.Itoa(merged.Port)), sshCfg)
}

func mergeBastionPVESSHStored(cfg Config, st *SSHVMStored, ov BastionTargetOverride) *SSHVMStored {
	merged := cloneSSHVMStored(st)
	if merged == nil {
		merged = &SSHVMStored{
			Password:        cfg.VCenterVMSshPassword,
			Port:            cfg.VCenterVMSshPort,
			InsecureHostKey: cfg.VCenterVMSshInsecureHostKey,
		}
	}
	if cfg.VCenterVMSshInsecureHostKey {
		merged.InsecureHostKey = true
	}
	if strings.TrimSpace(merged.User) == "" {
		merged.User = strings.TrimSpace(cfg.VCenterVMSshUser)
	}
	if strings.TrimSpace(ov.SSHUser) != "" {
		merged.User = strings.TrimSpace(ov.SSHUser)
	}
	if strings.TrimSpace(merged.User) == "" {
		merged.User = defaultBastionPVESSHUser
	}
	if merged.Port <= 0 && cfg.VCenterVMSshPort > 0 {
		merged.Port = cfg.VCenterVMSshPort
	}
	if ov.SSHPort > 0 {
		merged.Port = ov.SSHPort
	}
	if merged.Port <= 0 {
		merged.Port = 22
	}
	return merged
}

func bastionPVESSHReady(cfg Config, st *SSHVMStored) bool {
	if st != nil && (strings.TrimSpace(st.Password) != "" || strings.TrimSpace(st.PrivateKeyPEM) != "") {
		return true
	}
	return strings.TrimSpace(cfg.VCenterVMSshPrivateKeyPath) != "" || cfg.VCenterVMSshPassword != ""
}

func cloneSSHVMStored(in *SSHVMStored) *SSHVMStored {
	if in == nil {
		return nil
	}
	out := *in
	return &out
}

func bastionPVEClientMaterial(app *ServerApp, targetID string) (pvemodel.Target, string, error) {
	list, err := pveprovider.LoadTargets(app.PlatformKV())
	if err != nil {
		return pvemodel.Target{}, "", err
	}
	for _, target := range list {
		if target.ID != targetID {
			continue
		}
		key, err := deriveAESKey(app.Cfg().EncryptionKey)
		if err != nil {
			return pvemodel.Target{}, "", err
		}
		secret, err := pveprovider.DecryptTargetCredential(key, target)
		if err != nil {
			return pvemodel.Target{}, "", err
		}
		return target, secret, nil
	}
	return pvemodel.Target{}, "", errors.New("PVE target not found")
}

func pveResolveGuestSSHHost(ctx context.Context, client *pveprovider.Client, targetKey BastionTargetKey) (string, error) {
	switch strings.ToLower(strings.TrimSpace(targetKey.PVEGuestType)) {
	case "qemu", "vm":
		return pveResolveQemuGuestIP(ctx, client, targetKey.PVENode, targetKey.PVEVMID)
	case "lxc", "ct":
		return pveResolveLXCGuestIP(ctx, client, targetKey.PVENode, targetKey.PVEVMID)
	default:
		return "", fmt.Errorf("unsupported PVE guest type %q", targetKey.PVEGuestType)
	}
}

func pveResolveQemuGuestIP(ctx context.Context, client *pveprovider.Client, node, vmid string) (string, error) {
	p := fmt.Sprintf("/nodes/%s/qemu/%s/agent/network-get-interfaces", url.PathEscape(node), url.PathEscape(vmid))
	data, agentErr := client.Do(ctx, http.MethodGet, p, nil, nil)
	if agentErr == nil {
		if ip, err := pveFirstQemuAgentIPv4(data); err == nil {
			return ip, nil
		} else {
			agentErr = err
		}
	}

	if ip, configErr := pveResolveGuestConfigIPv4(ctx, client, node, "qemu", vmid); configErr == nil {
		return ip, nil
	} else if agentErr != nil {
		return "", fmt.Errorf("%w; PVE config fallback failed: %v", agentErr, configErr)
	} else {
		return "", configErr
	}
}

func pveFirstQemuAgentIPv4(data json.RawMessage) (string, error) {
	var wrapper struct {
		Result []struct {
			Name        string `json:"name"`
			IPAddresses []struct {
				Address string `json:"ip-address"`
				Type    string `json:"ip-address-type"`
			} `json:"ip-addresses"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &wrapper); err != nil {
		return "", err
	}
	for _, iface := range wrapper.Result {
		for _, addr := range iface.IPAddresses {
			if ip := usableGuestIPv4(addr.Address); ip != "" {
				return ip, nil
			}
		}
	}
	return "", errors.New("guest agent returned no usable IPv4")
}

func pveResolveLXCGuestIP(ctx context.Context, client *pveprovider.Client, node, vmid string) (string, error) {
	p := fmt.Sprintf("/nodes/%s/lxc/%s/interfaces", url.PathEscape(node), url.PathEscape(vmid))
	data, ifaceErr := client.Do(ctx, http.MethodGet, p, nil, nil)
	if ifaceErr == nil {
		if ip, err := pveFirstLXCInterfaceIPv4(data); err == nil {
			return ip, nil
		} else {
			ifaceErr = err
		}
	}

	if ip, configErr := pveResolveGuestConfigIPv4(ctx, client, node, "lxc", vmid); configErr == nil {
		return ip, nil
	} else if ifaceErr != nil {
		return "", fmt.Errorf("%w; PVE config fallback failed: %v", ifaceErr, configErr)
	} else {
		return "", configErr
	}
}

func pveFirstLXCInterfaceIPv4(data json.RawMessage) (string, error) {
	var rows []struct {
		Name string `json:"name"`
		Inet string `json:"inet"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return "", err
	}
	for _, row := range rows {
		if ip := usableGuestIPv4(row.Inet); ip != "" {
			return ip, nil
		}
	}
	return "", errors.New("LXC interfaces returned no usable IPv4")
}

func pveResolveGuestConfigIPv4(ctx context.Context, client *pveprovider.Client, node, guestType, vmid string) (string, error) {
	kind := strings.ToLower(strings.TrimSpace(guestType))
	switch kind {
	case "qemu", "vm":
		kind = "qemu"
	case "lxc", "ct":
		kind = "lxc"
	default:
		return "", fmt.Errorf("unsupported PVE guest type %q", guestType)
	}
	p := fmt.Sprintf("/nodes/%s/%s/%s/config", url.PathEscape(node), kind, url.PathEscape(vmid))
	data, err := client.Do(ctx, http.MethodGet, p, nil, nil)
	if err != nil {
		return "", err
	}
	return pveFirstConfigIPv4(data, kind)
}

func pveFirstConfigIPv4(data json.RawMessage, guestType string) (string, error) {
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return "", err
	}
	keys := make([]string, 0, len(cfg))
	for key := range cfg {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if !pveGuestConfigNetworkKey(key, guestType) {
			continue
		}
		if ip := pveIPv4FromNetworkConfig(bastionAnyString(cfg[key])); ip != "" {
			return ip, nil
		}
	}
	return "", errors.New("PVE guest config returned no static IPv4")
}

func pveGuestConfigNetworkKey(key, guestType string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	switch strings.ToLower(strings.TrimSpace(guestType)) {
	case "qemu", "vm":
		return strings.HasPrefix(key, "ipconfig")
	case "lxc", "ct":
		return strings.HasPrefix(key, "net")
	default:
		return false
	}
}

func pveIPv4FromNetworkConfig(raw string) string {
	for _, part := range strings.Split(raw, ",") {
		k, v, ok := strings.Cut(part, "=")
		if !ok || !strings.EqualFold(strings.TrimSpace(k), "ip") {
			continue
		}
		if ip := usableGuestIPv4(strings.Trim(strings.TrimSpace(v), `"'`)); ip != "" {
			return ip
		}
	}
	return ""
}

func usableGuestIPv4(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if slash := strings.Index(raw, "/"); slash >= 0 {
		raw = raw[:slash]
	}
	ip := net.ParseIP(raw)
	if ip == nil || ip.To4() == nil {
		return ""
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return ""
	}
	return ip.String()
}

func runBastionSSHWebSocketSession(conn *websocket.Conn, sshClient *ssh.Client) {
	defer sshClient.Close()
	sess, err := sshClient.NewSession()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(err.Error()+"\r\n"))
		return
	}
	defer sess.Close()
	stdin, err := sess.StdinPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(err.Error()+"\r\n"))
		return
	}
	stdout, err := sess.StdoutPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(err.Error()+"\r\n"))
		return
	}
	sshSessionApplyTermEnv(sess, "xterm-256color")
	if err := sess.RequestPty("xterm-256color", 24, 80, ssh.TerminalModes{}); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("PTY: "+err.Error()+"\r\n"))
		return
	}
	if err := sess.Shell(); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("Shell: "+err.Error()+"\r\n"))
		return
	}
	outWriter := &wsBinaryWriter{conn: conn}
	var sessMu sync.Mutex
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = io.Copy(outWriter, stdout)
	}()
	go func() {
		defer stdin.Close()
		for {
			messageType, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if messageType == websocket.TextMessage {
				var msg struct {
					Type string `json:"type"`
					Cols uint16 `json:"cols"`
					Rows uint16 `json:"rows"`
				}
				if json.Unmarshal(data, &msg) == nil && msg.Type == "resize" && msg.Cols > 0 && msg.Rows > 0 {
					sessMu.Lock()
					_ = sess.WindowChange(int(msg.Rows), int(msg.Cols))
					sessMu.Unlock()
				}
				continue
			}
			if messageType == websocket.BinaryMessage && len(data) > 0 {
				_, _ = stdin.Write(data)
			}
		}
	}()
	_ = sess.Wait()
	_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[33m[SSH session closed]\x1b[0m\r\n"))
	<-done
}

func handleBastionTargetSSHWS(c *gin.Context, app *ServerApp) {
	targetID := strings.TrimSpace(c.Query("target"))
	if targetID == "" {
		targetID = strings.TrimSpace(c.Query("id"))
	}
	if targetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing target"})
		return
	}
	parsed, err := parseBastionTargetKey(targetID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if vcenterBastionAbortIfForbiddenTarget(c, app, parsed.Canonical) {
		return
	}
	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("bastion target SSH WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()
	doneKA := make(chan struct{})
	defer close(doneKA)
	startWebSocketBastionKeepalive(conn, doneKA)
	sshClient, err := bastionDialSSHToTarget(c.Request.Context(), app, parsed.Canonical)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("SSH connect failed: "+err.Error()+"\r\n"))
		return
	}
	runBastionSSHWebSocketSession(conn, sshClient)
}

func handleBastionTargetSFTPWS(c *gin.Context, app *ServerApp) {
	targetID := strings.TrimSpace(c.Query("target"))
	if targetID == "" {
		targetID = strings.TrimSpace(c.Query("id"))
	}
	if targetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing target"})
		return
	}
	parsed, err := parseBastionTargetKey(targetID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if vcenterBastionAbortIfForbiddenTarget(c, app, parsed.Canonical) {
		return
	}
	sshClient, err := bastionDialSSHToTarget(c.Request.Context(), app, parsed.Canonical)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("bastion target SFTP WebSocket upgrade failed: %v", err)
		sshClient.Close()
		return
	}
	doneKA := make(chan struct{})
	defer close(doneKA)
	startWebSocketBastionKeepalive(conn, doneKA)
	runBastionSFTPSession(conn, sshClient)
}
