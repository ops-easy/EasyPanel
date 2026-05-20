package main

import (
	"context"
	appcentersvc "kube-bt-sync/api/appcenter/service"
	harborsvc "kube-bt-sync/api/harbor/service"
	k8ssvc "kube-bt-sync/api/k8s/service"
	opssvc "kube-bt-sync/api/ops/service"
	settingssvc "kube-bt-sync/api/settings/service"
	systemsvc "kube-bt-sync/api/system/service"
	vcentersvc "kube-bt-sync/api/vcenter/service"
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/process"
	"kube-bt-sync/common/server"
	"kube-bt-sync/scheduler"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	process.ApplyGOMAXProcsFromEnv()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Println(">>> 初始化 kube-bt-sync 环境...")
	app, err := appctx.NewServerApp(appctx.DataDirFromEnv())
	if err != nil {
		log.Fatalf("加载应用状态失败: %v", err)
	}
	if app.Initialized() {
		if err := app.Cfg().Validate(); err != nil {
			log.Fatalf("配置校验失败: %v", err)
		}
	} else {
		log.Printf(">>> 尚未完成向导初始化，请浏览器访问 /setup；数据目录: %s", app.DataDir())
	}
	if app.Cfg().BaotaSkipTLSVerify {
		log.Println(">>> 宝塔 API 使用 HTTPS 且已跳过 TLS 证书校验（自签/证书与 IP 不一致时可用；正规证书可设 BAOTA_SKIP_TLS_VERIFY=false）")
	}
	if app.Initialized() && !app.Cfg().DashboardAuthEnabled() {
		log.Println(">>> 安全提示：当前未启用控制台登录（未配置本地密码且未启用 OIDC）。/api 下除探活/初始化/登录/Webhook 外均无会话鉴权，等效全员管理员；公网暴露时请务必启用 DASHBOARD_PASSWORD 或 OIDC。")
	}

	if app.K8s() == nil {
		log.Println(">>> K8s 客户端未就绪（未完成向导或集群不可达）")
	} else {
		log.Println(">>> K8s 客户端已连接")
	}

	bg := app.Cfg().EnableBackgroundJobs
	if !bg {
		log.Println(">>> KUBEBT_ENABLE_BACKGROUND_JOBS=false：本进程仅作 API/Web 副本，不启动宝塔同步、告警巡检、Pod 重启关联/报告清理、出站监视、vCenter Prom 缓存刷新、审计裁剪定时器（多副本时请保证至少一个 Pod 为 true）")
	}
	if bg {
		go scheduler.StartSyncer(ctx, app)
	}
	scheduler.StartRedisReconnectLoop(ctx, app)
	settingssvc.StartCrossPodRuntimeSync(ctx, func() *settingssvc.ServerApp { return app })
	settingssvc.StartRuntimeStatusRefresher(app)
	if bg {
		systemsvc.StartHostEgressWatcher(app)
		vcentersvc.StartPrometheusMetricsRefresher(app)
		k8ssvc.StartKubeSphereChartsCacheWatcher(app)
		go vcentersvc.BastionNativeSSHReconcileLoop(ctx, func() *vcentersvc.ServerApp { return app })
	}
	vcentersvc.StartSessionKeepalive(func() *vcentersvc.ServerApp { return app })
	systemsvc.InitLoginSecurityState(app)
	if bg {
		opssvc.StartBackground(app)
		k8ssvc.StartRestartCorrelationWorker(app)
		appcentersvc.StartOpenClawGatewayHealthWatcher(app)
		harborsvc.StartHarborImageIndexWorker(app)
		vcentersvc.StartEventWorker(app)
		k8ssvc.StartControlPlaneAdvisoryWorker(ctx, app)
	}
	server.Start(ctx, app)
}
