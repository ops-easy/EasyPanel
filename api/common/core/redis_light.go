package core

import (
	redislight "github.com/ops-easy/EasyPanel/api/pkg/redis"
)

type RedisLight = redislight.Client

func dialRedisLight(cfg Config) (*RedisLight, error) {
	return redislight.Dial(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
}
