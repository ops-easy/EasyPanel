package core

import (
	"strings"
	"testing"
)

func TestVictoriaLogsValuesAndURL(t *testing.T) {
	values := buildVictoriaLogsSingleValuesYAML(VictoriaLogsInstallOpts{
		RetentionDays:    30,
		StorageClassName: "fast-ssd",
		StorageSize:      "50Gi",
	})
	for _, want := range []string{
		"retentionPeriod: 30d",
		`size: "50Gi"`,
		`storageClassName: "fast-ssd"`,
	} {
		if !strings.Contains(values, want) {
			t.Fatalf("values YAML missing %q:\n%s", want, values)
		}
	}
	if got := victoriaLogsServerServiceName("eplogs"); got != "eplogs-victoria-logs-single-server" {
		t.Fatalf("service name = %q", got)
	}
	if got := victoriaLogsInternalURL("logs", "eplogs-victoria-logs-single-server", 9428); got != "http://eplogs-victoria-logs-single-server.logs.svc:9428" {
		t.Fatalf("internal URL = %q", got)
	}
}

func TestVictoriaLogsCollectorValues(t *testing.T) {
	values := buildVictoriaLogsCollectorValuesYAML("http://eplogs-victoria-logs-single-server:9428")
	if !strings.Contains(values, `url: "http://eplogs-victoria-logs-single-server:9428"`) {
		t.Fatalf("collector values missing remoteWrite URL:\n%s", values)
	}
}
