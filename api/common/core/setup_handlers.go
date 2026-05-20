package core

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func handleSetupStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"initialized": app.Initialized(),
			"dataDir":     app.DataDir(),
			"version":     1,
			"configMode":  "config.yaml+mysql+env",
		})
	}
}

func handleSetupSave(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusMethodNotAllowed, gin.H{
			"error": "初始化向导已停用；请修改 api/config.yaml 或环境变量后重启后端",
		})
	}
}
