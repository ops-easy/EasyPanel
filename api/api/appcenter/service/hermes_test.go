package service

import "testing"

func TestHermesBuildDeploymentModeCommands(t *testing.T) {
	cases := []struct {
		mode       string
		containers int
		commands   map[string][]string
		dashboard  bool
	}{
		{
			mode:       "gateway",
			containers: 1,
			commands: map[string][]string{
				"hermes": {"gateway", "run"},
			},
		},
		{
			mode:       "dashboard",
			containers: 1,
			commands: map[string][]string{
				"hermes": {"dashboard", "--host", "0.0.0.0", "--no-open", "--insecure"},
			},
		},
		{
			mode:       "gateway-dashboard",
			containers: 1,
			dashboard:  true,
			commands: map[string][]string{
				"hermes": {"gateway", "run"},
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
				foundDashboard := false
				for _, env := range c.Env {
					if env.Name == "HERMES_DASHBOARD" && env.Value == "1" {
						foundDashboard = true
					}
				}
				if foundDashboard != tc.dashboard {
					t.Fatalf("container %q HERMES_DASHBOARD=%v, want %v", c.Name, foundDashboard, tc.dashboard)
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
