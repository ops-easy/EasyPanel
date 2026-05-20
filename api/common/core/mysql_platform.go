package core

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"kube-bt-sync/pkg/platformkv"

	_ "github.com/go-sql-driver/mysql"
)

func mysqlPoolMaxOpen() int {
	return clampMySQLPoolInt(os.Getenv("KUBEBT_MYSQL_MAX_OPEN_CONNS"), 32, 1, 256)
}

func mysqlPoolMaxIdle() int {
	return clampMySQLPoolInt(os.Getenv("KUBEBT_MYSQL_MAX_IDLE_CONNS"), 16, 0, 128)
}

func clampMySQLPoolInt(s string, def, min, max int) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

// mysqlPingTimeout 单次 Ping 超时；过小易导致云库/跨区「context deadline exceeded」。可用 KUBEBT_MYSQL_PING_TIMEOUT_SEC（5～180，默认 30）。
func mysqlPingTimeout() time.Duration {
	sec := 30
	if s := strings.TrimSpace(os.Getenv("KUBEBT_MYSQL_PING_TIMEOUT_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 5 && n <= 180 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

const (
	// dynamicConfigYAMLKVKey 保存页面动态配置的业务分组 YAML。
	dynamicConfigYAMLKVKey = "config_override_yaml_v1"
	// runtimeConfigKVKey 仅用于兼容旧版本已经写入 MySQL 的 JSON 配置。
	runtimeConfigKVKey = "runtime_config_v1"
)

func openMySQLPool(dsn string) (*sql.DB, error) {
	return openMySQLPoolInternal(dsn, true)
}

func openMySQLPoolInternal(dsn string, tryAutoCreateDB bool) (*sql.DB, error) {
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return nil, errors.New("MySQL DSN 为空")
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	maxOpen := mysqlPoolMaxOpen()
	maxIdle := mysqlPoolMaxIdle()
	if maxIdle > maxOpen {
		maxIdle = maxOpen
	}
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxIdle)
	db.SetConnMaxLifetime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), mysqlPingTimeout())
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		if tryAutoCreateDB && mysqlAutoCreateDatabaseEnabled() && mysqlIsUnknownDatabaseErr(err) {
			if cre := mysqlEnsureDatabaseExists(dsn); cre != nil {
				return nil, fmt.Errorf("%w（自动建库失败: %v）", err, cre)
			}
			return openMySQLPoolInternal(dsn, false)
		}
		return nil, err
	}
	return db, nil
}

