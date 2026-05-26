package core

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// ServerApp 进程内配置与依赖（支持 Reload 后热更新）。
type ServerApp struct {
	mu sync.RWMutex

	dataDir string

	cfg             Config
	k8s             *kubernetes.Clientset
	k8sREST         *rest.Config
	sshStore        SSHSettingsStore
	vc              *vCenterClient
	redis           *RedisLight
	redisDialErr    string // 已配置 Redis 地址但拨号失败时的原因（供 /api/config 展示）
	mysqlDB         *sql.DB
	mysqlConnectErr string // 最近一次 Reload 时 DSN 非空但 open 失败的原因（供 /api/auth/status 展示）
	platformKV      PlatformKV
	initialized     bool
	runtime         *RuntimeSettings
}

// DataDirFromEnv 仅数据目录可走环境变量（K8s 挂载 PVC 时常用 EASYPANEL_DATA_DIR=/data）。
func DataDirFromEnv() string {
	d := strings.TrimSpace(os.Getenv("EASYPANEL_DATA_DIR"))
	if d == "" {
		return "./data"
	}
	return d
}

// NewServerApp 从环境变量和 config.yaml 加载进程配置，并初始化共享依赖。
func NewServerApp(dataDir string) (*ServerApp, error) {
	if dataDir == "" {
		dataDir = "./data"
	}
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0700); err != nil {
		return nil, err
	}
	s := &ServerApp{dataDir: abs}
	if err := s.Reload(); err != nil {
		return nil, err
	}
	return s, nil
}

// wirePlatformKVRedisDualWrite：RuntimeDualWriteRedis 下本地快照为空时从 Redis 恢复，再镜像当前快照到 Redis。
func wirePlatformKVRedisDualWrite(ctx context.Context, kv PlatformKV, redis *RedisLight, cfg Config, persistKind string) {
	if redis == nil || !cfg.RuntimeDualWriteRedis {
		return
	}
	if len(kv.Snapshot()) == 0 {
		if m, err := LoadPlatformKVFromRedis(ctx, redis, cfg); err != nil {
			log.Printf("Redis 读取 platform_kv 备份: %v", err)
		} else if m != nil && len(m) > 0 {
			log.Printf("持久化: 从 Redis 恢复 platform_kv 到 %s", persistKind)
			for k, v := range m {
				if err := kv.Set(k, v); err != nil {
					log.Printf("警告: 恢复 platform_kv[%s] 失败: %v", k, err)
				}
			}
		}
	}
	if err := MirrorPlatformKVToRedis(ctx, redis, cfg, kv.Snapshot()); err != nil {
		log.Printf("警告: platform_kv 镜像到 Redis 失败: %v", err)
	}
}

