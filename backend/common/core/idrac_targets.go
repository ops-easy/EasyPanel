package core

import (
	"errors"
	"fmt"
	"strings"
)

// IdracTargetEntry is the merged in-process iDRAC target used by Config.
type IdracTargetEntry struct {
	ID          string
	DisplayName string
	Host        string
	User        string
	Password    string
	Insecure    bool
	Default     bool
}

// RuntimeIdracTarget is one persisted iDRAC / Redfish endpoint.
type RuntimeIdracTarget struct {
	ID       string `json:"id"`
	Name     string `json:"name,omitempty"`
	Host     string `json:"host"`
	User     string `json:"user"`
	Password string `json:"password,omitempty"`
	Insecure bool   `json:"insecure,omitempty"`
	Default  bool   `json:"default,omitempty"`
}

func normalizeRuntimeIdracTargetID(raw string, index int) (string, error) {
	id := strings.TrimSpace(strings.ToLower(raw))
	if id == "" {
		id = fmt.Sprintf("idrac-%d", index+1)
	}
	if !baotaTargetIDRe.MatchString(id) {
		return "", errors.New("iDRAC 目标 id 必须为小写字母、数字、连字符，长度 1-63，且不以连字符结尾")
	}
	return id, nil
}

func legacyRuntimeIdracTarget(rs *RuntimeSettings) []RuntimeIdracTarget {
	if rs == nil || strings.TrimSpace(rs.IdracHost) == "" {
		return nil
	}
	return []RuntimeIdracTarget{{
		ID:       "default",
		Name:     "默认 iDRAC",
		Host:     strings.TrimSpace(rs.IdracHost),
		User:     strings.TrimSpace(rs.IdracUser),
		Password: rs.IdracPassword,
		Insecure: rs.IdracInsecure,
		Default:  true,
	}}
}

func syncLegacyIdracFieldsFromTargets(rs *RuntimeSettings) {
	if rs == nil {
		return
	}
	if len(rs.IdracTargets) == 0 {
		rs.IdracHost = ""
		rs.IdracUser = ""
		rs.IdracPassword = ""
		rs.IdracInsecure = true
		return
	}
	pick := rs.IdracTargets[0]
	for _, t := range rs.IdracTargets {
		if t.Default {
			pick = t
			break
		}
	}
	rs.IdracHost = strings.TrimSpace(pick.Host)
	rs.IdracUser = strings.TrimSpace(pick.User)
	rs.IdracPassword = pick.Password
	rs.IdracInsecure = pick.Insecure
}

