package core

import "testing"

func TestShouldAttemptSetupRecoveryOnlyAfterBootstrapDepsConfigured(t *testing.T) {
	tests := []struct {
		name        string
		initialized bool
		cfg         Config
		want        bool
	}{
		{
			name: "uninitialized with mysql dsn and redis address",
			cfg: Config{
				MySQLDSN:  "easypanel:secret@tcp(mysql.easy.svc.cluster.local:3306)/easypanel",
				RedisAddr: "redis.easy.svc.cluster.local:6379",
			},
			want: true,
		},
		{
			name:        "already initialized",
			initialized: true,
			cfg: Config{
				MySQLDSN:  "easypanel:secret@tcp(mysql.easy.svc.cluster.local:3306)/easypanel",
				RedisAddr: "redis.easy.svc.cluster.local:6379",
			},
			want: false,
		},
		{
			name: "first run before mysql is configured",
			cfg: Config{
				RedisAddr: "redis.easy.svc.cluster.local:6379",
			},
			want: false,
		},
		{
			name: "first run before redis is configured",
			cfg: Config{
				MySQLDSN: "easypanel:secret@tcp(mysql.easy.svc.cluster.local:3306)/easypanel",
			},
			want: false,
		},
		{
			name: "split redis fields count as configured",
			cfg: Config{
				MySQLDSN:  "easypanel:secret@tcp(mysql.easy.svc.cluster.local:3306)/easypanel",
				RedisHost: "redis.easy.svc.cluster.local",
				RedisPort: 6379,
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldAttemptSetupRecovery(tt.initialized, tt.cfg); got != tt.want {
				t.Fatalf("shouldAttemptSetupRecovery() = %v, want %v", got, tt.want)
			}
		})
	}
}
