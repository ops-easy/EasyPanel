package core

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/find"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
)

func flattenVCenterSnapshotTree(list []types.VirtualMachineSnapshotTree, parent string, out *[]gin.H) {
	for _, item := range list {
		path := strings.TrimSpace(item.Name)
		if parent != "" {
			path = parent + "/" + path
		}
		*out = append(*out, gin.H{
			"name":        item.Name,
			"path":        path,
			"moref":       item.Snapshot.Value,
			"id":          item.Id,
			"description": item.Description,
			"createdAt":   item.CreateTime,
			"state":       string(item.State),
			"quiesced":    item.Quiesced,
			"childCount":  len(item.ChildSnapshotList),
		})
		flattenVCenterSnapshotTree(item.ChildSnapshotList, path, out)
	}
}

func handleVCenterVMSnapshots(c *gin.Context, app *ServerApp) {
	vm, ctx, err := getVCenterVMObject(c, app.VCenter())
	if err != nil {
		if err.Error() == "vCenter 未配置" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var m mo.VirtualMachine
	if err := vm.Properties(ctx, vm.Reference(), []string{"snapshot"}, &m); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	rows := make([]gin.H, 0)
	if m.Snapshot != nil {
		flattenVCenterSnapshotTree(m.Snapshot.RootSnapshotList, "", &rows)
	}
	c.JSON(http.StatusOK, gin.H{"snapshots": rows})
}

func handleVCenterVMSnapshotCreate(c *gin.Context, app *ServerApp) {
	vm, ctx, err := getVCenterVMObject(c, app.VCenter())
	if err != nil {
		if err.Error() == "vCenter 未配置" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Memory      bool   `json:"memory"`
		Quiesce     bool   `json:"quiesce"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体须为 JSON"})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "快照名称不能为空"})
		return
	}
	task, err := vm.CreateSnapshot(ctx, name, strings.TrimSpace(body.Description), body.Memory, body.Quiesce)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	SetAuditDetail(c, fmt.Sprintf("虚拟机 %s 创建快照 %s（taskId=%s）", moref, name, task.Reference().Value))
	c.JSON(http.StatusOK, gin.H{"ok": true, "taskId": task.Reference().Value})
}

func handleVCenterVMSnapshotRevert(c *gin.Context, app *ServerApp) {
	vm, ctx, err := getVCenterVMObject(c, app.VCenter())
	if err != nil {
		if err.Error() == "vCenter 未配置" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		SuppressPowerOn bool `json:"suppressPowerOn"`
	}
	_ = c.ShouldBindJSON(&body)
	name := strings.TrimSpace(c.Param("name"))
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "快照名称不能为空"})
		return
	}
	task, err := vm.RevertToSnapshot(ctx, name, body.SuppressPowerOn)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	SetAuditDetail(c, fmt.Sprintf("虚拟机 %s 回滚快照 %s（taskId=%s）", moref, name, task.Reference().Value))
	c.JSON(http.StatusOK, gin.H{"ok": true, "taskId": task.Reference().Value})
}

func handleVCenterVMSnapshotDelete(c *gin.Context, app *ServerApp) {
	vm, ctx, err := getVCenterVMObject(c, app.VCenter())
	if err != nil {
		if err.Error() == "vCenter 未配置" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(c.Param("name"))
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "快照名称不能为空"})
		return
	}
	removeChildren := c.Query("children") == "1" || c.Query("children") == "true"
	var consolidate *bool
	if raw := strings.TrimSpace(c.Query("consolidate")); raw != "" {
		v := raw == "1" || strings.EqualFold(raw, "true")
		consolidate = &v
	}
	task, err := vm.RemoveSnapshot(ctx, name, removeChildren, consolidate)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	SetAuditDetail(c, fmt.Sprintf("虚拟机 %s 删除快照 %s（taskId=%s）", moref, name, task.Reference().Value))
	c.JSON(http.StatusOK, gin.H{"ok": true, "taskId": task.Reference().Value})
}

func vcenterDatastoreRows(ctx context.Context, vc *vCenterClient) ([]gin.H, error) {
	rows := make([]gin.H, 0)
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		rows = rows[:0]
		f := find.NewFinder(client.Client, true)
		dcs, err := f.DatacenterList(ctx, "*")
		if err != nil {
			return err
		}
		seen := make(map[string]struct{})
		for _, dc := range dcs {
			f.SetDatacenter(dc)
			stores, err := f.DatastoreList(ctx, "*")
			if err != nil {
				continue
			}
			for _, ds := range stores {
				ref := ds.Reference().Value
				if _, ok := seen[ref]; ok {
					continue
				}
				seen[ref] = struct{}{}
				var m mo.Datastore
				if err := ds.Properties(ctx, ds.Reference(), []string{"name", "summary"}, &m); err != nil {
					continue
				}
				rows = append(rows, gin.H{
					"moref":              ref,
					"name":               m.Name,
					"type":               m.Summary.Type,
					"url":                m.Summary.Url,
					"capacityBytes":      m.Summary.Capacity,
					"freeBytes":          m.Summary.FreeSpace,
					"accessible":         m.Summary.Accessible,
					"multipleHostAccess": m.Summary.MultipleHostAccess,
					"maintenanceMode":    m.Summary.MaintenanceMode,
				})
			}
		}
		return nil
	})
	return rows, err
}

func handleVCenterDatastores(c *gin.Context, app *ServerApp) {
	vc := app.VCenter()
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	rows, err := vcenterDatastoreRows(c.Request.Context(), vc)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"datastores": rows})
}
