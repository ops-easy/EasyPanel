package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	sharedaudit "github.com/ops-easy/EasyPanel/backend/common/audit"
	"github.com/ops-easy/EasyPanel/backend/common/result"

	"github.com/gin-gonic/gin"
)

func NowBeijingRFC3339() string {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.UTC
	}
	return time.Now().In(loc).Format(time.RFC3339Nano)
}

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	g := api.Group("/pve")
	g.GET("/targets", func(c *gin.Context) { handlePVETargetsList(c, app) })
	g.POST("/targets", func(c *gin.Context) { handlePVETargetCreate(c, app) })
	g.PUT("/targets/:id", func(c *gin.Context) { handlePVETargetUpdate(c, app) })
	g.DELETE("/targets/:id", func(c *gin.Context) { handlePVETargetDelete(c, app) })
	g.POST("/targets/:id/probe", func(c *gin.Context) { handlePVEProbe(c, app) })
	g.GET("/targets/:id/summary", func(c *gin.Context) { handlePVESummary(c, app) })
	g.GET("/targets/:id/nodes", func(c *gin.Context) { handlePVEForwardGet(c, app, "/nodes", nil, "nodes") })
	g.GET("/targets/:id/nodes/:node", func(c *gin.Context) { handlePVENodeDetail(c, app) })
	g.GET("/targets/:id/nodes/:node/metrics", func(c *gin.Context) { handlePVENodeMetrics(c, app) })
	g.GET("/targets/:id/guests", func(c *gin.Context) {
		q := url.Values{}
		q.Set("type", "vm")
		handlePVEForwardGet(c, app, "/cluster/resources", q, "guests")
	})
	g.GET("/targets/:id/guests/:vmid", func(c *gin.Context) { handlePVEGuestDetail(c, app) })
	g.GET("/targets/:id/guests/:vmid/metrics", func(c *gin.Context) { handlePVEGuestMetrics(c, app) })
	g.GET("/targets/:id/guests/:vmid/config", func(c *gin.Context) { handlePVEGuestConfig(c, app) })
	g.PUT("/targets/:id/guests/:vmid/config", func(c *gin.Context) { handlePVEGuestConfigUpdate(c, app) })
	g.POST("/targets/:id/guests/:vmid/disks/resize", func(c *gin.Context) { handlePVEGuestDiskResize(c, app) })
	g.GET("/targets/:id/guests/:vmid/snapshots", func(c *gin.Context) { handlePVEGuestSnapshots(c, app) })
	g.POST("/targets/:id/guests/:vmid/snapshots", func(c *gin.Context) { handlePVEGuestSnapshotCreate(c, app) })
	g.POST("/targets/:id/guests/:vmid/snapshots/:snapname/rollback", func(c *gin.Context) { handlePVEGuestSnapshotRollback(c, app) })
	g.DELETE("/targets/:id/guests/:vmid/snapshots/:snapname", func(c *gin.Context) { handlePVEGuestSnapshotDelete(c, app) })
	g.POST("/targets/:id/guests/:vmid/console/ticket", func(c *gin.Context) { handlePVEGuestConsoleTicket(c, app) })
	g.GET("/targets/:id/guests/:vmid/console/ws", func(c *gin.Context) { handlePVEGuestConsoleWebSocket(c, app) })
	g.POST("/targets/:id/guests/:vmid/power", func(c *gin.Context) { handlePVEGuestPower(c, app) })
	g.GET("/targets/:id/storage", func(c *gin.Context) {
		q := url.Values{}
		q.Set("type", "storage")
		handlePVEForwardGet(c, app, "/cluster/resources", q, "storage")
	})
	g.GET("/targets/:id/tasks", func(c *gin.Context) { handlePVEForwardGet(c, app, "/cluster/tasks", nil, "tasks") })
	g.GET("/targets/:id/tasks/:upid/status", func(c *gin.Context) { handlePVETaskStatus(c, app) })
}

