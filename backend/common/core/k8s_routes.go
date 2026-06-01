package core

import "github.com/gin-gonic/gin"

func RegisterK8sRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/k8s/summary", func(c *gin.Context) { handleK8sSummary(c, app.K8s()) })
	api.GET("/k8s/rbac/service-accounts/:namespace/:name", func(c *gin.Context) {
		handleK8sRBACServiceAccountDetail(c, app.K8s())
	})
	api.GET("/k8s/rbac", func(c *gin.Context) { handleK8sRBACOverview(c, app.K8s()) })
	api.POST("/k8s/rbac/global-read-user", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s RBAC global read user create"), func(c *gin.Context) {
		handleK8sRBACGlobalReadUserCreate(c, app.K8s(), app.K8sREST())
	})
	api.POST("/k8s/rbac/quick-readonly-user", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s RBAC quick readonly user create"), func(c *gin.Context) {
		handleK8sRBACQuickReadonlyUserCreate(c, app.K8s(), app.K8sREST())
	})
	api.POST("/k8s/crds/:crdName/instances", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s custom resource create"), func(c *gin.Context) {
		handleK8sCustomResourceCreate(c, app.K8s(), app.K8sREST())
	})
	api.GET("/k8s/crds/:crdName/instances/:namespace/:objName", func(c *gin.Context) {
		handleK8sCustomResourceGet(c, app.K8s(), app.K8sREST())
	})
	api.PUT("/k8s/crds/:crdName/instances/:namespace/:objName", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s custom resource update"), func(c *gin.Context) {
		handleK8sCustomResourceUpdate(c, app.K8s(), app.K8sREST())
	})
	api.DELETE("/k8s/crds/:crdName/instances/:namespace/:objName", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s custom resource delete"), func(c *gin.Context) {
		handleK8sCustomResourceDelete(c, app.K8s(), app.K8sREST())
	})
	api.GET("/k8s/crds/:crdName/instances", func(c *gin.Context) {
		handleK8sCustomResourceList(c, app.K8s(), app.K8sREST())
	})
	api.DELETE("/k8s/crds/:crdName", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s CRD delete"), func(c *gin.Context) {
		handleK8sCRDDelete(c, app.K8s(), app.K8sREST())
	})
	api.GET("/k8s/crds", func(c *gin.Context) { handleK8sCRDList(c, app.K8s(), app.K8sREST()) })
	api.GET("/k8s/crds/:crdName", func(c *gin.Context) { handleK8sCRDGet(c, app.K8s(), app.K8sREST()) })
	api.GET("/k8s/nodes", func(c *gin.Context) { handleK8sNodes(c, app) })
	api.GET("/k8s/namespaces/stats", func(c *gin.Context) { handleK8sNamespaceStats(c, app.K8s()) })
	api.GET("/k8s/namespace-stats", func(c *gin.Context) { handleK8sNamespaceStats(c, app.K8s()) })
	api.GET("/k8s/pods/metrics", func(c *gin.Context) { handleK8sPodsMetrics(c, app.Cfg()) })
	api.GET("/k8s/pods/resource-efficiency", func(c *gin.Context) {
		handleK8sPodsResourceEfficiency(c, app.K8s(), app.Cfg())
	})
	api.GET("/k8s/prometheus/cluster-charts", func(c *gin.Context) { handleGetK8sKubeSphereCharts(c, app) })
	api.GET("/k8s/prometheus/cluster-snapshot", func(c *gin.Context) { handleGetK8sKubeSphereSnapshot(c, app) })
	api.GET("/k8s/prometheus/pod-network-top", func(c *gin.Context) { handleGetK8sPodNetworkTop(c, app) })
	api.GET("/k8s/etcd/summary", func(c *gin.Context) { handleGetK8sEtcdSummary(c, app) })
	api.POST("/k8s/etcd/defrag-job", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s etcd defrag job create"), func(c *gin.Context) {
		handlePostK8sEtcdDefragJob(c, app)
	})
	api.POST("/k8s/etcd/defrag-job-yaml", AdminOnlyMiddleware(app), func(c *gin.Context) { handlePostK8sEtcdDefragJobYAML(c, app) })
	api.GET("/k8s/prometheus/kubesphere-charts", func(c *gin.Context) { handleGetK8sKubeSphereCharts(c, app) })
	api.GET("/k8s/prometheus/kubesphere-snapshot", func(c *gin.Context) { handleGetK8sKubeSphereSnapshot(c, app) })
	api.GET("/k8s/pods/:namespace/:name/exec/ws", func(c *gin.Context) { handleK8sPodExecWS(c, app.K8s(), app.K8sREST()) })
	api.GET("/k8s/pods/:namespace/:name/logs", func(c *gin.Context) { handleK8sPodLogs(c, app.K8s()) })
	api.GET("/k8s/pods/:namespace/:name", func(c *gin.Context) { handleK8sPodGet(c, app.K8s()) })
	api.DELETE("/k8s/pods/:namespace/:name", k8sMutationConfirmMiddleware("K8s pod delete"), func(c *gin.Context) { handleK8sPodDelete(c, app.K8s()) })
	api.GET("/k8s/pod-restarts", func(c *gin.Context) { handleK8sPodRestarts(c, app.K8s()) })
	api.GET("/k8s/pod-restart-insights", func(c *gin.Context) { handleK8sPodRestartInsights(c, app.K8s()) })
	api.GET("/k8s/pod-restart-ai/reports", func(c *gin.Context) { handleK8sPodRestartAIReportsList(c, app) })
	api.DELETE("/k8s/pod-restart-ai/reports/:id", AdminOnlyMiddleware(app), func(c *gin.Context) { handleK8sPodRestartAIReportDelete(c, app) })
	api.POST("/k8s/pod-restart-ai/reports", func(c *gin.Context) { handleK8sPodRestartAIReportSave(c, app) })
	api.GET("/k8s/pod-restart-ai/correlation-latest", func(c *gin.Context) { handleK8sPodRestartAICorrelationLatest(c, app) })
	api.GET("/k8s/pod-restart-ai/rollup-summary", func(c *gin.Context) { handleK8sPodRestartAIRollupSummary(c, app) })
	api.GET("/k8s/workloads/resource-advisory", func(c *gin.Context) {
		handleK8sWorkloadsResourceAdvisory(c, app.K8s(), app.Cfg())
	})
	api.POST("/k8s/workloads/scheduling-check", func(c *gin.Context) { handleK8sWorkloadSchedulingCheck(c, app.K8s()) })
	api.POST("/k8s/workloads/scheduling-check-yaml", func(c *gin.Context) { handleK8sWorkloadSchedulingCheckYAML(c, app.K8s()) })
	api.POST("/k8s/workloads/patch-container-resources", k8sMutationConfirmMiddleware("K8s workload resource patch"), func(c *gin.Context) {
		handleK8sWorkloadPatchContainerResources(c, app)
	})
	api.GET("/k8s/pods", func(c *gin.Context) { handleK8sPods(c, app.K8s()) })
	api.GET("/k8s/services", func(c *gin.Context) { handleK8sServices(c, app.K8s()) })
	api.GET("/k8s/ingresses", func(c *gin.Context) { handleK8sIngresses(c, app.K8s()) })
	api.GET("/k8s/addons/status", func(c *gin.Context) { handleK8sAddonsStatus(c, app) })
	api.GET("/k8s/addons/ingress-nginx/verify", func(c *gin.Context) { handleK8sAddonsIngressVerify(c, app) })
	api.POST("/k8s/addons/ingress-nginx/install", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s ingress-nginx install"), func(c *gin.Context) {
		handleK8sAddonsIngressNginxInstall(c, app)
	})
	api.POST("/k8s/addons/ingress-nginx/uninstall", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s ingress-nginx uninstall"), func(c *gin.Context) {
		handleK8sAddonsIngressNginxUninstall(c, app)
	})
	api.POST("/k8s/addons/ingress-nginx/host-ports", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s ingress-nginx host ports update"), func(c *gin.Context) {
		handleK8sAddonsIngressHostPorts(c, app)
	})
	api.POST("/k8s/addons/ingress-nginx/controller-node", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s ingress-nginx controller node update"), func(c *gin.Context) {
		handleK8sAddonsIngressControllerNode(c, app)
	})
	api.GET("/k8s/addons/dashboard-monitoring/verify", func(c *gin.Context) { handleK8sAddonsDashboardMonitoringVerify(c, app) })
	api.POST("/k8s/addons/dashboard-monitoring/install", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s dashboard monitoring install"), func(c *gin.Context) {
		handleK8sAddonsDashboardMonitoringInstall(c, app)
	})
	api.GET("/k8s/addons/kube-prometheus-stack/verify", func(c *gin.Context) { handleK8sAddonsKubePrometheusStackVerify(c, app) })
	api.POST("/k8s/addons/kube-prometheus-stack/install", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s kube-prometheus-stack install"), func(c *gin.Context) {
		handleK8sAddonsKubePrometheusStackInstall(c, app)
	})
	api.POST("/k8s/addons/kube-prometheus-stack/sync-runtime", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s kube-prometheus-stack runtime sync"), func(c *gin.Context) {
		handleK8sAddonsKubePrometheusStackSyncRuntime(c, app)
	})
	api.GET("/k8s/addons/victoria-logs/verify", func(c *gin.Context) { handleK8sAddonsVictoriaLogsVerify(c, app) })
	api.POST("/k8s/addons/victoria-logs/install", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware("K8s VictoriaLogs install"), func(c *gin.Context) {
		handleK8sAddonsVictoriaLogsInstall(c, app)
	})
	api.GET("/k8s/resource-relations", func(c *gin.Context) { handleK8sResourceRelations(c, app.K8s()) })
	api.GET("/k8s/deployments", func(c *gin.Context) { handleK8sDeployments(c, app.K8s()) })
	api.POST("/k8s/deployments/:namespace/:name/restart", k8sMutationConfirmMiddleware("K8s deployment restart"), func(c *gin.Context) {
		handleK8sDeploymentRolloutRestart(c, app.K8s())
	})
	api.GET("/k8s/statefulsets", func(c *gin.Context) { handleK8sStatefulSets(c, app.K8s()) })
	api.GET("/k8s/daemonsets", func(c *gin.Context) { handleK8sDaemonSets(c, app.K8s()) })
	api.GET("/k8s/pvcs", func(c *gin.Context) { handleK8sPVCs(c, app.K8s()) })
	api.POST("/k8s/pvcs/:namespace/:name/expand", k8sMutationConfirmMiddleware("K8s PVC expand"), func(c *gin.Context) { handleK8sPVCExpand(c, app.K8s()) })
	api.GET("/k8s/pvc-files/:namespace/:pvcName/mounts", func(c *gin.Context) { handleK8sPVCFileMounts(c, app.K8s()) })
	api.GET("/k8s/pvc-files/:namespace/:pvcName/list", func(c *gin.Context) { handleK8sPVCFileList(c, app.K8s(), app.K8sREST()) })
	api.GET("/k8s/pvc-files/:namespace/:pvcName/read", func(c *gin.Context) { handleK8sPVCFileRead(c, app.K8s(), app.K8sREST()) })
	api.PUT("/k8s/pvc-files/:namespace/:pvcName/write", k8sMutationConfirmMiddleware("K8s PVC file write"), func(c *gin.Context) {
		handleK8sPVCFileWrite(c, app.K8s(), app.K8sREST())
	})
	api.POST("/k8s/pvc-files/:namespace/:pvcName/delete", k8sMutationConfirmMiddleware("K8s PVC file delete"), func(c *gin.Context) {
		handleK8sPVCFileDelete(c, app.K8s(), app.K8sREST())
	})
	api.POST("/k8s/pvc-files/:namespace/:pvcName/mkdir", k8sMutationConfirmMiddleware("K8s PVC directory create"), func(c *gin.Context) {
		handleK8sPVCFileMkdir(c, app.K8s(), app.K8sREST())
	})
	api.POST("/k8s/pvc-files/:namespace/:pvcName/rename", k8sMutationConfirmMiddleware("K8s PVC file rename"), func(c *gin.Context) {
		handleK8sPVCFileRename(c, app.K8s(), app.K8sREST())
	})
	api.GET("/k8s/storage-classes", func(c *gin.Context) { handleK8sStorageClasses(c, app.K8s()) })
	api.GET("/k8s/configmaps", func(c *gin.Context) { handleK8sConfigMaps(c, app.K8s()) })
	api.GET("/k8s/secrets", func(c *gin.Context) { handleK8sSecrets(c, app.K8s()) })
	api.POST("/k8s/apply-yaml", k8sMutationConfirmMiddleware("K8s YAML apply"), func(c *gin.Context) { handleK8sApplyYamlGeneric(c, app) })
	api.GET("/k8s/object-yaml", func(c *gin.Context) { handleK8sGetObjectYAML(c, app.K8s()) })
	api.GET("/k8s/object-json", func(c *gin.Context) { handleK8sGetObjectJSON(c, app.K8s()) })
	api.PUT("/k8s/object-json", k8sMutationConfirmMiddleware("K8s object JSON update"), func(c *gin.Context) { handleK8sPutObjectJSON(c, app) })
	api.GET("/k8s/object-revisions", func(c *gin.Context) { handleK8sObjectRevisionsList(c, app) })
	api.GET("/k8s/object-revisions/yaml", func(c *gin.Context) { handleK8sObjectRevisionYAML(c, app) })
	api.GET("/k8s/object-revisions/diff", func(c *gin.Context) { handleK8sObjectRevisionDiff(c, app) })
	api.POST("/k8s/object-revisions/rollback", k8sMutationConfirmMiddleware("K8s object revision rollback"), func(c *gin.Context) {
		handleK8sObjectRevisionRollback(c, app)
	})
	api.DELETE("/k8s/objects/:kind/:namespace/:name", k8sMutationConfirmMiddleware("K8s object delete"), func(c *gin.Context) {
		handleK8sDeleteObject(c, app.K8s())
	})
}
