package core

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
)

func getVCenterVMObject(c *gin.Context, vc *vCenterClient) (*object.VirtualMachine, context.Context, error) {
	if !vc.cfg.vCenterConfigured() {
		return nil, nil, fmt.Errorf("vCenter 未配置")
	}
	moref := strings.TrimSpace(c.Param("moref"))
	if moref == "" {
		return nil, nil, fmt.Errorf("缺少 moref")
	}
	ctx := c.Request.Context()
	client, err := vc.getClient(ctx)
	if err != nil {
		return nil, nil, err
	}
	vm := object.NewVirtualMachine(client.Client, types.ManagedObjectReference{Type: "VirtualMachine", Value: moref})
	return vm, ctx, nil
}

type vCenterVMPowerBody struct {
	Action  string `json:"action"`
	Confirm bool   `json:"confirm"`
}

func normalizeVCenterVMPowerAction(action string) (canonical string, guestOnly string, err error) {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "":
		return "", "", fmt.Errorf("action 不能为空")
	case "on", "poweron", "power-on", "start":
		return "on", "", nil
	case "off", "poweroff", "power-off", "stop":
		return "off", "", nil
	case "suspend":
		return "suspend", "", nil
	case "reset":
		return "reset", "", nil
	case "shutdown_guest", "shutdown-guest", "shutdownguest", "guest_shutdown":
		return "shutdown_guest", "shutdownGuest", nil
	case "reboot_guest", "reboot-guest", "rebootguest", "guest_reboot":
		return "reboot_guest", "rebootGuest", nil
	case "standby_guest", "standby-guest", "standbyguest":
		return "standby_guest", "standbyGuest", nil
	default:
		return "", "", fmt.Errorf("未知 action，支持: on, off, suspend, reset, shutdown_guest, reboot_guest, standby_guest")
	}
}

func vCenterVMPowerActionRequiresConfirm(action string) bool {
	_, _, err := normalizeVCenterVMPowerAction(action)
	return err == nil
}

