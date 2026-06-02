package core

import (
	"context"
	"log"
	"strings"
	"time"
)

func shouldAttemptSetupRecovery(initialized bool, cfg Config) bool {
	if initialized {
		return false
	}
	tmp := cfg
	FinalizeConnectionStrings(&tmp)
	return strings.TrimSpace(tmp.MySQLDSN) != "" && RedisAddrConfigured(tmp)
}

// StartSetupRecoveryLoop retries a full Reload after boot-time MySQL/Redis
// outages. This keeps a node or storage restart window from leaving an
// already-configured instance stuck behind /setup until the Pod is restarted.
func StartSetupRecoveryLoop(ctx context.Context, app *ServerApp) {
	if app == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("setup-recovery: 已停止")
				return
			case <-ticker.C:
			}
			if !shouldAttemptSetupRecovery(app.Initialized(), app.Cfg()) {
				continue
			}
			if err := app.Reload(); err != nil {
				log.Printf("setup-recovery: Reload 失败: %v", err)
				continue
			}
			if app.Initialized() {
				log.Println("setup-recovery: MySQL/Redis 已恢复，初始化状态已重新确认")
				InvalidateRuntimeStatusCache(context.Background(), app)
				return
			}
		}
	}()
	log.Println("setup-recovery: 已启动初始化依赖恢复轮询")
}
