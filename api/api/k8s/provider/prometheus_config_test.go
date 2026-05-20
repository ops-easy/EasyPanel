package provider

import "testing"

func TestValidateConfigYAML(t *testing.T) {
	if err := ValidateConfigYAML(`
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: kubebt
`); err != nil {
		t.Fatalf("expected valid YAML: %v", err)
	}
}

func TestValidateConfigYAMLReportsSyntaxError(t *testing.T) {
	if err := ValidateConfigYAML("global: ["); err == nil {
		t.Fatal("expected syntax error")
	}
}