// OpenMySQLPoolForRuntimeWrite 打开连接并创建/迁移 kubebt_* 表。保存 runtime 写入 platform_kv 前必须调用，否则会出现表不存在（如 1146）。
func OpenMySQLPoolForRuntimeWrite(dsn string) (*sql.DB, error) {
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return nil, nil
	}
	db, err := openMySQLPool(dsn)
	if err != nil {
		return nil, err
	}
	if err := mysqlEnsureSchema(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := mysqlMigrateSchema(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// mysqlEnsureSchema 启动时逐张校验/创建 kubebt_* 表（见 mysql_bootstrap.go）；任一表失败都会返回错误，避免缺表运行。
func mysqlEnsureSchema(db *sql.DB) error {
	return mysqlApplyBootstrapDDLs(db)
}

// migratePlatformKVFromFileIfMySQLEmpty 若 MySQL 中无键值，则从本地 platform_kv.json 导入。
func migratePlatformKVFromFileIfMySQLEmpty(db *sql.DB, dataDir string) error {
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM kubebt_platform_kv`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	fkv, err := newPlatformKVFile(dataDir)
	if err != nil {
		return err
	}
	for k, v := range fkv.Snapshot() {
		if err := mysqlUpsertKV(db, k, v); err != nil {
			return err
		}
	}
	if n == 0 && len(fkv.Snapshot()) > 0 {
		log.Printf("持久化: 已将 platform_kv.json 导入 MySQL（%d 条键）", len(fkv.Snapshot()))
	}
	return nil
}

func mysqlUpsertKV(db *sql.DB, k, v string) error {
	return platformkv.UpsertMySQL(db, k, v)
}

func loadRuntimeFromMySQL(db *sql.DB) (*RuntimeSettings, error) {
	var s sql.NullString
	err := db.QueryRow(`SELECT v FROM kubebt_platform_kv WHERE k=?`, runtimeConfigKVKey).Scan(&s)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if !s.Valid || strings.TrimSpace(s.String) == "" {
		return nil, nil
	}
	var rs RuntimeSettings
	if err := json.Unmarshal([]byte(s.String), &rs); err != nil {
		return nil, err
	}
	return &rs, nil
}

func loadDynamicConfigYAMLFromMySQL(db *sql.DB) ([]byte, bool, error) {
	if db == nil {
		return nil, false, nil
	}
	var s sql.NullString
	err := db.QueryRow(`SELECT v FROM kubebt_platform_kv WHERE k=?`, dynamicConfigYAMLKVKey).Scan(&s)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !s.Valid || strings.TrimSpace(s.String) == "" {
		return nil, false, nil
	}
	return []byte(s.String), true, nil
}

// applyConfigOverrideFromMySQL 从 MySQL 读取动态配置并叠加到静态配置。
func applyConfigOverrideFromMySQL(db *sql.DB, cfg *Config) error {
	if db == nil || cfg == nil {
		return nil
	}
	bootstrap := mysqlBootstrapConfigFrom(*cfg)
	if raw, ok, err := loadDynamicConfigYAMLFromMySQL(db); err != nil {
		return err
	} else if ok {
		applyConfigYAMLBytes(cfg, raw, "MySQL 动态配置")
		restoreMySQLBootstrapConfig(cfg, bootstrap)
		restoreMySQLBootstrapRuntime(cfg.configFileRuntime, bootstrap)
		return nil
	}
	rs, err := loadRuntimeFromMySQL(db)
	if err != nil {
		return err
	}
	if rs == nil || !rs.Initialized {
		return nil
	}
	restoreMySQLBootstrapRuntime(rs, bootstrap)
	merged := MergeRuntimeConfig(*cfg, rs, "")
	restoreMySQLBootstrapConfig(&merged, bootstrap)
	merged.configFileRuntime = rs
	*cfg = merged
	log.Println("config: 已按兼容模式加载 MySQL 中的旧 runtime_config_v1")
	return nil
}

// SaveRuntimeSettingsToMySQL 将动态配置保存到 MySQL platform_kv，并通知其它副本热重载。
func SaveRuntimeSettingsToMySQL(db *sql.DB, rs *RuntimeSettings) error {
	if db == nil {
		return errors.New("MySQL 未连接，无法保存动态配置")
	}
	raw, err := RuntimeSettingsToConfigYAML(rs)
	if err != nil {
		return err
	}
	if err := mysqlUpsertKV(db, dynamicConfigYAMLKVKey, string(raw)); err != nil {
		return err
	}
	mysqlBumpRuntimeConfigRevision(db)
	return nil
}

type mysqlBootstrapConfig struct {
	DSN      string
	Host     string
	Port     int
	Database string
	User     string
	Password string
}

func mysqlBootstrapConfigFrom(cfg Config) mysqlBootstrapConfig {
	return mysqlBootstrapConfig{
		DSN:      cfg.MySQLDSN,
		Host:     cfg.MySQLHost,
		Port:     cfg.MySQLPort,
		Database: cfg.MySQLDatabase,
		User:     cfg.MySQLUser,
		Password: cfg.MySQLPassword,
	}
}

func restoreMySQLBootstrapConfig(cfg *Config, v mysqlBootstrapConfig) {
	if cfg == nil {
		return
	}
	cfg.MySQLDSN = v.DSN
	cfg.MySQLHost = v.Host
	cfg.MySQLPort = v.Port
	cfg.MySQLDatabase = v.Database
	cfg.MySQLUser = v.User
	cfg.MySQLPassword = v.Password
}

func restoreMySQLBootstrapRuntime(rs *RuntimeSettings, v mysqlBootstrapConfig) {
	if rs == nil {
		return
	}
	rs.MySQLDSN = v.DSN
	rs.MySQLHost = v.Host
	rs.MySQLPort = v.Port
	rs.MySQLDatabase = v.Database
	rs.MySQLUser = v.User
	rs.MySQLPassword = v.Password
}

type PlatformKVMySQL = platformkv.MySQLStore

func newPlatformKVMySQL(db *sql.DB) (*PlatformKVMySQL, error) {
	return platformkv.NewMySQL(db)
}

var _ PlatformKV = (*PlatformKVMySQL)(nil)
