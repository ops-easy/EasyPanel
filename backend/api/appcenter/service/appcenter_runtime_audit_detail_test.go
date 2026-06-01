package service

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func readRuntimeAuditSource(t *testing.T, name string) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve current test path")
	}
	raw, err := os.ReadFile(filepath.Join(filepath.Dir(file), name))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func assertRuntimeAuditDetail(t *testing.T, source, marker, detail string) {
	t.Helper()
	if !strings.Contains(source, marker) {
		t.Fatalf("source missing marker %q", marker)
	}
	if !strings.Contains(source, detail) {
		t.Fatalf("source missing audit detail %q for %q", detail, marker)
	}
}

func TestAppCenterRuntimeMutationsSetReadableAuditDetails(t *testing.T) {
	cases := []struct {
		file   string
		marker string
		detail string
	}{
		{"hermes_handlers.go", "func handleAppHermesDeploy", "应用中心 Hermes 部署"},
		{"hermes_handlers.go", "func handleAppHermesRestart", "应用中心 Hermes 滚动重启"},
		{"hermes_handlers.go", "func handleAppHermesMigrate", "应用中心 Hermes 迁移 OpenClaw 数据"},
		{"hermes_handlers.go", "func handleAppHermesDelete", "应用中心 Hermes 删除实例"},
		{"hermes_handlers.go", "func handleAppHermesFilePut", "应用中心 Hermes 保存备注"},
		{"hermes_lifecycle.go", "func handleAppHermesUpgrade", "应用中心 Hermes 升级镜像"},
		{"hermes_lifecycle.go", "func handleAppHermesRollback", "应用中心 Hermes 回滚镜像"},
		{"hermes_exposure.go", "func handleAppHermesExposurePut", "应用中心 Hermes 更新暴露方式"},
		{"openclaw_handlers.go", "func handleAppOpenClawK8sDeploy", "应用中心 OpenClaw 部署"},
		{"openclaw_handlers.go", "func handleAppOpenClawSyncInspect", "应用中心 OpenClaw 同步到 AI 巡检"},
		{"openclaw_handlers.go", "func handleAppOpenClawGatewayImage", "应用中心 OpenClaw 更新网关镜像"},
		{"openclaw_handlers.go", "func handleAppOpenClawDelete", "应用中心 OpenClaw 删除实例"},
		{"openclaw_files.go", "func handleAppOpenClawFilePut", "应用中心 OpenClaw 保存文件"},
		{"openclaw_rbac.go", "func handleAppOpenClawInstanceRBACPreset", "应用中心 OpenClaw 更新 RBAC 预设"},
		{"openclaw_toolchain_handlers.go", "func handleAppOpenClawApplyToolchainPreset", "应用中心 OpenClaw 应用工具链预设"},
		{"openclaw_upstream.go", "func handleAppOpenClawSetChatModel", "应用中心 OpenClaw 更新对话模型"},
		{"openclaw_upstream.go", "func handleAppOpenClawApplyUpstreamRuntime", "应用中心 OpenClaw 应用上游运行时"},
		{"openclaw_telegram_handlers.go", "func handleOpenClawTelegramSettingsPut", "应用中心 OpenClaw 更新 Telegram 设置"},
		{"openclaw_telegram_handlers.go", "func handleOpenClawApplyTelegramToJSON", "应用中心 OpenClaw 写入 Telegram 配置"},
		{"openclaw_telegram_handlers.go", "func handleAppOpenClawPatchEgressProxy", "应用中心 OpenClaw 更新出口代理"},
	}

	for _, tc := range cases {
		t.Run(tc.marker, func(t *testing.T) {
			assertRuntimeAuditDetail(t, readRuntimeAuditSource(t, tc.file), tc.marker, tc.detail)
		})
	}
}
