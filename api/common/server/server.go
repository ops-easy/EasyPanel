package server

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"kube-bt-sync/common/appctx"
	apirouter "kube-bt-sync/router"

	"github.com/gin-gonic/gin"
)

func Start(ctx context.Context, app *appctx.ServerApp) {
	r := gin.New()
	apirouter.RegisterRoutes(r, app)
	addr := strings.TrimSpace(app.Cfg().DashboardListenAddr)
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

	log.Printf("kube-bt-sync Dashboard started on %s", addr)
	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
		shCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := srv.Shutdown(shCtx); err != nil {
			log.Printf("Dashboard: shutdown: %v", err)
		} else {
			log.Println("Dashboard: HTTP server stopped")
		}
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("Dashboard server exited: %v", err)
		}
	}
}
