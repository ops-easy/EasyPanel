package service

import (
	"reflect"
	"testing"
)

func TestAppRedisCLIModeAllowsExternalInstances(t *testing.T) {
	for _, tc := range []struct {
		name string
		st   *appRedisStoredConfig
	}{
		{
			name: "standalone",
			st: &appRedisStoredConfig{
				Mode: AppRedisStandalone,
				Addr: "redis.example.internal:6379",
			},
		},
		{
			name: "replication",
			st: &appRedisStoredConfig{
				Mode:       AppRedisReplication,
				MasterAddr: "redis-master.example.internal:6379",
			},
		},
		{
			name: "sentinel",
			st: &appRedisStoredConfig{
				Mode:          AppRedisSentinel,
				MasterName:    "mymaster",
				SentinelAddrs: []string{"sentinel-a.example.internal:26379"},
			},
		},
		{
			name: "cluster",
			st: &appRedisStoredConfig{
				Mode:         AppRedisCluster,
				ClusterAddrs: []string{"redis-cluster-a.example.internal:6379"},
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := appRedisResolveCLIMode(tc.st); got != appRedisCLIModeDirect {
				t.Fatalf("appRedisResolveCLIMode()=%q, want %q", got, appRedisCLIModeDirect)
			}
		})
	}
}

func TestParseRedisCLIArgsKeepsQuotedValues(t *testing.T) {
	got, err := parseRedisCLIArgs(`set greeting 'hello world'`)
	if err != nil {
		t.Fatalf("parseRedisCLIArgs returned error: %v", err)
	}
	want := []string{"set", "greeting", "hello world"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseRedisCLIArgs()=%#v, want %#v", got, want)
	}
}
