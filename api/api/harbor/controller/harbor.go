package controller

import (
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *core.ServerApp
}

func New(app *core.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) Status(c *gin.Context) {
	core.HandleHarborStatus(ctl.app)(c)
}

func (ctl *Controller) Statistics(c *gin.Context) {
	core.HandleHarborStatistics(ctl.app)(c)
}

func (ctl *Controller) Projects(c *gin.Context) {
	core.HandleHarborProjects(ctl.app)(c)
}

func (ctl *Controller) Repositories(c *gin.Context) {
	core.HandleHarborRepositories(ctl.app)(c)
}

func (ctl *Controller) IndexStatus(c *gin.Context) {
	core.HandleHarborIndexStatus(ctl.app)(c)
}

func (ctl *Controller) IndexSync(c *gin.Context) {
	core.HandleHarborIndexSync(ctl.app)(c)
}

func (ctl *Controller) IndexSearch(c *gin.Context) {
	core.HandleHarborIndexSearch(ctl.app)(c)
}

func (ctl *Controller) Artifacts(c *gin.Context) {
	core.HandleHarborArtifacts(ctl.app)(c)
}

func (ctl *Controller) ArtifactAddition(c *gin.Context) {
	core.HandleHarborArtifactAddition(ctl.app)(c)
}

func (ctl *Controller) DeleteArtifact(c *gin.Context) {
	core.HandleHarborDeleteArtifact(ctl.app)(c)
}
