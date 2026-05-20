package core

import (
	redislight "kube-bt-sync/pkg/redis"
)

type RedisLight = redislight.Client

func dialRedisLight(cfg Config) (*RedisLight, error) {
	return redislight.Dial(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
}
