package provider

import (
	"strings"

	"gopkg.in/yaml.v3"
)

func ValidateConfigYAML(raw string) error {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil
	}
	var v interface{}
	return yaml.Unmarshal([]byte(s), &v)
}
