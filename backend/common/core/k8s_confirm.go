package core

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func k8sConfirmed(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func requireK8sMutationConfirm(c *gin.Context, confirmed bool, label string) bool {
	if confirmed {
		return true
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": label + " 需要显式 confirm=true"})
	return false
}

func k8sMutationConfirmedValue(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return k8sConfirmed(v)
	case float64:
		return v == 1
	case int:
		return v == 1
	default:
		return false
	}
}

func k8sMutationConfirmMiddleware(label string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if k8sConfirmed(c.Query("confirm")) {
			c.Next()
			return
		}

		confirmed := false
		if c.Request.Body != nil {
			raw, err := io.ReadAll(c.Request.Body)
			if err == nil {
				c.Request.Body = io.NopCloser(bytes.NewReader(raw))
				if len(bytes.TrimSpace(raw)) > 0 {
					var body map[string]interface{}
					if json.Unmarshal(raw, &body) == nil {
						confirmed = k8sMutationConfirmedValue(body["confirm"])
					}
				}
			}
		}
		if confirmed {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": label + " 需要显式 confirm=true"})
	}
}
