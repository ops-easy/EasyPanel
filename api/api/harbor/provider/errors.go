package provider

import (
	"encoding/json"
	"net/http"
	"strings"
)

// APIErrorItem is a Harbor v2 error item: {"errors":[{"code":"UNAUTHORIZED","message":"unauthorized"}]}.
type APIErrorItem struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func ParseUpstreamErrors(b []byte) []APIErrorItem {
	var w struct {
		Errors []APIErrorItem `json:"errors"`
	}
	if json.Unmarshal(b, &w) != nil || len(w.Errors) == 0 {
		return nil
	}
	return w.Errors
}

func FormatAuthFailure(code int, b []byte) (human string, items []APIErrorItem) {
	items = ParseUpstreamErrors(b)
	if len(items) > 0 {
		var sb strings.Builder
		for i, e := range items {
			if i > 0 {
				sb.WriteString("；")
			}
			c := strings.TrimSpace(e.Code)
			m := strings.TrimSpace(e.Message)
			switch {
			case c != "" && m != "":
				sb.WriteString(c)
				sb.WriteString("：")
				sb.WriteString(m)
			case m != "":
				sb.WriteString(m)
			default:
				sb.WriteString(c)
			}
		}
		human = sb.String()
	} else {
		human = strings.TrimSpace(string(b))
		if len(human) > 600 {
			human = human[:600] + "..."
		}
	}
	if human == "" {
		if code == http.StatusUnauthorized {
			human = "401 未授权"
		} else {
			human = "403 禁止访问"
		}
	}
	return human, items
}
