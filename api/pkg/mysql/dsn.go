package mysql

import (
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
)

func ComposeDSN(host string, port int, user, password, database string) string {
	host = strings.TrimSpace(host)
	user = strings.TrimSpace(user)
	database = strings.TrimSpace(database)
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	var userinfo string
	if password != "" {
		userinfo = url.UserPassword(user, password).String()
	} else {
		userinfo = user
	}
	return fmt.Sprintf("%s@tcp(%s)/%s?parseTime=true&charset=utf8mb4", userinfo, addr, database)
}
