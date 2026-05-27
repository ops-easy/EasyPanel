package service

import (
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

func TestHermesBuildDeploymentModeCommands(t *testing.T) {
	cases := []struct {
		mode       string
		containers int
		commands   map[string][]string
		homes      map[string]string
		mounts     map[string]string
	}{
		{
			mode:       "gateway",
			containers: 1,
			commands: map[string][]string{
				"gateway": {"gateway", "run"},
			},
			homes:  map[string]string{"gateway": "/opt/data/gateway"},
			mounts: map[string]string{"gateway": "hermes-gateway-data"},
		},
		{
			mode:       "dashboard",
			containers: 1,
			commands: map[string][]string{
				"dashboard": {"dashboard", "--host", "0.0.0.0", "--no-open", "--insecure"},
			},
			homes:  map[string]string{"dashboard": "/opt/data/dashboard"},
			mounts: map[string]string{"dashboard": "hermes-dashboard-data"},
		},
		{
			mode:       "gateway-dashboard",
			containers: 2,
			commands: map[string][]string{
				"gateway":   {"gateway", "run"},
				"dashboard": {"dashboard", "--host", "0.0.0.0", "--no-open", "--insecure"},
			},
			homes: map[string]string{
				"gateway":   "/opt/data/gateway",
				"dashboard": "/opt/data/dashboard",
			},
			mounts: map[string]string{
				"gateway":   "hermes-gateway-data",
				"dashboard": "hermes-dashboard-data",
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.mode, func(t *testing.T) {
			dep, err := buildHermesDeployment(HermesK8sDeployOpts{
				Namespace:      "hermes",
				DeploymentName: "hermes-agent",
				Image:          "nousresearch/hermes-agent:latest",
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
					if env.Name == "HERMES_HOME" && env.Value == tc.homes[c.Name] {
						foundHome = true
					}
				}
				if !foundHome {
					t.Fatalf("container %q missing HERMES_HOME=%s", c.Name, tc.homes[c.Name])
				}
				if c.ImagePullPolicy != corev1.PullIfNotPresent {
					t.Fatalf("container %q imagePullPolicy=%s, want %s", c.Name, c.ImagePullPolicy, corev1.PullIfNotPresent)
				}
				foundRuntimeMount := false
				for _, mount := range c.VolumeMounts {
					if mount.Name == tc.mounts[c.Name] && mount.MountPath == tc.homes[c.Name] {
						foundRuntimeMount = true
					}
				}
				if !foundRuntimeMount {
					t.Fatalf("container %q missing isolated runtime mount %s at %s", c.Name, tc.mounts[c.Name], tc.homes[c.Name])
				}
				assertHermesQuantity(t, c.Resources.Requests, corev1.ResourceCPU, "250m")
				assertHermesQuantity(t, c.Resources.Requests, corev1.ResourceMemory, "512Mi")
				assertHermesQuantity(t, c.Resources.Limits, corev1.ResourceCPU, "1")
				assertHermesQuantity(t, c.Resources.Limits, corev1.ResourceMemory, "1Gi")
			}
			assertHermesVolume(t, dep.Spec.Template.Spec.Volumes, "hermes-home", "hermes-home", false)
			for _, volumeName := range tc.mounts {
				assertHermesVolume(t, dep.Spec.Template.Spec.Volumes, volumeName, "", true)
			}
		})
	}
}

func TestHermesDefaultImageUsesPublishedDockerHubRepository(t *testing.T) {
	if got := defaultHermesBootstrap().DefaultImage; got != "nousresearch/hermes-agent:latest" {
		t.Fatalf("default Hermes image=%q, want Docker Hub image", got)
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

func assertHermesQuantity(t *testing.T, got corev1.ResourceList, name corev1.ResourceName, want string) {
	t.Helper()
	q, ok := got[name]
	if !ok {
		t.Fatalf("missing resource %s in %#v", name, got)
	}
	w := resource.MustParse(want)
	if q.Cmp(w) != 0 {
		t.Fatalf("resource %s=%s, want %s", name, q.String(), w.String())
	}
}

func assertHermesVolume(t *testing.T, volumes []corev1.Volume, name, claimName string, wantEmptyDir bool) {
	t.Helper()
	for _, volume := range volumes {
		if volume.Name != name {
			continue
		}
		if wantEmptyDir {
			if volume.EmptyDir == nil {
				t.Fatalf("volume %q EmptyDir=nil, want emptyDir volume", name)
			}
			return
		}
		if volume.PersistentVolumeClaim == nil || volume.PersistentVolumeClaim.ClaimName != claimName {
			t.Fatalf("volume %q pvc=%+v, want claim %q", name, volume.PersistentVolumeClaim, claimName)
		}
		return
	}
	t.Fatalf("missing volume %q in %#v", name, volumes)
}
