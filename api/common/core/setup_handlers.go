package core

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

const setupConfigFileName = "setup-config.yaml"

func handleSetupStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"initialized": app.Initialized(),
			"dataDir":     app.DataDir(),
			"version":     1,
			"configMode":  "config.yaml+setup-config.yaml+mysql+env",
		})
	}
}

// setupSubmitBody 与 RuntimeSettings 同字段，另附明文密码仅用于首次写入启动配置。
type setupSubmitBody struct {
	RuntimeSettings
	DashboardPasswordPlain string `json:"dashboardPasswordPlain"`
}

func handleSetupSave(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		if app.Initialized() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "已完成初始化，请在系统设置中修改运行时配置"})
			return
		}
		var body setupSubmitBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效: " + err.Error()})
			return
		}
		rs := &body.RuntimeSettings
		if err := validateSetupPayload(rs, body.DashboardPasswordPlain); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := validateBaotaSSLMaterialContent(rs.BaotaSSLPemContent, rs.BaotaSSLKeyContent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		incomingBaotaSSLPemContent := strings.TrimSpace(rs.BaotaSSLPemContent)
		incomingBaotaSSLKeyContent := strings.TrimSpace(rs.BaotaSSLKeyContent)
		rs.Version = 1
		rs.Initialized = true
		rs.DashboardPassword = body.DashboardPasswordPlain

		if strings.TrimSpace(rs.DashboardSessionSecret) == "" {
			b := make([]byte, 32)
			if _, err := rand.Read(b); err != nil {
				RespondAPIError500(c, "生成会话密钥失败")
				return
			}
			rs.DashboardSessionSecret = hex.EncodeToString(b)
		}

		tmpCfg := MergeRuntimeConfig(app.Cfg(), rs, app.DataDir())
		tmpCfg = PrepareDashboardAuth(tmpCfg)
		if err := tmpCfg.Validate(); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var mysqlWrite *sql.DB
		if dsn := strings.TrimSpace(tmpCfg.MySQLDSN); dsn != "" {
			d, err := OpenMySQLPoolForRuntimeWrite(dsn)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "MySQL 连接或表结构初始化失败: " + err.Error()})
				return
			}
			if d != nil {
				defer d.Close()
				mysqlWrite = d
			}
		}
		rdb, err := dialRedisLight(tmpCfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Redis 连接失败，请检查地址、密码与网络: " + err.Error()})
			return
		}
		if rdb != nil {
			_ = rdb.Close()
		}

		raw, err := setupConfigYAML(rs, body.DashboardPasswordPlain, rs.DashboardSessionSecret)
		if err != nil {
			RespondAPIError500(c, "生成启动配置失败: "+err.Error())
			return
		}
		if err := saveSetupConfigFile(app.DataDir(), raw); err != nil {
			RespondAPIError500(c, "写入启动配置失败: "+err.Error())
			return
		}

		runtimeForMySQL := *rs
		runtimeForMySQL.BaotaSSLPemContent = ""
		runtimeForMySQL.BaotaSSLKeyContent = ""
		if err := SaveRuntimeSettingsToMySQL(mysqlWrite, &runtimeForMySQL); err != nil {
			RespondAPIError500(c, "写入 MySQL 动态配置失败: "+err.Error())
			return
		}
		if incomingBaotaSSLPemContent != "" || incomingBaotaSSLKeyContent != "" {
			if err := saveStoredBaotaSSLMaterial(app, tmpCfg, incomingBaotaSSLPemContent, incomingBaotaSSLKeyContent); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "保存宝塔 HTTPS 证书失败: " + err.Error()})
				return
			}
		}
		if err := app.Reload(); err != nil {
			RespondAPIError500(c, "重载配置失败: "+err.Error())
			return
		}
		InvalidateRuntimeStatusCache(context.Background(), app)
		InvalidateVCenterPrometheusCache(context.Background(), app)
		c.JSON(http.StatusOK, gin.H{"ok": true, "message": "初始化完成"})
	}
}

func setupConfigFilePath(dataDir string) string {
	return filepath.Join(dataDir, setupConfigFileName)
}

