package harbor

import (
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *core.ServerApp) {
	api.GET("/harbor/status", func(c *gin.Context) { core.HandleHarborStatus(app)(c) })
	api.GET("/harbor/statistics", func(c *gin.Context) { core.HandleHarborStatistics(app)(c) })
	api.GET("/harbor/projects", func(c *gin.Context) { core.HandleHarborProjects(app)(c) })
	api.GET("/harbor/projects/:project/repositories", func(c *gin.Context) { core.HandleHarborRepositories(app)(c) })
	api.GET("/harbor/index/status", func(c *gin.Context) { core.HandleHarborIndexStatus(app)(c) })
	api.POST("/harbor/index/sync", core.AdminOnlyMiddleware(app), func(c *gin.Context) { core.HandleHarborIndexSync(app)(c) })
	api.GET("/harbor/index/search", func(c *gin.Context) { core.HandleHarborIndexSearch(app)(c) })
	api.GET("/harbor/projects/:project/artifacts", func(c *gin.Context) { core.HandleHarborArtifacts(app)(c) })
	api.GET("/harbor/projects/:project/artifact-additions", func(c *gin.Context) { core.HandleHarborArtifactAddition(app)(c) })
	api.DELETE("/harbor/projects/:project/artifacts", core.AdminOnlyMiddleware(app), func(c *gin.Context) { core.HandleHarborDeleteArtifact(app)(c) })
}