func pveGuestAPISegment(guestType string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(guestType)) {
	case "qemu", "vm":
		return "qemu", nil
	case "lxc", "ct":
		return "lxc", nil
	default:
		return "", errors.New("type 须为 qemu 或 lxc")
	}
}

func pveGuestBasePath(node, guestType, vmid string) (string, error) {
	node = strings.TrimSpace(node)
	vmid = strings.TrimSpace(vmid)
	if node == "" || vmid == "" {
		return "", errors.New("node 与 vmid 不能为空")
	}
	if _, err := strconv.Atoi(vmid); err != nil {
		return "", errors.New("vmid 必须为数字")
	}
	segment, err := pveGuestAPISegment(guestType)
	if err != nil {
		return "", err
	}
	return "/nodes/" + url.PathEscape(node) + "/" + segment + "/" + url.PathEscape(vmid), nil
}

func pveGuestDetailPaths(node, guestType, vmid string) (string, string, error) {
	base, err := pveGuestBasePath(node, guestType, vmid)
	if err != nil {
		return "", "", err
	}
	return base + "/status/current", base + "/config", nil
}

func pveGuestMetricsPath(node, guestType, vmid string) (string, error) {
	base, err := pveGuestBasePath(node, guestType, vmid)
	if err != nil {
		return "", err
	}
	return base + "/rrddata", nil
}

func pveNodeDetailPaths(node string) (string, string, error) {
	node = strings.TrimSpace(node)
	if node == "" {
		return "", "", errors.New("node 不能为空")
	}
	base := "/nodes/" + url.PathEscape(node)
	return base + "/status", base + "/version", nil
}

func pveNodeMetricsPath(node string) (string, error) {
	node = strings.TrimSpace(node)
	if node == "" {
		return "", errors.New("node 不能为空")
	}
	return "/nodes/" + url.PathEscape(node) + "/rrddata", nil
}

func pveRRDQuery(c *gin.Context) url.Values {
	timeframe := strings.ToLower(strings.TrimSpace(c.DefaultQuery("timeframe", "hour")))
	switch timeframe {
	case "hour", "day", "week", "month", "year":
	default:
		timeframe = "hour"
	}
	cf := strings.ToUpper(strings.TrimSpace(c.DefaultQuery("cf", "AVERAGE")))
	if cf != "AVERAGE" && cf != "MAX" {
		cf = "AVERAGE"
	}
	q := url.Values{}
	q.Set("timeframe", timeframe)
	q.Set("cf", cf)
	return q
}

func handlePVEProbe(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodGet, "/version", nil, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "target": target.ID, "version": json.RawMessage(data)})
}

func handlePVEForwardGet(c *gin.Context, app *ServerApp, path string, q url.Values, field string) {
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodGet, path, q, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{field: json.RawMessage(data)})
}

func handlePVENodeDetail(c *gin.Context, app *ServerApp) {
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node := strings.TrimSpace(c.Param("node"))
	statusPath, versionPath, err := pveNodeDetailPaths(node)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	status, err := client.Do(c.Request.Context(), http.MethodGet, statusPath, nil, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	out := gin.H{
		"target": target.ID,
		"node":   node,
		"status": json.RawMessage(status),
	}
	if version, err := client.Do(c.Request.Context(), http.MethodGet, versionPath, nil, nil); err == nil {
		out["version"] = json.RawMessage(version)
	} else {
		out["warnings"] = []string{"version: " + err.Error()}
	}
	c.JSON(http.StatusOK, out)
}

func handlePVENodeMetrics(c *gin.Context, app *ServerApp) {
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node := strings.TrimSpace(c.Param("node"))
	path, err := pveNodeMetricsPath(node)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodGet, path, pveRRDQuery(c), nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"target": target.ID, "node": node, "metrics": json.RawMessage(data)})
}

