package core

import (
	"errors"
	"strings"

	"gopkg.in/yaml.v3"
)

// RuntimeSettingsToConfigYAML 将页面提交的动态配置渲染成业务分组 YAML，实际内容由 MySQL 保存。
func RuntimeSettingsToConfigYAML(rs *RuntimeSettings) ([]byte, error) {
	if rs == nil {
		return nil, errors.New("配置为空")
	}
	var doc yaml.Node
	root := ensureYAMLDocumentRoot(&doc)
	values := runtimeSettingsMap(rs)
	for _, m := range structuredRuntimeFieldMappings() {
		if !shouldPersistDynamicRuntimeField(m.key) {
			continue
		}
		if m.key == "k8s" {
			writeRuntimeK8sConfig(root, rs.K8s)
			continue
		}
		v, ok := values[m.key]
		if !ok || len(m.paths) == 0 {
			continue
		}
		if err := setYAMLPath(root, m.paths[0], v); err != nil {
			return nil, err
		}
	}
	return yaml.Marshal(&doc)
}

func setupConfigYAML(rs *RuntimeSettings, dashboardPasswordPlain, dashboardSessionSecret string) ([]byte, error) {
	if rs == nil {
		return nil, errors.New("配置为空")
	}
	rsCopy := *rs
	rsCopy.Version = 1
	rsCopy.Initialized = true
	raw, err := RuntimeSettingsToConfigYAML(&rsCopy)
	if err != nil {
		return nil, err
	}
	var doc map[string]interface{}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	if doc == nil {
		doc = make(map[string]interface{})
	}
	doc["app"] = map[string]interface{}{
		"version":     1,
		"initialized": true,
	}

	server := yamlMap(doc["server"])
	server["address"] = firstConfigValue(rsCopy.DashboardListenAddr, ":8080")
	server["publicUrl"] = strings.TrimSpace(rsCopy.PlatformPublicURL)
	server["user"] = strings.TrimSpace(rsCopy.DashboardUser)
	server["password"] = dashboardPasswordPlain
	if sec := strings.TrimSpace(dashboardSessionSecret); sec != "" {
		server["sessionSecret"] = sec
	}
	if rsCopy.DashboardSessionDays > 0 {
		server["sessionDays"] = rsCopy.DashboardSessionDays
	}
	server["cookieSecure"] = rsCopy.DashboardCookieSecure
	doc["server"] = server

	dbCfg := Config{
		MySQLDSN:      strings.TrimSpace(rsCopy.MySQLDSN),
		MySQLHost:     strings.TrimSpace(rsCopy.MySQLHost),
		MySQLPort:     rsCopy.MySQLPort,
		MySQLDatabase: strings.TrimSpace(rsCopy.MySQLDatabase),
		MySQLUser:     strings.TrimSpace(rsCopy.MySQLUser),
		MySQLPassword: rsCopy.MySQLPassword,
	}
	FinalizeConnectionStrings(&dbCfg)
	db := make(map[string]interface{})
	if strings.TrimSpace(rsCopy.MySQLDSN) != "" {
		db["dsn"] = strings.TrimSpace(rsCopy.MySQLDSN)
	} else {
		db["host"] = dbCfg.MySQLHost
		db["port"] = dbCfg.MySQLPort
		db["db"] = dbCfg.MySQLDatabase
		db["username"] = dbCfg.MySQLUser
		db["password"] = dbCfg.MySQLPassword
	}
	doc["db"] = db

	redisCfg := Config{
		RedisAddr:           strings.TrimSpace(rsCopy.RedisAddr),
		RedisHost:           strings.TrimSpace(rsCopy.RedisHost),
		RedisPort:           rsCopy.RedisPort,
		RedisPassword:       rsCopy.RedisPassword,
		RedisDB:             rsCopy.RedisDB,
		RedisKeyPrefix:      rsCopy.RedisKeyPrefix,
		RedisMode:           rsCopy.RedisMode,
		RedisSentinelMaster: rsCopy.RedisSentinelMaster,
	}
	FinalizeConnectionStrings(&redisCfg)
	redis := make(map[string]interface{})
	if strings.TrimSpace(redisCfg.RedisAddr) != "" {
		redis["address"] = redisCfg.RedisAddr
	}
	if redisCfg.RedisPassword != "" {
		redis["password"] = redisCfg.RedisPassword
	}
	redis["db"] = redisCfg.RedisDB
	if strings.TrimSpace(redisCfg.RedisKeyPrefix) != "" {
		redis["keyPrefix"] = strings.TrimSpace(redisCfg.RedisKeyPrefix)
	}
	if strings.TrimSpace(redisCfg.RedisMode) != "" {
		redis["mode"] = strings.TrimSpace(redisCfg.RedisMode)
	}
	if strings.TrimSpace(redisCfg.RedisSentinelMaster) != "" {
		redis["sentinelMaster"] = strings.TrimSpace(redisCfg.RedisSentinelMaster)
	}
	doc["redis"] = redis

	return yaml.Marshal(doc)
}

