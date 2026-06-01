package core

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func opsMutationConfirmed(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func requireOpsMutationConfirm(c *gin.Context, confirmed bool, label string) bool {
	if confirmed {
		return true
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": label + " requires confirm=true"})
	return false
}
