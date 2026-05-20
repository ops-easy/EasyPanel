package core

import (
	"net"
	"strconv"
	"strings"

	mysqlconn "kube-bt-sync/pkg/mysql"
)

// ComposeMySQLDSN 由主机、端口、库、用户、密码生成 go-sql-driver 兼容 DSN。
func ComposeMySQLDSN(host string, port int, user, password, database string) string {
	return mysqlconn.ComposeDSN(host, port, user, password, database)
}

// FinalizeConnectionStrings 若填写了分字段 MySQL/Redis，则写入 MySQLDSN、RedisAddr。
func FinalizeConnectionStrings(c *Config) {
	if strings.TrimSpace(c.MySQLDSN) == "" &&
		strings.TrimSpace(c.MySQLHost) != "" && c.MySQLPort > 0 &&
		strings.TrimSpace(c.MySQLDatabase) != "" && strings.TrimSpace(c.MySQLUser) != "" {
		c.MySQLDSN = ComposeMySQLDSN(c.MySQLHost, c.MySQLPort, c.MySQLUser, c.MySQLPassword, c.MySQLDatabase)
	}
	if strings.TrimSpace(c.RedisAddr) == "" && strings.TrimSpace(c.RedisHost) != "" && c.RedisPort > 0 {
		c.RedisAddr = net.JoinHostPort(strings.TrimSpace(c.RedisHost), strconv.Itoa(c.RedisPort))
	}
}
