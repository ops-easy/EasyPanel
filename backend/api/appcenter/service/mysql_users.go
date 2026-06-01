package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

type appMySQLUserWriteBody struct {
	Username string `json:"username"`
	Host     string `json:"host"`
	Password string `json:"password"`
	Schema   string `json:"schema"`
	Role     string `json:"role"`
	Confirm  bool   `json:"confirm,omitempty"`
}

func appMySQLSQLString(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

func appMySQLSQLIdent(s string) string {
	return "`" + strings.ReplaceAll(s, "`", "``") + "`"
}

func appMySQLValidateAccountUser(user string) error {
	u := strings.TrimSpace(user)
	if u == "" {
		return errors.New("username is required")
	}
	if len(u) > 80 {
		return errors.New("username is too long")
	}
	if strings.ContainsAny(u, "\x00\r\n") {
		return errors.New("username contains unsupported characters")
	}
	return nil
}

func appMySQLValidateAccountHost(host string) error {
	h := strings.TrimSpace(host)
	if h == "" {
		return errors.New("host is required")
	}
	if len(h) > 255 {
		return errors.New("host is too long")
	}
	if strings.ContainsAny(h, "\x00\r\n") {
		return errors.New("host contains unsupported characters")
	}
	return nil
}

func appMySQLUserPrincipal(user, host string) string {
	return appMySQLSQLString(strings.TrimSpace(user)) + "@" + appMySQLSQLString(strings.TrimSpace(host))
}

func appMySQLListUsers(ctx context.Context, db *sql.DB) ([]map[string]interface{}, error) {
	query := `SELECT user, host, COALESCE(plugin,''), COALESCE(account_locked,'N') FROM mysql.user ORDER BY user, host`
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		rows, err = db.QueryContext(ctx, `SELECT user, host, COALESCE(plugin,''), 'N' FROM mysql.user ORDER BY user, host`)
		if err != nil {
			return nil, err
		}
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var user, host, plugin, locked string
		if err := rows.Scan(&user, &host, &plugin, &locked); err != nil {
			return nil, err
		}
		out = append(out, map[string]interface{}{
			"username":      user,
			"host":          host,
			"plugin":        plugin,
			"accountLocked": strings.EqualFold(locked, "Y"),
		})
	}
	return out, rows.Err()
}

func appMySQLCreateUser(ctx context.Context, db *sql.DB, body appMySQLUserWriteBody) error {
	user := strings.TrimSpace(body.Username)
	host := strings.TrimSpace(body.Host)
	if host == "" {
		host = "%"
	}
	if err := appMySQLValidateAccountUser(user); err != nil {
		return err
	}
	if err := appMySQLValidateAccountHost(host); err != nil {
		return err
	}
	if strings.TrimSpace(body.Password) == "" {
		return errors.New("password is required")
	}
	principal := appMySQLUserPrincipal(user, host)
	if _, err := db.ExecContext(ctx, "CREATE USER "+principal+" IDENTIFIED BY "+appMySQLSQLString(body.Password)); err != nil {
		return err
	}
	schema := strings.TrimSpace(body.Schema)
	if schema == "" {
		return nil
	}
	if err := appMySQLValidateBusinessSchema(schema); err != nil {
		return err
	}
	role := strings.TrimSpace(strings.ToLower(body.Role))
	privs := "SELECT"
	if role == "write" || role == "readwrite" || role == "rw" {
		privs = "SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, CREATE TEMPORARY TABLES"
	}
	if _, err := db.ExecContext(ctx, fmt.Sprintf("GRANT %s ON %s.* TO %s", privs, appMySQLSQLIdent(schema), principal)); err != nil {
		return err
	}
	return nil
}

func appMySQLChangeUserPassword(ctx context.Context, db *sql.DB, user, host, password string) error {
	user = strings.TrimSpace(user)
	host = strings.TrimSpace(host)
	if host == "" {
		host = "%"
	}
	if err := appMySQLValidateAccountUser(user); err != nil {
		return err
	}
	if err := appMySQLValidateAccountHost(host); err != nil {
		return err
	}
	if strings.TrimSpace(password) == "" {
		return errors.New("password is required")
	}
	_, err := db.ExecContext(ctx, "ALTER USER "+appMySQLUserPrincipal(user, host)+" IDENTIFIED BY "+appMySQLSQLString(password))
	return err
}

func appMySQLDropUser(ctx context.Context, db *sql.DB, user, host string) error {
	user = strings.TrimSpace(user)
	host = strings.TrimSpace(host)
	if host == "" {
		host = "%"
	}
	if err := appMySQLValidateAccountUser(user); err != nil {
		return err
	}
	if err := appMySQLValidateAccountHost(host); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, "DROP USER "+appMySQLUserPrincipal(user, host))
	return err
}
