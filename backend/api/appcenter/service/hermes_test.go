package service

import (
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
)

func TestHermesBuildDeploymentModeCommands(t *testing.T) {
	cases := []struct {
		mode       string
		containers int
		commands   map[string][]string
	}{
		{
			mode:       "gateway",
			containers: 1,
			commands: map[string][]string{
				"gateway": {"gateway", "run"},
			},
		},
		{
			mode:       "dashboard",
			containers: 1,
			commands: map[string][]string{
				"dashboard": {"dashboard", "--host", "0.0.0.0", "--no-open"},
			},
		},
		{
			mode:       "gateway-dashboard",
			containers: 2,
			commands: map[string][]string{
				"gateway":   {"gateway", "run"},
				"dashboard": {"dashboard", "--host", "0.0.0.0", "--no-open"},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.mode, func(t *testing.T) {
			dep, err := buildHermesDeployment(HermesK8sDeployOpts{
				Namespace:      "hermes",
				DeploymentName: "hermes-agent",
				Image:          "ghcr.io/nousresearch/hermes-agent:latest",
				Mode:           tc.mode,
				PVCName:        "hermes-home",
				SecretName:     "hermes-secret",
				ConfigMapName:  "hermes-config",
			})
			if err != nil {
				t.Fatalf("buildHermesDeployment returned error: %v", err)
			}
			containers := dep.Spec.Template.Spec.Containers
			if len(containers) != tc.containers {
				t.Fatalf("container count=%d, want %d", len(containers), tc.containers)
			}
			for _, c := range containers {
				want, ok := tc.commands[c.Name]
				if !ok {
					t.Fatalf("unexpected container %q", c.Name)
				}
				if len(c.Args) != len(want) {
					t.Fatalf("container %q args=%v, want %v", c.Name, c.Args, want)
				}
				for i := range want {
					if c.Args[i] != want[i] {
						t.Fatalf("container %q args=%v, want %v", c.Name, c.Args, want)
					}
				}
				foundHome := false
				for _, env := range c.Env {
					if env.Name == "HERMES_HOME" && env.Value == "/opt/data" {
						foundHome = true
					}
				}
				if !foundHome {
					t.Fatalf("container %q missing HERMES_HOME=/opt/data", c.Name)
				}
				foundPVC := false
				for _, mount := range c.VolumeMounts {
					if mount.Name == "hermes-home" && mount.MountPath == "/opt/data" {
						foundPVC = true
					}
				}
				if !foundPVC {
					t.Fatalf("container %q missing shared /opt/data PVC mount", c.Name)
				}
			}
		})
	}
}

func TestHermesNormalizeMode(t *testing.T) {
	for _, mode := range []string{"gateway", "dashboard", "gateway-dashboard"} {
		got, err := normalizeHermesMode(mode)
		if err != nil || got != mode {
			t.Fatalf("normalizeHermesMode(%q)=(%q,%v), want (%q,nil)", mode, got, err, mode)
		}
	}
	if _, err := normalizeHermesMode("cli"); err == nil {
		t.Fatalf("normalizeHermesMode(cli) returned nil error, want error")
	}
}

func TestHermesMigrationCommand(t *testing.T) {
	dry := buildHermesMigrationCommand(hermesMigrationOptions{DryRun: true})
	wantDry := []string{"hermes", "claw", "migrate", "--dry-run"}
	if len(dry) != len(wantDry) {
		t.Fatalf("dry-run command=%v, want %v", dry, wantDry)
	}
	for i := range wantDry {
		if dry[i] != wantDry[i] {
			t.Fatalf("dry-run command=%v, want %v", dry, wantDry)
		}
	}

	run := buildHermesMigrationCommand(hermesMigrationOptions{Preset: "user-data", Overwrite: true})
	wantRun := []string{"hermes", "claw", "migrate", "--preset", "user-data", "--overwrite"}
	if len(run) != len(wantRun) {
		t.Fatalf("run command=%v, want %v", run, wantRun)
	}
	for i := range wantRun {
		if run[i] != wantRun[i] {
			t.Fatalf("run command=%v, want %v", run, wantRun)
		}
	}
}

func TestHermesFullTakeoverRoutesAreRegistered(t *testing.T) {
	router := gin.New()
	api := router.Group("/api")
	RegisterHermesRoutes(api, nil)

	want := []struct {
		method string
		path   string
	}{
		{"POST", "/api/app-center/hermes/instances/:id/probe"},
		{"POST", "/api/app-center/hermes/instances/:id/upgrade"},
		{"POST", "/api/app-center/hermes/instances/:id/rollback"},
		{"GET", "/api/app-center/hermes/instances/:id/logs"},
		{"GET", "/api/app-center/hermes/instances/:id/events"},
		{"PUT", "/api/app-center/hermes/instances/:id/exposure"},
	}
	for _, route := range want {
		found := false
		for _, got := range router.Routes() {
			if got.Method == route.method && got.Path == route.path {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing route %s %s", route.method, route.path)
		}
	}
}

func TestHermesExposureServiceTypes(t *testing.T) {
	nodePort := buildHermesService(HermesK8sDeployOpts{
		Namespace:      "hermes",
		DeploymentName: "hermes-agent",
		ServiceName:    "hermes-agent",
		Mode:           "gateway-dashboard",
		ExposeMode:     "nodePort",
		NodePort:       30042,
	})
	if nodePort.Spec.Type != corev1.ServiceTypeNodePort {
		t.Fatalf("service type=%s, want NodePort", nodePort.Spec.Type)
	}
	if len(nodePort.Spec.Ports) == 0 || nodePort.Spec.Ports[0].NodePort != 30042 {
		t.Fatalf("nodePort not applied: %+v", nodePort.Spec.Ports)
	}

	lb := buildHermesService(HermesK8sDeployOpts{Namespace: "hermes", DeploymentName: "hermes-agent", ServiceName: "hermes-agent", Mode: "dashboard", ExposeMode: "loadBalancer"})
	if lb.Spec.Type != corev1.ServiceTypeLoadBalancer {
		t.Fatalf("service type=%s, want LoadBalancer", lb.Spec.Type)
	}
}

func TestHermesProbeCommandsUseRuntimeHTTP(t *testing.T) {
	gateway := buildHermesProbeCommand("gateway")
	if len(gateway) != 3 || gateway[2] == "" || !containsAll(gateway[2], "/v1/models", "API_SERVER_KEY") {
		t.Fatalf("gateway probe command=%v", gateway)
	}
	dashboard := buildHermesProbeCommand("dashboard")
	if len(dashboard) != 3 || !containsAll(dashboard[2], "127.0.0.1:9119") {
		t.Fatalf("dashboard probe command=%v", dashboard)
	}
}

func TestHermesBuildIngress(t *testing.T) {
	ing := buildHermesIngress(HermesInstance{
		Namespace:      "hermes",
		DeploymentName: "hermes-agent",
		ServiceName:    "hermes-agent",
		Mode:           "gateway-dashboard",
		IngressHost:    "hermes.example.com",
	})
	if ing.Spec.Rules[0].Host != "hermes.example.com" {
		t.Fatalf("ingress host=%q", ing.Spec.Rules[0].Host)
	}
	gotSvc := ing.Spec.Rules[0].HTTP.Paths[0].Backend.Service
	if gotSvc == nil || gotSvc.Name != "hermes-agent" || gotSvc.Port.Name != "dashboard" {
		t.Fatalf("unexpected ingress backend: %+v", gotSvc)
	}
}

func containsAll(s string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(s, part) {
			return false
		}
	}
	return true
}
