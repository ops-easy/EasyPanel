package controller

import (
	"github.com/ops-easy/EasyPanel/backend/api/harbor/service"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *appctx.ServerApp
}

func New(app *appctx.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) Status(c *gin.Context) {
	service.HandleHarborStatus(ctl.app)(c)
}

func (ctl *Controller) Statistics(c *gin.Context) {
	service.HandleHarborStatistics(ctl.app)(c)
}

func (ctl *Controller) Projects(c *gin.Context) {
	service.HandleHarborProjects(ctl.app)(c)
}

func (ctl *Controller) Repositories(c *gin.Context) {
	service.HandleHarborRepositories(ctl.app)(c)
}

func (ctl *Controller) IndexStatus(c *gin.Context) {
	service.HandleHarborIndexStatus(ctl.app)(c)
}

func (ctl *Controller) IndexSync(c *gin.Context) {
	service.HandleHarborIndexSync(ctl.app)(c)
}

func (ctl *Controller) IndexSearch(c *gin.Context) {
	service.HandleHarborIndexSearch(ctl.app)(c)
}

func (ctl *Controller) Artifacts(c *gin.Context) {
	service.HandleHarborArtifacts(ctl.app)(c)
}

func (ctl *Controller) ArtifactAddition(c *gin.Context) {
	service.HandleHarborArtifactAddition(ctl.app)(c)
}

func (ctl *Controller) DeleteArtifact(c *gin.Context) {
	service.HandleHarborDeleteArtifact(ctl.app)(c)
}