func vCenterQueryConfirmed(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func requireVCenterConfirm(c *gin.Context, confirmed bool, label string) bool {
	if confirmed {
		return true
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": label + " 需要显式 confirm=true"})
	return false
}

func handleVCenterVMPower(c *gin.Context, app *ServerApp) {
	var body vCenterVMPowerBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体须为 JSON，且包含 action"})
		return
	}
	action, guestOnly, err := normalizeVCenterVMPowerAction(body.Action)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if vCenterVMPowerActionRequiresConfirm(action) && !body.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vCenter 电源操作需要显式 confirm=true"})
		return
	}
	vc := app.VCenter()
	vm, ctx, err := getVCenterVMObject(c, vc)
	if err != nil {
		if err.Error() == "vCenter 未配置" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tpl, err := vm.IsTemplate(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if tpl {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模板虚拟机不能执行电源操作"})
		return
	}

	var run func(context.Context) (*object.Task, error)

	switch action {
	case "on":
		run = vm.PowerOn
	case "off":
		run = vm.PowerOff
	case "suspend":
		run = vm.Suspend
	case "reset":
		run = vm.Reset
	}

	if guestOnly != "" {
		switch guestOnly {
		case "shutdownGuest":
			err = vm.ShutdownGuest(ctx)
		case "rebootGuest":
			err = vm.RebootGuest(ctx)
		case "standbyGuest":
			err = vm.StandbyGuest(ctx)
		}
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		moref := strings.TrimSpace(c.Param("moref"))
		SetAuditDetail(c, fmt.Sprintf("虚拟机 %s 电源：%s（客户机 API）", moref, guestOnly))
		vcenterInvalidateVMCaches(c.Request.Context(), app, moref)
		c.JSON(http.StatusOK, gin.H{"ok": true, "action": guestOnly})
		return
	}

	task, err := run(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	SetAuditDetail(c, fmt.Sprintf("虚拟机 %s 电源：%s（taskId=%s）", moref, action, task.Reference().Value))
	c.JSON(http.StatusOK, gin.H{
		"ok":     true,
		"action": action,
		"taskId": task.Reference().Value,
	})
}

func handleVCenterTaskStatus(c *gin.Context, vc *vCenterClient) {
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	taskID := strings.TrimSpace(c.Param("taskId"))
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 taskId"})
		return
	}
	ctx := c.Request.Context()
	var m mo.Task
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		ref := types.ManagedObjectReference{Type: "Task", Value: taskID}
		taskObj := object.NewTask(client.Client, ref)
		return taskObj.Properties(ctx, taskObj.Reference(), []string{"info"}, &m)
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在或已过期: " + err.Error()})
		return
	}
	info := m.Info
	out := gin.H{
		"state":    string(info.State),
		"progress": info.Progress,
	}
	if info.Description != nil {
		out["description"] = info.Description.Message
	}
	if info.State == types.TaskInfoStateError && info.Error != nil {
		msg := strings.TrimSpace(info.Error.LocalizedMessage)
		if msg == "" {
			msg = fmt.Sprintf("%v", info.Error.Fault)
		}
		out["error"] = msg
	}
	c.JSON(http.StatusOK, out)
}

func handleVCenterVMHardware(c *gin.Context, app *ServerApp) {
	var body struct {
		NumCPU   *int32 `json:"numCpu"`
		MemoryMB *int64 `json:"memoryMB"`
		Confirm  bool   `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体须为 JSON"})
		return
	}
	if !requireVCenterConfirm(c, body.Confirm, "vCenter 虚拟机硬件变更") {
		return
	}
	vc := app.VCenter()
	vm, ctx, err := getVCenterVMObject(c, vc)
	if err != nil {
		if err.Error() == "vCenter 未配置" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tpl, err := vm.IsTemplate(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if tpl {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模板虚拟机不能修改硬件"})
		return
	}
	if body.NumCPU == nil && body.MemoryMB == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "至少指定 numCpu 或 memoryMB（正整数）"})
		return
	}

	spec := types.VirtualMachineConfigSpec{}
	if body.NumCPU != nil {
		if *body.NumCPU < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "numCpu 须 >= 1"})
			return
		}
		spec.NumCPUs = *body.NumCPU
	}
	if body.MemoryMB != nil {
		if *body.MemoryMB < 4 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "memoryMB 须 >= 4"})
			return
		}
		spec.MemoryMB = *body.MemoryMB
	}

	task, err := vm.Reconfigure(ctx, spec)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if err := task.Wait(ctx); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	var parts []string
	if body.NumCPU != nil {
		parts = append(parts, fmt.Sprintf("CPU=%d", *body.NumCPU))
	}
	if body.MemoryMB != nil {
		parts = append(parts, fmt.Sprintf("内存=%d MiB", *body.MemoryMB))
	}
	SetAuditDetail(c, fmt.Sprintf("虚拟机 %s 调整硬件：%s", moref, strings.Join(parts, "，")))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleVCenterVMDiskExpand(c *gin.Context, app *ServerApp) {
	var body struct {
		DeviceKey int32   `json:"deviceKey"`
		TotalGiB  float64 `json:"totalGiB"`
		Confirm   bool    `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体须为 JSON，包含 deviceKey 与 totalGiB"})
		return
	}
	if !requireVCenterConfirm(c, body.Confirm, "vCenter 虚拟机磁盘扩容") {
		return
	}
	vc := app.VCenter()
	vm, ctx, err := getVCenterVMObject(c, vc)
	if err != nil {
		if err.Error() == "vCenter 未配置" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.DeviceKey == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "deviceKey 无效"})
		return
	}
	if body.TotalGiB <= 0 || math.IsNaN(body.TotalGiB) || math.IsInf(body.TotalGiB, 0) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "totalGiB 须为大于 0 的数（目标总容量，GiB）"})
		return
	}

	tpl, err := vm.IsTemplate(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if tpl {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模板虚拟机不能扩容磁盘"})
		return
	}

	devices, err := vm.Device(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	raw := devices.FindByKey(body.DeviceKey)
	if raw == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该 deviceKey 对应设备"})
		return
	}
	disk, ok := raw.(*types.VirtualDisk)
	if !ok || disk == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该设备不是虚拟磁盘"})
		return
	}

	newKB := int64(math.Round(body.TotalGiB * 1024 * 1024))
	if disk.CapacityInKB >= newKB {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("新容量须大于当前值（当前约 %.2f GiB）", float64(disk.CapacityInKB)/(1024*1024))})
		return
	}

	newDisk := *disk
	newDisk.CapacityInKB = newKB
	if newKB > 0 {
		newDisk.CapacityInBytes = newKB * 1024
	}

	spec := types.VirtualMachineConfigSpec{
		DeviceChange: []types.BaseVirtualDeviceConfigSpec{
			&types.VirtualDeviceConfigSpec{
				Operation: types.VirtualDeviceConfigSpecOperationEdit,
				Device:    &newDisk,
			},
		},
	}

	task, err := vm.Reconfigure(ctx, spec)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if err := task.Wait(ctx); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	SetAuditDetail(c, fmt.Sprintf("虚拟机 %s 磁盘扩容 deviceKey=%d → %.2f GiB", moref, body.DeviceKey, body.TotalGiB))
	vcenterInvalidateVMCaches(c.Request.Context(), app, moref)
	c.JSON(http.StatusOK, gin.H{"ok": true, "capacityKB": newKB})
}
