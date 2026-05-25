package service

import (
	"context"
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
)

type AppMySQLMode string

const (
	AppMySQLExternal AppMySQLMode = "external"
	AppMySQLK8s      AppMySQLMode = "k8s"
)

type appMySQLStoredConfig struct {
	Mode          AppMySQLMode `json:"mode"`
	Host          string       `json:"host,omitempty"`
	Port          int          `json:"port,omitempty"`
	Username      string       `json:"username,omitempty"`
	PasswordEnc   string       `json:"passwordEnc,omitempty"`
	DefaultSchema string       `json:"defaultSchema,omitempty"`
	TLSMode       string       `json:"tlsMode,omitempty"`
	TLSCAEnc      string       `json:"tlsCaEnc,omitempty"`

	K8sNamespace             string `json:"k8sNamespace,omitempty"`
	K8sBaseName              string `json:"k8sBaseName,omitempty"`
	K8sServiceType           string `json:"k8sServiceType,omitempty"`
	K8sSvcPort               int32  `json:"k8sSvcPort,omitempty"`
	K8sVersionLine           string `json:"k8sVersionLine,omitempty"`
	K8sMySQLImageResolved    string `json:"k8sMysqlImageResolved,omitempty"`
	K8sExporterEnabled       bool   `json:"k8sExporterEnabled,omitempty"`
	K8sExporterImageResolved string `json:"k8sExporterImageResolved,omitempty"`
	K8sPersistenceEnabled    bool   `json:"k8sPersistenceEnabled,omitempty"`
	K8sStorageSize           string `json:"k8sStorageSize,omitempty"`
	K8sStorageClass          string `json:"k8sStorageClass,omitempty"`
	K8sTemplateID            int64  `json:"k8sTemplateId,omitempty"`
	K8sTemplateName          string `json:"k8sTemplateName,omitempty"`
}