func mergeRuntimeIdracTargetsIntoConfig(rs *RuntimeSettings, out *Config) {
	if out == nil {
		return
	}
	out.IdracTargets = nil
	if rs == nil {
		return
	}
	rows := rs.IdracTargets
	if len(rows) == 0 {
		rows = legacyRuntimeIdracTarget(rs)
	}
	if len(rows) == 0 {
		return
	}

	seen := map[string]struct{}{}
	built := make([]IdracTargetEntry, 0, len(rows))
	for i, row := range rows {
		id, err := normalizeRuntimeIdracTargetID(row.ID, i)
		if err != nil {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		host := strings.TrimSpace(row.Host)
		user := strings.TrimSpace(row.User)
		password := row.Password
		if host == "" || user == "" || strings.TrimSpace(password) == "" {
			continue
		}
		built = append(built, IdracTargetEntry{
			ID:          id,
			DisplayName: strings.TrimSpace(row.Name),
			Host:        host,
			User:        user,
			Password:    password,
			Insecure:    row.Insecure,
			Default:     row.Default,
		})
	}
	if len(built) == 0 {
		return
	}
	defN := 0
	for i := range built {
		if built[i].Default {
			defN++
		}
	}
	if defN != 1 {
		for i := range built {
			built[i].Default = i == 0
		}
	}
	out.IdracTargets = built
	for _, t := range built {
		if t.Default {
			out.IdracHost = t.Host
			out.IdracUser = t.User
			out.IdracPassword = t.Password
			out.IdracInsecure = t.Insecure
			return
		}
	}
}

// mergeAndValidateRuntimeIdracTargetsOnPut normalizes PUT payload rows and
// restores masked passwords from the current runtime config. Redfish probing is
// intentionally left to the HTTP handler so unit tests stay local and fast.
func mergeAndValidateRuntimeIdracTargetsOnPut(body, cur *RuntimeSettings) error {
	if body == nil {
		return nil
	}
	if body.IdracTargets == nil {
		if cur != nil && len(cur.IdracTargets) > 0 {
			body.IdracTargets = append([]RuntimeIdracTarget(nil), cur.IdracTargets...)
		} else {
			body.IdracTargets = legacyRuntimeIdracTarget(body)
		}
	}
	if len(body.IdracTargets) == 0 {
		syncLegacyIdracFieldsFromTargets(body)
		return nil
	}

	byIDCur := map[string]RuntimeIdracTarget{}
	if cur != nil {
		for i, t := range cur.IdracTargets {
			id, err := normalizeRuntimeIdracTargetID(t.ID, i)
			if err != nil {
				continue
			}
			byIDCur[id] = t
		}
		if len(byIDCur) == 0 {
			for i, t := range legacyRuntimeIdracTarget(cur) {
				id, err := normalizeRuntimeIdracTargetID(t.ID, i)
				if err == nil {
					byIDCur[id] = t
				}
			}
		}
	}

	seen := map[string]struct{}{}
	norm := make([]RuntimeIdracTarget, 0, len(body.IdracTargets))
	for i, row := range body.IdracTargets {
		id, err := normalizeRuntimeIdracTargetID(row.ID, i)
		if err != nil {
			return fmt.Errorf("idracTargets[%d].id: %w", i, err)
		}
		if _, ok := seen[id]; ok {
			return fmt.Errorf("idracTargets 中存在重复 id: %s", id)
		}
		seen[id] = struct{}{}
		host := strings.TrimSpace(row.Host)
		user := strings.TrimSpace(row.User)
		password := strings.TrimSpace(row.Password)
		if host == "" && user == "" && password == "" && strings.TrimSpace(row.Name) == "" {
			continue
		}
		if host == "" {
			return fmt.Errorf("idracTargets[%d]（id=%s）缺少 host", i, id)
		}
		if user == "" {
			return fmt.Errorf("idracTargets[%d]（id=%s）缺少 user", i, id)
		}
		if password == "" || password == "***" {
			if prev, ok := byIDCur[id]; ok && strings.TrimSpace(prev.Password) != "" {
				password = prev.Password
			} else if len(body.IdracTargets) == 1 && cur != nil && strings.TrimSpace(cur.IdracPassword) != "" {
				password = cur.IdracPassword
			}
		}
		if strings.TrimSpace(password) == "" || password == "***" {
			return fmt.Errorf("idracTargets[%d]（id=%s）缺少 password（新目标请填写完整密码）", i, id)
		}
		if _, err := IdracHostConfigFromFlat(host, user, password, row.Insecure); err != nil {
			return fmt.Errorf("idracTargets[%d]（id=%s）host 无效: %w", i, id, err)
		}
		norm = append(norm, RuntimeIdracTarget{
			ID:       id,
			Name:     strings.TrimSpace(row.Name),
			Host:     host,
			User:     user,
			Password: password,
			Insecure: row.Insecure,
			Default:  row.Default,
		})
	}

	defN := 0
	for i := range norm {
		if norm[i].Default {
			defN++
		}
	}
	if len(norm) > 0 && defN == 0 {
		norm[0].Default = true
	} else if defN > 1 {
		first := true
		for i := range norm {
			if norm[i].Default {
				if !first {
					norm[i].Default = false
				}
				first = false
			}
		}
	}
	body.IdracTargets = norm
	syncLegacyIdracFieldsFromTargets(body)
	return nil
}

func verifyRuntimeIdracTargetsForSave(rs *RuntimeSettings) error {
	if rs == nil {
		return nil
	}
	if len(rs.IdracTargets) == 0 {
		if strings.TrimSpace(rs.IdracHost) == "" {
			return nil
		}
		ic, err := IdracHostConfigFromFlat(rs.IdracHost, rs.IdracUser, rs.IdracPassword, rs.IdracInsecure)
		if err != nil {
			return fmt.Errorf("iDRAC 地址无效: %w", err)
		}
		return VerifyIdracRedfish(ic)
	}
	for i, t := range rs.IdracTargets {
		ic, err := IdracHostConfigFromFlat(t.Host, t.User, t.Password, t.Insecure)
		if err != nil {
			return fmt.Errorf("idracTargets[%d] 地址无效: %w", i, err)
		}
		if err := VerifyIdracRedfish(ic); err != nil {
			return fmt.Errorf("idracTargets[%d]（%s）Redfish 校验失败: %w", i, t.ID, err)
		}
	}
	return nil
}

func runtimeIdracTargetsFromConfig(in []IdracTargetEntry) []RuntimeIdracTarget {
	if len(in) == 0 {
		return nil
	}
	out := make([]RuntimeIdracTarget, 0, len(in))
	for _, t := range in {
		out = append(out, RuntimeIdracTarget{
			ID:       t.ID,
			Name:     t.DisplayName,
			Host:     t.Host,
			User:     t.User,
			Password: t.Password,
			Insecure: t.Insecure,
			Default:  t.Default,
		})
	}
	return out
}

func runtimeIdracTargetsAuditChanged(a, b []RuntimeIdracTarget) bool {
	if len(a) != len(b) {
		return true
	}
	for i := range a {
		if i >= len(b) {
			return true
		}
		if strings.TrimSpace(a[i].ID) != strings.TrimSpace(b[i].ID) ||
			strings.TrimSpace(a[i].Name) != strings.TrimSpace(b[i].Name) ||
			strings.TrimSpace(a[i].Host) != strings.TrimSpace(b[i].Host) ||
			strings.TrimSpace(a[i].User) != strings.TrimSpace(b[i].User) ||
			a[i].Password != b[i].Password ||
			a[i].Insecure != b[i].Insecure ||
			a[i].Default != b[i].Default {
			return true
		}
	}
	return false
}