func saveSetupConfigFile(dataDir string, raw []byte) error {
	if strings.TrimSpace(dataDir) == "" {
		return errors.New("数据目录为空")
	}
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return err
	}
	path := setupConfigFilePath(dataDir)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func validateSetupPayload(rs *RuntimeSettings, plainPwd string) error {
	if rs == nil {
		return errors.New("配置为空")
	}
	if strings.TrimSpace(rs.PlatformPublicURL) == "" {
		return errors.New("platformPublicUrl 不能为空（平台对外访问地址）")
	}
	var tmp Config
	tmp.MySQLDSN = strings.TrimSpace(rs.MySQLDSN)
	tmp.MySQLHost = strings.TrimSpace(rs.MySQLHost)
	tmp.MySQLPort = rs.MySQLPort
	tmp.MySQLDatabase = strings.TrimSpace(rs.MySQLDatabase)
	tmp.MySQLUser = strings.TrimSpace(rs.MySQLUser)
	tmp.MySQLPassword = rs.MySQLPassword
	tmp.RedisAddr = strings.TrimSpace(rs.RedisAddr)
	tmp.RedisHost = strings.TrimSpace(rs.RedisHost)
	tmp.RedisPort = rs.RedisPort
	if tmp.RedisHost != "" && tmp.RedisPort <= 0 {
		tmp.RedisPort = 6379
	}
	if tmp.MySQLHost != "" && tmp.MySQLPort <= 0 {
		tmp.MySQLPort = 3306
	}
	FinalizeConnectionStrings(&tmp)
	if strings.TrimSpace(tmp.MySQLDSN) == "" {
		return errors.New("MySQL 未配置：请填写 mysqlDsn，或 mysqlHost、端口、mysqlDatabase、mysqlUser")
	}
	if strings.TrimSpace(tmp.RedisAddr) == "" {
		return errors.New("Redis 未配置：请填写 redisAddr，或 redisHost 与端口")
	}
	if len(strings.TrimSpace(rs.EncryptionKey)) < 16 {
		return errors.New("encryptionKey 长度至少 16（用于加密敏感数据）")
	}
	if rs.SyncIntervalSec < 1 {
		rs.SyncIntervalSec = 30
	}
	if strings.TrimSpace(rs.DashboardUser) == "" {
		return errors.New("dashboardUser 不能为空")
	}
	if len(plainPwd) < 8 {
		return errors.New("dashboardPasswordPlain 长度至少 8 位")
	}
	if rs.IngressBaotaSyncEnabled {
		ok := strings.TrimSpace(rs.BaotaURL) != "" && strings.TrimSpace(rs.BaotaAPIKey) != ""
		if len(rs.BaotaTargets) > 0 {
			ok = false
			for _, t := range rs.BaotaTargets {
				if strings.TrimSpace(t.URL) != "" && strings.TrimSpace(t.ApiKey) != "" {
					ok = true
					break
				}
			}
		}
		if !ok {
			return errors.New("开启 ingressBaotaSyncEnabled 时需填写 baotaUrl 与 baotaApiKey，或在 baotaTargets 中至少配置一条含 url 与 apiKey 的实例")
		}
	}
	if err := validateBaotaSSLMaterialContent(rs.BaotaSSLPemContent, rs.BaotaSSLKeyContent); err != nil {
		return err
	}
	if err := validateBaotaSSLMaterialPaths(rs.BaotaSSLPemPath, rs.BaotaSSLKeyPath); err != nil {
		return err
	}
	if rs.K8s != nil {
		mode := strings.ToLower(strings.TrimSpace(rs.K8s.Mode))
		if mode == "" {
			// 未选 K8s 时视为不连接集群
		} else if mode == "kubeconfig" {
			if strings.TrimSpace(rs.K8s.KubeconfigYAML) == "" {
				return errors.New("k8s.mode=kubeconfig 时 kubeconfigYaml 不能为空")
			}
		} else if mode != "none" && mode != "incluster" && mode != "disabled" {
			return errors.New("k8s.mode 须为 none、incluster 或 kubeconfig")
		}
	}
	be := strings.ToLower(strings.TrimSpace(rs.SSHSettingsBackend))
	if be == "file" || be == "redis" || be == "mysql" {
		if strings.TrimSpace(rs.EncryptionKey) == "" {
			return errors.New("启用 SSH 持久化时 encryptionKey 不能为空")
		}
	}
	return nil
}
