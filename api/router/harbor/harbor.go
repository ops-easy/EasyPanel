package harbor

import (
	"github.com/ops-easy/EasyPanel/api/api/harbor/controller"
	"github.com/ops-easy/EasyPanel/api/common/appctx"
	"github.com/ops-easy/EasyPanel/api/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	ctl := controller.New(app)
	api.GET("/harbor/status", ctl.Status)
	api.GET("/harbor/statistics", ctl.Statistics)
	api.GET("/harbor/projects", ctl.Projects)
	api.GET("/harbor/projects/:project/repositories", ctl.Repositories)
	api.GET("/harbor/index/status", ctl.IndexStatus)
	api.POST("/harbor/index/sync", middleware.AdminOnly(app), ctl.IndexSync)
	api.GET("/harbor/index/search", ctl.IndexSearch)
	api.GET("/harbor/projects/:project/artifacts", ctl.Artifacts)
	api.GET("/harbor/projects/:project/artifact-additions", ctl.ArtifactAddition)
	api.DELETE("/harbor/projects/:project/artifacts", middleware.AdminOnly(app), ctl.DeleteArtifact)
}
