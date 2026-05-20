package core

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func maskSecret(s string) string {
	if strings.TrimSpace(s) == "" {
		return ""
	}
	return "***"
}

func handleGetRuntimeSettings(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		rs := app.Runtime()
		if rs == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到配置"})
			return
		}
		out := *rs
		out.K8sSidebarMenu = RuntimeK8sSidebarMenuEffective(rs)
		out.DashboardPassword = maskSecret(out.DashboardPassword)
		out.VCenterPassword = maskSecret(out.VCenterPassword)
		out.BaotaAPIKey = maskSecret(out.BaotaAPIKey)
		for i := range out.BaotaTargets {
			out.BaotaTargets[i].ApiKey = maskSecret(out.BaotaTargets[i].ApiKey)
		}
		out.RedisPassword = maskSecret(out.RedisPassword)
		out.MySQLPassword = maskSecret(out.MySQLPassword)
		out.EncryptionKey = maskSecret(out.EncryptionKey)
		out.VCenterVMSshPassword = maskSecret(out.VCenterVMSshPassword)
		out.VCenterVMSshKeyPassphrase = maskSecret(out.VCenterVMSshKeyPassphrase)
		out.OIDCClientSecret = maskSecret(out.OIDCClientSecret)
		if out.K8s != nil && strings.TrimSpace(out.K8s.KubeconfigYAML) != "" {
			out.K8s = &RuntimeK8s{Mode: out.K8s.Mode, KubeconfigYAML: "***"}
		}
		out.IdracPassword = maskSecret(out.IdracPassword)
		out.HarborPassword = maskSecret(out.HarborPassword)
		hasSSL := hasStoredBaotaSSLMaterial(app)
		out.HasBaotaSSLMaterial = &hasSSL
		out.BaotaSSLPemContent = ""
		out.BaotaSSLKeyContent = ""
		out.ClearBaotaSSLMaterial = false
		if out.VictoriaLogsRetentionDays <= 0 {
			out.VictoriaLogsRetentionDays = 180
		}
		c.JSON(http.StatusOK, out)
	}
}

