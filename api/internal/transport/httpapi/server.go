package httpapi

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	core "kube-bt-sync/internal"
)

// StartServer 负责 Dashboard HTTP 服务生命周期。
func StartServer(ctx context.Context, app *core.ServerApp) {
	cfg := app.Cfg()
	r := NewRouter(app)
	addr := strings.TrimSpace(cfg.DashboardListenAddr)
	if addr == "" {
		addr = ":8080"
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      5 * time.Minute,
	}

	log.Printf("kube-bt-sync Dashboard 已启动，监听 %s", addr)
	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
		shCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := srv.Shutdown(shCtx); err != nil {
			log.Printf("Dashboard: Shutdown: %v", err)
		} else {
			log.Println("Dashboard: HTTP 服务已优雅关闭")
		}
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("Web 服务异常退出: %v", err)
		}
	}
}
