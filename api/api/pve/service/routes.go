package service

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/result"

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
	g.GET("/targets/:id/guests", func(c *gin.Context) {
		q := url.Values{}
		q.Set("type", "vm")
		handlePVEForwardGet(c, app, "/cluster/resources", q, "guests")
	})
	g.POST("/targets/:id/guests/:vmid/power", func(c *gin.Context) { handlePVEGuestPower(c, app) })
	g.GET("/targets/:id/storage", func(c *gin.Context) {
		q := url.Values{}
		q.Set("type", "storage")
		handlePVEForwardGet(c, app, "/cluster/resources", q, "storage")
	})
	g.GET("/targets/:id/tasks", func(c *gin.Context) { handlePVEForwardGet(c, app, "/cluster/tasks", nil, "tasks") })
}

func handlePVEProbe(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	data, err := client.do(c.Request.Context(), http.MethodGet, "/version", nil, nil)
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
	data, err := client.do(c.Request.Context(), http.MethodGet, path, q, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{field: json.RawMessage(data)})
}

func handlePVESummary(c *gin.Context, app *ServerApp) {
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	nodes, nodeErr := client.do(c.Request.Context(), http.MethodGet, "/nodes", nil, nil)
	qVM := url.Values{}
	qVM.Set("type", "vm")
	guests, guestErr := client.do(c.Request.Context(), http.MethodGet, "/cluster/resources", qVM, nil)
	qStorage := url.Values{}
	qStorage.Set("type", "storage")
	storage, storageErr := client.do(c.Request.Context(), http.MethodGet, "/cluster/resources", qStorage, nil)
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
	Node   string `json:"node"`
	Type   string `json:"type"`
	Action string `json:"action"`
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
	path, err := pveGuestPowerPath(body.Node, body.Type, c.Param("vmid"), strings.TrimSpace(body.Action))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	data, err := client.do(c.Request.Context(), http.MethodPost, path, nil, map[string]string{})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"task": json.RawMessage(data)})
}

func respondPVEError500(c *gin.Context, err error) {
	if err == nil {
		return
	}
	result.Error500(c, err.Error())
}
