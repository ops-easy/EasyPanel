package service

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

func pveNodeFromUPID(upid string) (string, error) {
	upid = strings.TrimSpace(upid)
	parts := strings.Split(upid, ":")
	if len(parts) < 3 || strings.ToUpper(parts[0]) != "UPID" || strings.TrimSpace(parts[1]) == "" {
		return "", errors.New("invalid PVE task UPID")
	}
	return parts[1], nil
}

func pveTaskStatusPath(upid string) (string, error) {
	node, err := pveNodeFromUPID(upid)
	if err != nil {
		return "", err
	}
	return "/nodes/" + url.PathEscape(node) + "/tasks/" + url.PathEscape(strings.TrimSpace(upid)) + "/status", nil
}

func handlePVETaskStatus(c *gin.Context, app *ServerApp) {
	client, target, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	path, err := pveTaskStatusPath(c.Param("upid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodGet, path, nil, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"target": target.ID, "task": json.RawMessage(data)})
}
