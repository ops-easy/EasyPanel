package internal

import (
	redislight "kube-bt-sync/internal/storage/redislight"
)

type RedisLight = redislight.Client

func dialRedisLight(cfg Config) (*RedisLight, error) {
	return redislight.Dial(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
}