func handlePVEGuestDetail(c *gin.Context, app *ServerApp) {
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node := strings.TrimSpace(c.Query("node"))
	guestType := strings.TrimSpace(c.DefaultQuery("type", "qemu"))
	vmid := strings.TrimSpace(c.Param("vmid"))
	statusPath, configPath, err := pveGuestDetailPaths(node, guestType, vmid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	status, err := client.Do(c.Request.Context(), http.MethodGet, statusPath, nil, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	out := gin.H{
		"target": target.ID,
		"node":   node,
		"type":   guestType,
		"vmid":   vmid,
		"status": json.RawMessage(status),
	}
	if config, err := client.Do(c.Request.Context(), http.MethodGet, configPath, nil, nil); err == nil {
		out["config"] = json.RawMessage(config)
	} else {
		out["warnings"] = []string{"config: " + err.Error()}
	}
	c.JSON(http.StatusOK, out)
}

func handlePVEGuestMetrics(c *gin.Context, app *ServerApp) {
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node := strings.TrimSpace(c.Query("node"))
	guestType := strings.TrimSpace(c.DefaultQuery("type", "qemu"))
	vmid := strings.TrimSpace(c.Param("vmid"))
	path, err := pveGuestMetricsPath(node, guestType, vmid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodGet, path, pveRRDQuery(c), nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"target": target.ID, "node": node, "type": guestType, "vmid": vmid, "metrics": json.RawMessage(data)})
}

func handlePVESummary(c *gin.Context, app *ServerApp) {
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	nodes, nodeErr := client.Do(c.Request.Context(), http.MethodGet, "/nodes", nil, nil)
	qVM := url.Values{}
	qVM.Set("type", "vm")
	guests, guestErr := client.Do(c.Request.Context(), http.MethodGet, "/cluster/resources", qVM, nil)
	qStorage := url.Values{}
	qStorage.Set("type", "storage")
	storage, storageErr := client.Do(c.Request.Context(), http.MethodGet, "/cluster/resources", qStorage, nil)
	if nodeErr != nil || guestErr != nil || storageErr != nil {
		parts := []string{}
		if nodeErr != nil {
			parts = append(parts, "nodes: "+nodeErr.Error())
		}
		if guestErr != nil {
			parts = append(parts, "guests: "+guestErr.Error())
		}
		if storageErr != nil {
			parts = append(parts, "storage: "+storageErr.Error())
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": strings.Join(parts, "; ")})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"nodes":   json.RawMessage(nodes),
		"guests":  json.RawMessage(guests),
		"storage": json.RawMessage(storage),
	})
}

type pveGuestPowerBody struct {
	Node    string `json:"node"`
	Type    string `json:"type"`
	Action  string `json:"action"`
	Confirm bool   `json:"confirm"`
}

const pveGuestShutdownTimeoutSeconds = 60

func pveGuestPowerActionRequiresConfirm(action string) bool {
	return validatePVEGuestPowerAction(action) == nil
}

func pveGuestPowerForm(guestType, action string) (url.Values, error) {
	form := url.Values{}
	if strings.TrimSpace(action) != "shutdown" {
		return form, nil
	}
	segment, err := pveGuestAPISegment(guestType)
	if err != nil {
		return nil, err
	}
	form.Set("timeout", strconv.Itoa(pveGuestShutdownTimeoutSeconds))
	if segment == "qemu" {
		form.Set("forceStop", "1")
	}
	return form, nil
}

func handlePVEGuestPower(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	var body pveGuestPowerBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	action := strings.TrimSpace(body.Action)
	path, err := pveGuestPowerPath(body.Node, body.Type, c.Param("vmid"), action)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if pveGuestPowerActionRequiresConfirm(action) && !body.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "PVE 电源操作需要显式 confirm=true"})
		return
	}
	form, err := pveGuestPowerForm(body.Type, action)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodPost, path, nil, form)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	sharedaudit.SetDetail(c, fmt.Sprintf("PVE Guest %s/%s/%s 电源：%s", strings.TrimSpace(body.Node), strings.TrimSpace(body.Type), strings.TrimSpace(c.Param("vmid")), action))
	c.JSON(http.StatusOK, gin.H{"task": json.RawMessage(data)})
}

func respondPVEError500(c *gin.Context, err error) {
	if err == nil {
		return
	}
	result.Error500(c, err.Error())
}