// Reload 从环境变量和 config.yaml 重新加载进程配置。
func (s *ServerApp) Reload() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.mysqlDB != nil {
		_ = s.mysqlDB.Close()
		s.mysqlDB = nil
	}
	if s.redis != nil {
		_ = s.redis.Close()
		s.redis = nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cfg := LoadConfig()
	applyConfigFilePath(&cfg, setupConfigFilePath(s.dataDir), false)
	finalizeLoadedConfig(&cfg)

	var mysqlDB *sql.DB
	s.mysqlConnectErr = ""
	if dsn := strings.TrimSpace(cfg.MySQLDSN); dsn != "" {
		db, err := openMySQLPoolWithRetry(dsn)
		if err != nil {
			log.Printf("MySQL: %v", err)
			s.mysqlConnectErr = truncateErrMessage(err.Error(), 400)
		} else {
			mysqlDB = db
			// 逐张建表并迁移补列/索引；任一关键结构失败都直接返回，避免服务带着缺表状态启动。
			if err := mysqlEnsureSchema(db); err != nil {
				log.Printf("MySQL 表结构 (ensure): %v", err)
				_ = db.Close()
				return fmt.Errorf("MySQL 表结构初始化失败: %w", err)
			}
			if err := mysqlMigrateSchema(db); err != nil {
				log.Printf("MySQL 结构迁移失败: %v", err)
				_ = db.Close()
				return fmt.Errorf("MySQL 结构迁移失败: %w", err)
			}
			if err := ensureDefaultDocGuides(db); err != nil {
				log.Printf("MySQL 初始化页面指南失败: %v", err)
				_ = db.Close()
				return fmt.Errorf("MySQL 初始化页面指南失败: %w", err)
			}
			if created, err := ensureInitialDashboardAdminUser(db, cfg); err != nil {
				log.Printf("MySQL 初始化管理员失败: %v", err)
				_ = db.Close()
				return fmt.Errorf("MySQL 初始化管理员失败: %w", err)
			} else if created {
				log.Printf("MySQL: 已创建初始控制台管理员 %q，后续密码以 easypanel_dashboard_users 为准", strings.TrimSpace(cfg.DashboardUser))
				if strings.TrimSpace(cfg.DashboardPassword) == defaultDashboardPassword {
					log.Println(">>> 安全提示：已使用默认初始密码 admin 创建管理员；生产或公网暴露前请登录后立即修改密码")
				}
			}
			if err := migratePlatformKVFromFileIfMySQLEmpty(db, s.dataDir); err != nil {
				log.Printf("MySQL 导入 platform_kv: %v", err)
			}
		}
	}
	if mysqlDB != nil {
		if err := applyConfigOverrideFromMySQL(mysqlDB, &cfg); err != nil {
			log.Printf("MySQL 动态配置: %v", err)
		}
		finalizeLoadedConfig(&cfg)
	}

	applySSHStoreDefaults(&cfg, s.dataDir)
	cfg = PrepareDashboardAuth(cfg)
	rs := cfg.configFileRuntime
	if rs == nil {
		rs = RuntimeSettingsFromConfig(cfg)
	}

	k8s, k8sREST, err := InitK8sForApp(rs)
	if err != nil {
		log.Printf("K8s 初始化: %v", err)
		k8s, k8sREST = nil, nil
	}
	if k8s == nil {
		if cs, cfg2, err2 := TryK8sFromEnv(); err2 == nil {
			k8s, k8sREST = cs, cfg2
		} else {
			log.Printf("K8s: 未通过 KUBECONFIG / in-cluster 连接: %v", err2)
		}
	}

	sshStore, errSSH := OpenSSHSettingsStore(cfg)
	if errSSH != nil {
		log.Printf("警告: SSH 凭据存储初始化失败: %v", errSSH)
		sshStore = nil
	}

	vc := newVCenterClient(cfg)

	s.redisDialErr = ""
	if rdb, err := dialRedisLightWithRetry(cfg); err != nil {
		log.Printf("Redis 连接: %v", err)
		s.redisDialErr = truncateErrMessage(err.Error(), 400)
	} else if rdb != nil {
		s.redis = rdb
	}

	s.mysqlDB = mysqlDB
	s.platformKV = nil

	if mysqlDB != nil {
		if kv, err := newPlatformKVMySQL(mysqlDB); err != nil {
			log.Printf("MySQL platform_kv: %v", err)
		} else {
			s.platformKV = kv
			wirePlatformKVRedisDualWrite(ctx, kv, s.redis, cfg, "MySQL")
		}
	}
	if s.platformKV == nil {
		if kv, err := newPlatformKVFile(s.dataDir); err != nil {
			log.Printf("平台 KV 文件: %v", err)
		} else {
			s.platformKV = kv
			wirePlatformKVRedisDualWrite(ctx, kv, s.redis, cfg, "本地文件")
		}
	}

	if s.platformKV != nil && s.redis != nil {
		s.platformKV = wrapPlatformKVRedisHot(s.platformKV, s.redis, cfg)
	}

	s.cfg = cfg
	s.k8s = k8s
	s.k8sREST = k8sREST
	s.sshStore = sshStore
	s.vc = vc
	s.runtime = rs
	initialized := cfg.Validate() == nil && mysqlDB != nil
	if initialized && strings.TrimSpace(cfg.RedisAddr) != "" && s.redis == nil {
		initialized = false
	}
	s.initialized = initialized
	return nil
}

func (s *ServerApp) Cfg() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

func (s *ServerApp) K8s() *kubernetes.Clientset {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.k8s
}

func (s *ServerApp) K8sREST() *rest.Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.k8sREST
}

func (s *ServerApp) SSHStore() SSHSettingsStore {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sshStore
}

func (s *ServerApp) VCenter() *vCenterClient {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.vc
}

func (s *ServerApp) Initialized() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.initialized
}

func (s *ServerApp) DataDir() string {
	return s.dataDir
}

func (s *ServerApp) Runtime() *RuntimeSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.runtime
}

func (s *ServerApp) Redis() *RedisLight {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.redis
}

// RedisDialError 已配置 Redis 地址但当前进程未连上时返回最近一次拨号错误摘要；否则为空。
func (s *ServerApp) RedisDialError() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.redisDialErr
}

// MySQLDB 在配置了 MySQL 且连接成功时非 nil。
func (s *ServerApp) MySQLDB() *sql.DB {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mysqlDB
}

// MySQLConnectError 最近一次 Reload 时 DSN 非空但连接失败的原因摘要（供前端区分「未配置」与「连不上」）。
func (s *ServerApp) MySQLConnectError() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mysqlConnectErr
}

func (s *ServerApp) PlatformKV() PlatformKV {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.platformKV
}

func truncateErrMessage(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
