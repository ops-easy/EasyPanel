package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	sharedaudit "github.com/ops-easy/EasyPanel/api/common/audit"

	"github.com/gin-gonic/gin"
)

func pveGuestConfigPath(node, guestType, vmid string) (string, error) {
	base, err := pveGuestBasePath(node, guestType, vmid)
	if err != nil {
		return "", err
	}
	return base + "/config", nil
}

func pveGuestDiskResizePath(node, guestType, vmid string) (string, error) {
	base, err := pveGuestBasePath(node, guestType, vmid)
	if err != nil {
		return "", err
	}
	return base + "/resize", nil
}

func pveGuestSnapshotsPath(node, guestType, vmid string) (string, error) {
	base, err := pveGuestBasePath(node, guestType, vmid)
	if err != nil {
		return "", err
	}
	return base + "/snapshot", nil
}

func pveGuestSnapshotPath(node, guestType, vmid, snapname string) (string, error) {
	snapname = strings.TrimSpace(snapname)
	if snapname == "" {
		return "", errors.New("snapname is required")
	}
	base, err := pveGuestSnapshotsPath(node, guestType, vmid)
	if err != nil {
		return "", err
	}
	return base + "/" + url.PathEscape(snapname), nil
}

func pveGuestSnapshotRollbackPath(node, guestType, vmid, snapname string) (string, error) {
	base, err := pveGuestSnapshotPath(node, guestType, vmid, snapname)
	if err != nil {
		return "", err
	}
	return base + "/rollback", nil
}

func pveGuestConsolePaths(node, guestType, vmid string) (string, string, error) {
	base, err := pveGuestBasePath(node, guestType, vmid)
	if err != nil {
		return "", "", err
	}
	return base + "/vncproxy", base + "/vncwebsocket", nil
}

func pveGuestConsoleWebSocketPath(node, guestType, vmid string) (string, error) {
	_, wsPath, err := pveGuestConsolePaths(node, guestType, vmid)
	return wsPath, err
}

func validatePVEGuestConfigPatch(form url.Values) error {
	if len(form) == 0 {
		return errors.New("config patch is required")
	}
	for key := range form {
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "", "node", "type", "vmid", "target", "targetid":
			return fmt.Errorf("config field %q is not allowed", key)
		}
	}
	return nil
}

func pveBindSimpleForm(c *gin.Context) (url.Values, bool) {
	var body map[string]any
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, false
	}
	form := url.Values{}
	for key, value := range body {
		key = strings.TrimSpace(key)
		if key == "" || value == nil {
			continue
		}
		switch v := value.(type) {
		case string:
			form.Set(key, strings.TrimSpace(v))
		case bool:
			if v {
				form.Set(key, "1")
			} else {
				form.Set(key, "0")
			}
		case float64:
			if v == float64(int64(v)) {
				form.Set(key, strconv.FormatInt(int64(v), 10))
			} else {
				form.Set(key, strconv.FormatFloat(v, 'f', -1, 64))
			}
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "PVE operation body only supports scalar fields"})
			return nil, false
		}
	}
	return form, true
}

func pveGuestRequestScope(c *gin.Context) (node, guestType, vmid string) {
	node = strings.TrimSpace(c.Query("node"))
	guestType = strings.TrimSpace(c.DefaultQuery("type", "qemu"))
	vmid = strings.TrimSpace(c.Param("vmid"))
	return
}

func handlePVEGuestConfig(c *gin.Context, app *ServerApp) {
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node, guestType, vmid := pveGuestRequestScope(c)
	path, err := pveGuestConfigPath(node, guestType, vmid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodGet, path, nil, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"target": target.ID, "node": node, "type": guestType, "vmid": vmid, "config": json.RawMessage(data)})
}

func handlePVEGuestConfigUpdate(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	form, ok := pveBindSimpleForm(c)
	if !ok {
		return
	}
	if err := validatePVEGuestConfigPatch(form); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node, guestType, vmid := pveGuestRequestScope(c)
	path, err := pveGuestConfigPath(node, guestType, vmid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodPut, path, nil, form)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"task": json.RawMessage(data)})
}

type pveGuestDiskResizeBody struct {
	Node string `json:"node"`
	Type string `json:"type"`
	Disk string `json:"disk"`
	Size string `json:"size"`
}

func handlePVEGuestDiskResize(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	var body pveGuestDiskResizeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Disk) == "" || strings.TrimSpace(body.Size) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "disk and size are required"})
		return
	}
	path, err := pveGuestDiskResizePath(body.Node, body.Type, c.Param("vmid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	form := url.Values{}
	form.Set("disk", strings.TrimSpace(body.Disk))
	form.Set("size", strings.TrimSpace(body.Size))
	data, err := client.Do(c.Request.Context(), http.MethodPut, path, nil, form)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"task": json.RawMessage(data)})
}

func handlePVEGuestSnapshots(c *gin.Context, app *ServerApp) {
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node, guestType, vmid := pveGuestRequestScope(c)
	path, err := pveGuestSnapshotsPath(node, guestType, vmid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodGet, path, nil, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"target": target.ID, "node": node, "type": guestType, "vmid": vmid, "snapshots": json.RawMessage(data)})
}

func handlePVEGuestSnapshotCreate(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	form, ok := pveBindSimpleForm(c)
	if !ok {
		return
	}
	if strings.TrimSpace(form.Get("snapname")) == "" {
		if name := strings.TrimSpace(form.Get("name")); name != "" {
			form.Set("snapname", name)
			form.Del("name")
		}
	}
	if strings.TrimSpace(form.Get("snapname")) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "snapname is required"})
		return
	}
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node, guestType, vmid := pveGuestRequestScope(c)
	path, err := pveGuestSnapshotsPath(node, guestType, vmid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodPost, path, nil, form)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"task": json.RawMessage(data)})
}

func handlePVEGuestSnapshotDelete(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node, guestType, vmid := pveGuestRequestScope(c)
	path, err := pveGuestSnapshotPath(node, guestType, vmid, c.Param("snapname"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	query := url.Values{}
	if force := strings.TrimSpace(c.Query("force")); force != "" {
		query.Set("force", force)
	}
	data, err := client.Do(c.Request.Context(), http.MethodDelete, path, query, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"task": json.RawMessage(data)})
}

func handlePVEGuestSnapshotRollback(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node, guestType, vmid := pveGuestRequestScope(c)
	snapname := strings.TrimSpace(c.Param("snapname"))
	path, err := pveGuestSnapshotRollbackPath(node, guestType, vmid, snapname)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	form := url.Values{}
	if start := strings.TrimSpace(c.Query("start")); start != "" {
		form.Set("start", start)
	}
	data, err := client.Do(c.Request.Context(), http.MethodPost, path, nil, form)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	sharedaudit.SetDetail(c, fmt.Sprintf("PVE Guest %s/%s/%s 回滚快照 %s", node, guestType, vmid, snapname))
	c.JSON(http.StatusOK, gin.H{"task": json.RawMessage(data)})
}