type appMySQLRow struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Mode       string `json:"mode"`
	ConfigJSON string `json:"-"`
	CreatedAt  string `json:"createdAt,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
	CreatedBy  string `json:"createdBy,omitempty"`
}

func appMySQLListFromMySQL(ctx context.Context, db *sql.DB) ([]appMySQLRow, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, mode, config_json, created_at, updated_at, created_by FROM kubebt_app_mysql_instances ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appMySQLRow
	for rows.Next() {
		var r appMySQLRow
		var created, updated sql.NullTime
		if err := rows.Scan(&r.ID, &r.Name, &r.Mode, &r.ConfigJSON, &created, &updated, &r.CreatedBy); err != nil {
			return nil, err
		}
		if created.Valid {
			r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
		}
		if updated.Valid {
			r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func appMySQLGetByID(ctx context.Context, db *sql.DB, id int64) (*appMySQLRow, error) {
	var r appMySQLRow
	var created, updated sql.NullTime
	err := db.QueryRowContext(ctx,
		`SELECT id, name, mode, config_json, created_at, updated_at, created_by FROM kubebt_app_mysql_instances WHERE id=?`,
		id,
	).Scan(&r.ID, &r.Name, &r.Mode, &r.ConfigJSON, &created, &updated, &r.CreatedBy)
	if err != nil {
		return nil, err
	}
	if created.Valid {
		r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
	}
	if updated.Valid {
		r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
	}
	return &r, nil
}

func appMySQLInsert(ctx context.Context, db *sql.DB, name, mode, configJSON, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_app_mysql_instances (name, mode, config_json, created_by) VALUES (?,?,?,?)`,
		name, mode, configJSON, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func appMySQLUpdate(ctx context.Context, db *sql.DB, id int64, name, mode, configJSON string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_app_mysql_instances SET name=?, mode=?, config_json=? WHERE id=?`,
		name, mode, configJSON, id)
	return err
}

func appMySQLDelete(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, `DELETE FROM kubebt_app_mysql_instances WHERE id=?`, id)
	return err
}

func parseAppMySQLStoredConfig(cfg appMySQLStoredConfig) (*appMySQLStoredConfig, error) {
	switch cfg.Mode {
	case AppMySQLExternal:
		if strings.TrimSpace(cfg.Host) == "" {
			return nil, errors.New("外部 MySQL 实例需要 host")
		}
		if strings.TrimSpace(cfg.Username) == "" {
			return nil, errors.New("外部 MySQL 实例需要 username")
		}
		if cfg.Port <= 0 {
			cfg.Port = 3306
		}
	case AppMySQLK8s:
		if strings.TrimSpace(cfg.K8sNamespace) == "" || strings.TrimSpace(cfg.K8sBaseName) == "" {
			return nil, errors.New("K8s MySQL 实例需要 namespace 和 baseName")
		}
		if cfg.K8sSvcPort <= 0 {
			cfg.K8sSvcPort = 3306
		}
	default:
		return nil, errors.New("mode 必须为 external 或 k8s")
	}
	if cfg.Port < 0 || cfg.Port > 65535 {
		return nil, errors.New("port 非法")
	}
	return &cfg, nil
}

func buildAppMySQLStoredConfigFromRequest(cfg Config, body map[string]interface{}) (*appMySQLStoredConfig, error) {
	mode := AppMySQLMode(strings.TrimSpace(strings.ToLower(stringFromBody(body, "mode"))))
	if mode == "" {
		mode = AppMySQLExternal
	}
	st := &appMySQLStoredConfig{
		Mode:          mode,
		Host:          strings.TrimSpace(stringFromBody(body, "host")),
		Username:      strings.TrimSpace(stringFromBody(body, "username")),
		DefaultSchema: strings.TrimSpace(stringFromBody(body, "defaultSchema")),
		TLSMode:       strings.TrimSpace(strings.ToLower(stringFromBody(body, "tlsMode"))),

		K8sNamespace:   firstNonEmpty(stringFromBody(body, "k8sNamespace"), stringFromBody(body, "namespace")),
		K8sBaseName:    firstNonEmpty(stringFromBody(body, "k8sBaseName"), stringFromBody(body, "baseName")),
		K8sServiceType: stringFromBody(body, "k8sServiceType"),
		K8sStorageSize: stringFromBody(body, "k8sStorageSize"),
		K8sStorageClass: firstNonEmpty(
			stringFromBody(body, "k8sStorageClass"),
			stringFromBody(body, "storageClassName"),
		),
	}
	if port := intFromBody(body, "port"); port > 0 {
		st.Port = port
	}
	if st.Port <= 0 {
		st.Port = 3306
	}
	if mode == AppMySQLK8s {
		if st.K8sSvcPort <= 0 {
			st.K8sSvcPort = int32(intFromBody(body, "k8sSvcPort"))
		}
		if st.K8sSvcPort <= 0 {
			st.K8sSvcPort = int32(intFromBody(body, "svcPort"))
		}
		if st.K8sSvcPort <= 0 {
			st.K8sSvcPort = 3306
		}
		if strings.TrimSpace(st.Host) == "" && strings.TrimSpace(st.K8sBaseName) != "" && strings.TrimSpace(st.K8sNamespace) != "" {
			st.Host = fmt.Sprintf("%s.%s.svc.cluster.local", st.K8sBaseName, st.K8sNamespace)
		}
		if strings.TrimSpace(st.Username) == "" {
			st.Username = "root"
		}
		st.Port = int(st.K8sSvcPort)
	}

	key, keyErr := sshEncryptionKey(cfg)
	if pass := strings.TrimSpace(stringFromBody(body, "password")); pass != "" {
		if keyErr != nil {
			return nil, keyErr
		}
		enc, err := encryptSecret(key, pass)
		if err != nil {
			return nil, err
		}
		st.PasswordEnc = enc
	}
	if ca := strings.TrimSpace(stringFromBody(body, "tlsCa")); ca != "" {
		if keyErr != nil {
			return nil, keyErr
		}
		enc, err := encryptSecret(key, ca)
		if err != nil {
			return nil, err
		}
		st.TLSCAEnc = enc
	}
	return parseAppMySQLStoredConfig(*st)
}

func mergeAppMySQLStoredConfigOnUpdate(cfg Config, prev *appMySQLStoredConfig, body map[string]interface{}) (*appMySQLStoredConfig, error) {
	next, err := buildAppMySQLStoredConfigFromRequest(cfg, body)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(next.PasswordEnc) == "" && prev != nil {
		next.PasswordEnc = prev.PasswordEnc
	}
	if strings.TrimSpace(next.TLSCAEnc) == "" && prev != nil {
		next.TLSCAEnc = prev.TLSCAEnc
	}
	if next.Mode == AppMySQLK8s && prev != nil {
		next.K8sNamespace = firstNonEmpty(next.K8sNamespace, prev.K8sNamespace)
		next.K8sBaseName = firstNonEmpty(next.K8sBaseName, prev.K8sBaseName)
		next.K8sServiceType = firstNonEmpty(next.K8sServiceType, prev.K8sServiceType)
		if next.K8sSvcPort <= 0 {
			next.K8sSvcPort = prev.K8sSvcPort
		}
		next.K8sVersionLine = firstNonEmpty(next.K8sVersionLine, prev.K8sVersionLine)
		next.K8sMySQLImageResolved = firstNonEmpty(next.K8sMySQLImageResolved, prev.K8sMySQLImageResolved)
		next.K8sExporterEnabled = prev.K8sExporterEnabled
		next.K8sExporterImageResolved = firstNonEmpty(next.K8sExporterImageResolved, prev.K8sExporterImageResolved)
		next.K8sPersistenceEnabled = prev.K8sPersistenceEnabled
		next.K8sStorageSize = firstNonEmpty(next.K8sStorageSize, prev.K8sStorageSize)
		next.K8sStorageClass = firstNonEmpty(next.K8sStorageClass, prev.K8sStorageClass)
		next.K8sTemplateID = prev.K8sTemplateID
		next.K8sTemplateName = firstNonEmpty(next.K8sTemplateName, prev.K8sTemplateName)
	}
	return parseAppMySQLStoredConfig(*next)
}

func BuildK8sMySQLStoredConfig(cfg Config, opts AppMySQLK8sDeployOpts) (*appMySQLStoredConfig, error) {
	key, err := sshEncryptionKey(cfg)
	if err != nil {
		return nil, err
	}
	enc, err := encryptSecret(key, strings.TrimSpace(opts.RootPassword))
	if err != nil {
		return nil, err
	}
	svcPort := opts.SvcPort
	if svcPort <= 0 {
		svcPort = 3306
	}
	host := fmt.Sprintf("%s.%s.svc.cluster.local", strings.TrimSpace(opts.BaseName), strings.TrimSpace(opts.Namespace))
	st := &appMySQLStoredConfig{
		Mode:                     AppMySQLK8s,
		Host:                     host,
		Port:                     int(svcPort),
		Username:                 "root",
		PasswordEnc:              enc,
		DefaultSchema:            strings.TrimSpace(opts.Database),
		K8sNamespace:             strings.TrimSpace(opts.Namespace),
		K8sBaseName:              strings.TrimSpace(opts.BaseName),
		K8sServiceType:           strings.TrimSpace(opts.ServiceType),
		K8sSvcPort:               svcPort,
		K8sVersionLine:           firstNonEmpty(opts.Version, "8.0"),
		K8sMySQLImageResolved:    ResolveAppMySQLServerImage(cfg, opts.Version, opts.MySQLImage),
		K8sExporterEnabled:       opts.EnableExporter,
		K8sExporterImageResolved: ResolveAppMySQLExporterImage(cfg, opts.ExporterImage),
		K8sPersistenceEnabled:    opts.PersistenceEnabled,
		K8sStorageSize:           strings.TrimSpace(opts.StorageSize),
		K8sStorageClass:          strings.TrimSpace(opts.StorageClassName),
		K8sTemplateID:            opts.TemplateID,
		K8sTemplateName:          strings.TrimSpace(opts.TemplateName),
	}
	return parseAppMySQLStoredConfig(*st)
}

func decryptAppMySQLPassword(cfg Config, enc string) (string, error) {
	if strings.TrimSpace(enc) == "" {
		return "", nil
	}
	key, err := sshEncryptionKey(cfg)
	if err != nil {
		return "", err
	}
	return decryptSecret(key, enc)
}

func decryptAppMySQLTLSCA(cfg Config, enc string) (string, error) {
	if strings.TrimSpace(enc) == "" {
		return "", nil
	}
	key, err := sshEncryptionKey(cfg)
	if err != nil {
		return "", err
	}
	return decryptSecret(key, enc)
}

func appMySQLDriverTLSParam(cfg Config, st *appMySQLStoredConfig) (string, error) {
	mode := strings.TrimSpace(strings.ToLower(st.TLSMode))
	switch mode {
	case "", "disabled", "false", "off":
		return "", nil
	case "skip-verify", "insecure":
		return "skip-verify", nil
	case "required", "true", "preferred":
		caPEM, err := decryptAppMySQLTLSCA(cfg, st.TLSCAEnc)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(caPEM) == "" {
			return "true", nil
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return "", errors.New("invalid TLS CA PEM")
		}
		name := fmt.Sprintf("kubebt-app-mysql-%x", sha1.Sum([]byte(st.Host+"|"+caPEM)))
		_ = mysqlDriver.RegisterTLSConfig(name, &tls.Config{
			RootCAs:    pool,
			ServerName: strings.TrimSpace(st.Host),
			MinVersion: tls.VersionTLS12,
		})
		return name, nil
	default:
		return "", fmt.Errorf("unsupported tlsMode %q", st.TLSMode)
	}
}

func appMySQLBuildDSN(cfg Config, st *appMySQLStoredConfig) (string, error) {
	if st == nil {
		return "", errors.New("mysql config is empty")
	}
	parsed, err := parseAppMySQLStoredConfig(*st)
	if err != nil {
		return "", err
	}
	pass, err := decryptAppMySQLPassword(cfg, parsed.PasswordEnc)
	if err != nil {
		return "", err
	}
	host := strings.TrimSpace(parsed.Host)
	port := parsed.Port
	if port <= 0 {
		port = 3306
	}
	dbName := strings.TrimSpace(parsed.DefaultSchema)
	tlsParam, err := appMySQLDriverTLSParam(cfg, parsed)
	if err != nil {
		return "", err
	}
	query := url.Values{}
	query.Set("parseTime", "true")
	query.Set("timeout", "8s")
	query.Set("readTimeout", "30s")
	query.Set("writeTimeout", "30s")
	query.Set("charset", "utf8mb4")
	if tlsParam != "" {
		query.Set("tls", tlsParam)
	}
	mc := mysqlDriver.Config{
		User:                 strings.TrimSpace(parsed.Username),
		Passwd:               pass,
		Net:                  "tcp",
		Addr:                 net.JoinHostPort(host, strconv.Itoa(port)),
		DBName:               dbName,
		Params:               map[string]string{},
		AllowNativePasswords: true,
		ParseTime:            true,
		Timeout:              8 * time.Second,
		ReadTimeout:          30 * time.Second,
		WriteTimeout:         30 * time.Second,
	}
	for k, v := range query {
		if len(v) > 0 {
			mc.Params[k] = v[0]
		}
	}
	if tlsParam != "" {
		mc.TLSConfig = tlsParam
	}
	return mc.FormatDSN(), nil
}

func openAppMySQLDB(ctx context.Context, cfg Config, st *appMySQLStoredConfig) (*sql.DB, func(), error) {
	dsn, err := appMySQLBuildDSN(cfg, st)
	if err != nil {
		return nil, func() {}, err
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, func() {}, err
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(2 * time.Minute)
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, func() {}, err
	}
	return db, func() { _ = db.Close() }, nil
}

func appMySQLPublicSummary(st *appMySQLStoredConfig) map[string]interface{} {
	m := map[string]interface{}{
		"mode":        string(st.Mode),
		"hasPassword": strings.TrimSpace(st.PasswordEnc) != "",
	}
	switch st.Mode {
	case AppMySQLExternal:
		m["host"] = st.Host
		m["port"] = st.Port
		m["username"] = st.Username
		if strings.TrimSpace(st.DefaultSchema) != "" {
			m["defaultSchema"] = st.DefaultSchema
		}
		if strings.TrimSpace(st.TLSMode) != "" {
			m["tlsMode"] = st.TLSMode
		}
	case AppMySQLK8s:
		m["k8sManaged"] = true
		m["k8sNamespace"] = st.K8sNamespace
		m["k8sBaseName"] = st.K8sBaseName
		m["k8sServiceType"] = st.K8sServiceType
		if st.K8sSvcPort > 0 {
			m["k8sSvcPort"] = st.K8sSvcPort
		}
		if strings.TrimSpace(st.K8sVersionLine) != "" {
			m["k8sVersionLine"] = st.K8sVersionLine
		}
		if strings.TrimSpace(st.K8sMySQLImageResolved) != "" {
			m["k8sMysqlImageResolved"] = st.K8sMySQLImageResolved
		}
		m["k8sExporterEnabled"] = st.K8sExporterEnabled
		m["k8sPersistenceEnabled"] = st.K8sPersistenceEnabled
		if strings.TrimSpace(st.K8sStorageSize) != "" {
			m["k8sStorageSize"] = st.K8sStorageSize
		}
		if st.K8sTemplateID > 0 {
			m["k8sTemplateId"] = st.K8sTemplateID
		}
		if strings.TrimSpace(st.K8sTemplateName) != "" {
			m["k8sTemplateName"] = st.K8sTemplateName
		}
	}
	return m
}

func appMySQLStoredIsPlatformK8s(st *appMySQLStoredConfig) bool {
	return st != nil && st.Mode == AppMySQLK8s && strings.TrimSpace(st.K8sNamespace) != "" && strings.TrimSpace(st.K8sBaseName) != ""
}

func appMySQLRowToPublic(row appMySQLRow) (map[string]interface{}, error) {
	var st appMySQLStoredConfig
	if err := json.Unmarshal([]byte(row.ConfigJSON), &st); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id":        row.ID,
		"name":      row.Name,
		"mode":      row.Mode,
		"summary":   appMySQLPublicSummary(&st),
		"createdAt": row.CreatedAt,
		"updatedAt": row.UpdatedAt,
		"createdBy": row.CreatedBy,
	}, nil
}

func stringFromBody(body map[string]interface{}, key string) string {
	v, _ := body[key].(string)
	return v
}

func intFromBody(body map[string]interface{}, key string) int {
	switch v := body[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	case json.Number:
		n, _ := v.Int64()
		return int(n)
	default:
		return 0
	}
}

func mustMarshalAppMySQLStoredConfig(st *appMySQLStoredConfig) (string, error) {
	if st == nil {
		return "", fmt.Errorf("MySQL 实例配置为空")
	}
	b, err := json.Marshal(st)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func appMySQLFirstStatement(sqlText string) (string, bool) {
	s := strings.TrimSpace(sqlText)
	if s == "" {
		return "", false
	}
	for {
		switch {
		case strings.HasPrefix(s, "--"):
			idx := strings.IndexByte(s, '\n')
			if idx < 0 {
				return "", false
			}
			s = strings.TrimSpace(s[idx+1:])
		case strings.HasPrefix(s, "#"):
			idx := strings.IndexByte(s, '\n')
			if idx < 0 {
				return "", false
			}
			s = strings.TrimSpace(s[idx+1:])
		case strings.HasPrefix(s, "/*"):
			idx := strings.Index(s, "*/")
			if idx < 0 {
				return "", false
			}
			s = strings.TrimSpace(s[idx+2:])
		default:
			goto cleaned
		}
	}
cleaned:
	if s == "" {
		return "", false
	}
	parts := strings.Split(s, ";")
	if len(parts) > 1 {
		for _, rest := range parts[1:] {
			if strings.TrimSpace(rest) != "" {
				return s, false
			}
		}
	}
	return strings.TrimSpace(parts[0]), true
}

func appMySQLLeadingKeyword(sqlText string) string {
	stmt, ok := appMySQLFirstStatement(sqlText)
	if !ok {
		return ""
	}
	fields := strings.FieldsFunc(stmt, func(r rune) bool {
		return r == '(' || r == ';' || r == '\n' || r == '\r' || r == '\t' || r == ' '
	})
	if len(fields) == 0 {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(fields[0]))
}

func appMySQLQueryAllowedWithoutMutationConfirm(sqlText string) bool {
	stmt, ok := appMySQLFirstStatement(sqlText)
	if !ok || strings.TrimSpace(stmt) == "" {
		return false
	}
	switch appMySQLLeadingKeyword(stmt) {
	case "select", "show", "describe", "desc", "explain":
		return true
	case "with":
		return !strings.Contains(strings.ToLower(stmt), " delete ") &&
			!strings.Contains(strings.ToLower(stmt), " update ") &&
			!strings.Contains(strings.ToLower(stmt), " insert ")
	default:
		return false
	}
}

func appMySQLLimitRows(raw int) int {
	if raw <= 0 {
		return 500
	}
	if raw > 2000 {
		return 2000
	}
	return raw
}

func appMySQLRuntimeSnapshot(ctx context.Context, db *sql.DB) (map[string]interface{}, error) {
	out := map[string]interface{}{}
	var version, comment, hostname sql.NullString
	var port, readOnly, superReadOnly, maxConnections, uptime sql.NullInt64
	_ = db.QueryRowContext(ctx, `SELECT @@version, @@version_comment, @@hostname, @@port, @@read_only, @@super_read_only, @@max_connections, @@uptime`).Scan(
		&version, &comment, &hostname, &port, &readOnly, &superReadOnly, &maxConnections, &uptime,
	)
	out["version"] = version.String
	out["versionComment"] = comment.String
	out["hostname"] = hostname.String
	out["port"] = port.Int64
	out["readOnly"] = readOnly.Int64 == 1
	out["superReadOnly"] = superReadOnly.Int64 == 1
	out["maxConnections"] = maxConnections.Int64
	out["uptimeSeconds"] = uptime.Int64

	status := map[string]string{}
	rows, err := db.QueryContext(ctx, `SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Questions','Slow_queries','Connections','Bytes_received','Bytes_sent','Innodb_buffer_pool_reads','Innodb_buffer_pool_read_requests')`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				status[k] = v
			}
		}
	}
	out["status"] = status
	return out, nil
}

