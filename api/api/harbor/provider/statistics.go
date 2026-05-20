package provider

import (
	"encoding/json"
	"strconv"
	"strings"
)

func StatisticsJSONLooksLikeStatistic(b []byte) bool {
	var m map[string]interface{}
	if json.Unmarshal(b, &m) != nil || len(m) == 0 {
		return false
	}
	if raw, ok := m["errors"].([]interface{}); ok && len(raw) > 0 {
		return false
	}
	_, a := m["total_project_count"]
	_, b1 := m["total_repo_count"]
	_, c := m["public_project_count"]
	_, d := m["private_project_count"]
	return a || b1 || c || d
}

func StatisticsPrunedJSONBody(b []byte) []byte {
	var m map[string]interface{}
	if json.Unmarshal(b, &m) != nil {
		return b
	}
	out := map[string]interface{}{}
	if v, ok := m["total_project_count"]; ok {
		out["total_project_count"] = v
	}
	if v, ok := m["total_repo_count"]; ok {
		out["total_repo_count"] = v
	}
	b2, err := json.Marshal(out)
	if err != nil {
		return b
	}
	return b2
}

func JSONToInt64(v interface{}) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int:
		return int64(x)
	case int64:
		return x
	case json.Number:
		n, err := x.Int64()
		if err == nil {
			return n
		}
		f, err2 := x.Float64()
		if err2 == nil {
			return int64(f)
		}
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(x), 10, 64)
		if err == nil {
			return n
		}
	}
	return 0
}