func handlePutRuntimeSettings(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body RuntimeSettings
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效: " + err.Error()})
			return
		}
		body.IdracHost = strings.TrimSpace(body.IdracHost)
		body.IdracUser = strings.TrimSpace(body.IdracUser)
		body.BaotaUpstreamHost = strings.TrimSpace(body.BaotaUpstreamHost)
		body.BaotaUpstreamPort = strings.TrimSpace(body.BaotaUpstreamPort)
		body.BaotaUpstreamScheme = normalizeBaotaUpstreamScheme(body.BaotaUpstreamScheme)
		body.BaotaSSLCertName = strings.TrimSpace(body.BaotaSSLCertName)
		body.BaotaSSLPemPath = strings.TrimSpace(body.BaotaSSLPemPath)
		body.BaotaSSLKeyPath = strings.TrimSpace(body.BaotaSSLKeyPath)
		body.BaotaSSLPemContent = strings.TrimSpace(body.BaotaSSLPemContent)
		body.BaotaSSLKeyContent = strings.TrimSpace(body.BaotaSSLKeyContent)
		body.IngressNginxControllerNodeName = strings.TrimSpace(body.IngressNginxControllerNodeName)
		body.VictoriaLogsURL = strings.TrimSpace(body.VictoriaLogsURL)
		body.VMLogVectorDownloadBaseURL = vmShipperNormalizeVectorDownloadBaseURL(strings.TrimSpace(body.VMLogVectorDownloadBaseURL))
		if body.VictoriaLogsURL != "" {
			if err := validatePrometheusBaseURL(body.VictoriaLogsURL); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "victoriaLogsUrl 无效: " + err.Error()})
				return
			}
		}
		if body.VMLogVectorDownloadBaseURL != "" {
			if err := validatePrometheusBaseURL(body.VMLogVectorDownloadBaseURL); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "vmLogVectorDownloadBaseUrl 无效: " + err.Error()})
				return
			}
		}
		if strings.TrimSpace(body.HarborBaseURL) != "" {
			if err := validatePrometheusBaseURL(body.HarborBaseURL); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "harborBaseUrl 无效: " + err.Error()})
				return
			}
		}
		if err := validateBaotaSSLMaterialContent(body.BaotaSSLPemContent, body.BaotaSSLKeyContent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		incomingBaotaSSLPemContent := body.BaotaSSLPemContent
		incomingBaotaSSLKeyContent := body.BaotaSSLKeyContent
		clearBaotaSSLMaterial := body.ClearBaotaSSLMaterial
		cur := app.Runtime()
		if cur == nil || !cur.Initialized {
			c.JSON(http.StatusBadRequest, gin.H{"error": "尚未完成初始化"})
			return
		}
		curCopy := *cur
		cur = &curCopy
		if body.VictoriaLogsRetentionDays == 0 {
			if cur.VictoriaLogsRetentionDays > 0 {
				body.VictoriaLogsRetentionDays = cur.VictoriaLogsRetentionDays
			} else {
				body.VictoriaLogsRetentionDays = 180
			}
		}
		if body.VictoriaLogsRetentionDays < 7 || body.VictoriaLogsRetentionDays > 730 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "victoriaLogsRetentionDays 须在 7-730 之间"})
			return
		}
		if body.K8sSidebarMenu == nil {
			body.K8sSidebarMenu = cur.K8sSidebarMenu
		}
		normMenu, err := normalizeRuntimeK8sSidebarMenu(body.K8sSidebarMenu)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		body.K8sSidebarMenu = normMenu
		if body.K8s == nil && cur.K8s != nil {
			body.K8s = cur.K8s
		}
		if body.BaotaSSLPemPath == "***" {
			body.BaotaSSLPemPath = cur.BaotaSSLPemPath
		}
		if body.BaotaSSLKeyPath == "***" {
			body.BaotaSSLKeyPath = cur.BaotaSSLKeyPath
		}
		body.HasBaotaSSLMaterial = nil
		body.BaotaSSLPemContent = ""
		body.BaotaSSLKeyContent = ""
		body.Version = cur.Version
		if body.Version <= 0 {
			body.Version = 1
		}
		body.Initialized = true
		if body.BaotaTargets == nil {
			body.BaotaTargets = cur.BaotaTargets
		}
		if strings.TrimSpace(body.DashboardPassword) == "" || body.DashboardPassword == "***" {
			body.DashboardPassword = cur.DashboardPassword
		}
		if strings.TrimSpace(body.VCenterPassword) == "" || body.VCenterPassword == "***" {
			body.VCenterPassword = cur.VCenterPassword
		}
		if strings.TrimSpace(body.BaotaAPIKey) == "" || body.BaotaAPIKey == "***" {
			body.BaotaAPIKey = cur.BaotaAPIKey
		}
		if err := mergeAndValidateRuntimeBaotaTargetsOnPut(&body, cur); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.TrimSpace(body.RedisPassword) == "" || body.RedisPassword == "***" {
			body.RedisPassword = cur.RedisPassword
		}
		if strings.TrimSpace(body.MySQLPassword) == "" || body.MySQLPassword == "***" {
			body.MySQLPassword = cur.MySQLPassword
		}
		if strings.TrimSpace(body.EncryptionKey) == "" || body.EncryptionKey == "***" {
			body.EncryptionKey = cur.EncryptionKey
		}
		if strings.TrimSpace(body.VCenterVMSshPassword) == "" || body.VCenterVMSshPassword == "***" {
			body.VCenterVMSshPassword = cur.VCenterVMSshPassword
		}
		if strings.TrimSpace(body.VCenterVMSshKeyPassphrase) == "" || body.VCenterVMSshKeyPassphrase == "***" {
			body.VCenterVMSshKeyPassphrase = cur.VCenterVMSshKeyPassphrase
		}
		if strings.TrimSpace(body.OIDCClientSecret) == "" || body.OIDCClientSecret == "***" {
			body.OIDCClientSecret = cur.OIDCClientSecret
		}
		if strings.TrimSpace(body.VCenterVMSshPrivateKeyPath) == "" {
			body.VCenterVMSshKeyPassphrase = ""
		}
		if body.K8s != nil {
			if strings.TrimSpace(body.K8s.KubeconfigYAML) == "" || body.K8s.KubeconfigYAML == "***" {
				if cur.K8s != nil {
					body.K8s.KubeconfigYAML = cur.K8s.KubeconfigYAML
				}
			}
		}
		if strings.TrimSpace(body.IdracPassword) == "" || body.IdracPassword == "***" {
			body.IdracPassword = cur.IdracPassword
		}
		if strings.TrimSpace(body.HarborPassword) == "" || body.HarborPassword == "***" {
			body.HarborPassword = cur.HarborPassword
		}
		if body.IngressNginxHostHTTPPort != 0 && (body.IngressNginxHostHTTPPort < 1 || body.IngressNginxHostHTTPPort > 65535) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ingressNginxHostHttpPort 须在 1-65535 之间"})
			return
		}
		if body.IngressNginxHostHTTPSPort != 0 && (body.IngressNginxHostHTTPSPort < 1 || body.IngressNginxHostHTTPSPort > 65535) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ingressNginxHostHttpsPort 须在 1-65535 之间"})
			return
		}
		if body.BaotaUpstreamPort != "" {
			if n, err := strconv.Atoi(body.BaotaUpstreamPort); err != nil || n < 1 || n > 65535 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "baotaUpstreamPort 须在 1-65535 之间"})
				return
			}
		}
		if err := ValidateAssetsCDNBaseURL(body.AssetsCDNBaseURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		restoreMySQLBootstrapRuntime(&body, mysqlBootstrapConfigFrom(app.Cfg()))
		if strings.TrimSpace(body.IdracHost) == "" {
			body.IdracUser = ""
			body.IdracPassword = ""
		} else {
			if strings.TrimSpace(body.IdracUser) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "已填写 iDRAC 地址时，请同时填写用户名"})
				return
			}
			if strings.TrimSpace(body.IdracPassword) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "已填写 iDRAC 地址时，请填写密码（或保留已保存密码勿清空）"})
				return
			}
			ic, err := IdracHostConfigFromFlat(body.IdracHost, body.IdracUser, body.IdracPassword, body.IdracInsecure)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "iDRAC 地址无效: " + err.Error()})
				return
			}
			if err := VerifyIdracRedfish(ic); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		}
		tmp := MergeRuntimeConfig(app.Cfg(), &body, app.DataDir())
		tmp = PrepareDashboardAuth(tmp)
		if err := tmp.Validate(); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		saveDB := app.MySQLDB()
		closeSaveDB := false
		if saveDB == nil {
			dsn := strings.TrimSpace(tmp.MySQLDSN)
			if dsn == "" {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "动态配置需要 MySQL；请先在静态 config.yaml 或环境变量中配置 MySQL"})
				return
			}
			d, err := OpenMySQLPoolForRuntimeWrite(dsn)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "MySQL 不可用或表结构初始化失败: " + err.Error()})
				return
			}
			saveDB = d
			closeSaveDB = true
		}
		if closeSaveDB {
			defer func() { _ = saveDB.Close() }()
		}
		if err := SaveRuntimeSettingsToMySQL(saveDB, &body); err != nil {
			RespondAPIError500(c, "写入 MySQL 动态配置失败: "+err.Error())
			return
		}
		if clearBaotaSSLMaterial {
			if err := clearStoredBaotaSSLMaterial(app, tmp); err != nil {
				RespondAPIError500(c, "清空宝塔 HTTPS 证书失败: "+err.Error())
				return
			}
		} else if incomingBaotaSSLPemContent != "" || incomingBaotaSSLKeyContent != "" {
			if err := saveStoredBaotaSSLMaterial(app, tmp, incomingBaotaSSLPemContent, incomingBaotaSSLKeyContent); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "保存宝塔 HTTPS 证书失败: " + err.Error()})
				return
			}
		}
		if r := app.Redis(); r != nil && tmp.RuntimeDualWriteRedis {
			ctxM, cancelM := context.WithTimeout(c.Request.Context(), 25*time.Second)
			if err := MirrorRuntimeSettingsToRedis(ctxM, r, tmp, &body); err != nil {
				log.Printf("runtime: 保存后镜像 Redis: %v", err)
			}
			cancelM()
		}
		if err := app.Reload(); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		InvalidateRuntimeStatusCache(context.Background(), app)
		InvalidateVCenterPrometheusCache(context.Background(), app)
		HarborCacheBustGen(context.Background(), app)
		go func(a *ServerApp) {
			ctx, cancel := context.WithTimeout(context.Background(), time.Duration(harborIndexCrawlTimeoutSec())*time.Second)
			defer cancel()
			HarborIndexRefreshOnce(ctx, a)
		}(app)
		SetAuditDetail(c, runtimeSettingsAuditSummary(cur, &body))
		InvalidateUserConfigAPICache(context.Background(), app, dashboardUsernameFromGin(c))
		c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已保存 MySQL 动态配置并重载"})
	}
}
