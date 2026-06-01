package service

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func appCenterMutationConfirmed(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func appCenterMutationConfirmedValue(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return appCenterMutationConfirmed(v)
	case float64:
		return v == 1
	case int:
		return v == 1
	default:
		return false
	}
}

func requireAppCenterMutationConfirm(c *gin.Context, confirmed bool, label string) bool {
	if confirmed {
		return true
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": label + " requires explicit confirm=true"})
	return false
}