func appMySQLSchemas(ctx context.Context, db *sql.DB) ([]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys') ORDER BY schema_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func appMySQLTables(ctx context.Context, db *sql.DB, schema string) ([]map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, `SELECT table_name, table_type, COALESCE(engine,''), COALESCE(table_rows,0), COALESCE(data_length,0), COALESCE(index_length,0) FROM information_schema.tables WHERE table_schema=? ORDER BY table_name`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var name, typ, engine string
		var tableRows, dataLength, indexLength int64
		if err := rows.Scan(&name, &typ, &engine, &tableRows, &dataLength, &indexLength); err != nil {
			return nil, err
		}
		out = append(out, map[string]interface{}{
			"name":       name,
			"type":       typ,
			"engine":     engine,
			"rows":       tableRows,
			"dataBytes":  dataLength,
			"indexBytes": indexLength,
			"totalBytes": dataLength + indexLength,
		})
	}
	return out, rows.Err()
}

func appMySQLProcesslist(ctx context.Context, db *sql.DB, limit int) ([]map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, `SELECT ID, USER, HOST, COALESCE(DB,''), COMMAND, TIME, COALESCE(STATE,''), COALESCE(INFO,'') FROM information_schema.PROCESSLIST ORDER BY TIME DESC LIMIT ?`, appMySQLLimitRows(limit))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id, sec int64
		var user, host, schema, command, state, info string
		if err := rows.Scan(&id, &user, &host, &schema, &command, &sec, &state, &info); err != nil {
			return nil, err
		}
		out = append(out, map[string]interface{}{
			"id":      id,
			"user":    user,
			"host":    host,
			"schema":  schema,
			"command": command,
			"timeSec": sec,
			"state":   state,
			"info":    truncateErrMessage(info, 500),
		})
	}
	return out, rows.Err()
}