func yamlMap(v interface{}) map[string]interface{} {
	if m, ok := v.(map[string]interface{}); ok && m != nil {
		return m
	}
	return make(map[string]interface{})
}

// shouldPersistDynamicRuntimeField 过滤不应写入 MySQL 动态配置的字段。
func shouldPersistDynamicRuntimeField(key string) bool {
	if runtimeFieldEnvSet(key) {
		return false
	}
	switch key {
	case "dashboardUser", "dashboardPassword":
		// 控制台账号密码归 MySQL 用户表管理；静态配置只用于首次创建初始管理员。
		return false
	case "mysqlDsn", "mysqlHost", "mysqlPort", "mysqlDatabase", "mysqlUser", "mysqlPassword":
		// MySQL 是动态配置的启动依赖，必须来自静态 config.yaml 或环境变量，不能存到自己里面。
		return false
	default:
		return true
	}
}

func ensureYAMLDocumentRoot(doc *yaml.Node) *yaml.Node {
	if doc.Kind == 0 {
		doc.Kind = yaml.DocumentNode
	}
	if doc.Kind != yaml.DocumentNode {
		old := *doc
		*doc = yaml.Node{Kind: yaml.DocumentNode, Content: []*yaml.Node{&old}}
	}
	if len(doc.Content) == 0 || doc.Content[0] == nil {
		doc.Content = []*yaml.Node{{Kind: yaml.MappingNode}}
	}
	if doc.Content[0].Kind != yaml.MappingNode {
		doc.Content[0] = &yaml.Node{Kind: yaml.MappingNode}
	}
	return doc.Content[0]
}

func writeRuntimeK8sConfig(root *yaml.Node, k8s *RuntimeK8s) {
	if k8s == nil {
		return
	}
	_ = setYAMLPath(root, []string{"k8s", "mode"}, k8s.Mode)
	_ = setYAMLPath(root, []string{"k8s", "kubeconfigYaml"}, k8s.KubeconfigYAML)
}

func setYAMLPath(root *yaml.Node, path []string, value interface{}) error {
	if len(path) == 0 {
		return nil
	}
	cur := root
	for _, part := range path[:len(path)-1] {
		next := yamlMapValue(cur, part)
		if next == nil {
			next = &yaml.Node{Kind: yaml.MappingNode}
			appendYAMLMapPair(cur, part, next)
		}
		if next.Kind != yaml.MappingNode {
			next.Kind = yaml.MappingNode
			next.Tag = ""
			next.Value = ""
			next.Content = nil
		}
		cur = next
	}
	last := path[len(path)-1]
	newNode, err := yamlNodeFromValue(value)
	if err != nil {
		return err
	}
	for i := 0; i+1 < len(cur.Content); i += 2 {
		if cur.Content[i].Value == last {
			preserveYAMLComments(cur.Content[i+1], newNode)
			cur.Content[i+1] = newNode
			return nil
		}
	}
	appendYAMLMapPair(cur, last, newNode)
	return nil
}

func yamlMapValue(node *yaml.Node, key string) *yaml.Node {
	if node == nil || node.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(node.Content); i += 2 {
		if node.Content[i].Value == key {
			return node.Content[i+1]
		}
	}
	return nil
}

func appendYAMLMapPair(node *yaml.Node, key string, value *yaml.Node) {
	if node.Kind != yaml.MappingNode {
		node.Kind = yaml.MappingNode
	}
	node.Content = append(node.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key}, value)
}

func yamlNodeFromValue(value interface{}) (*yaml.Node, error) {
	raw, err := yaml.Marshal(value)
	if err != nil {
		return nil, err
	}
	var doc yaml.Node
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	if len(doc.Content) == 0 {
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: ""}, nil
	}
	return doc.Content[0], nil
}

func preserveYAMLComments(oldNode, newNode *yaml.Node) {
	if oldNode == nil || newNode == nil {
		return
	}
	if newNode.HeadComment == "" {
		newNode.HeadComment = oldNode.HeadComment
	}
	if newNode.LineComment == "" {
		newNode.LineComment = oldNode.LineComment
	}
	if newNode.FootComment == "" {
		newNode.FootComment = oldNode.FootComment
	}
}
