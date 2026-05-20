package harbor

import (
	"encoding/json"
	"testing"
)

func TestStatisticsJSONLooksLikeStatistic(t *testing.T) {
	if !StatisticsJSONLooksLikeStatistic([]byte(`{"total_project_count":2,"total_repo_count":4}`)) {
		t.Fatal("expected statistics JSON")
	}
	if StatisticsJSONLooksLikeStatistic([]byte(`{"errors":[{"code":"UNAUTHORIZED"}]}`)) {
		t.Fatal("expected Harbor errors JSON to be rejected")
	}
	if StatisticsJSONLooksLikeStatistic([]byte(`<html></html>`)) {
		t.Fatal("expected HTML to be rejected")
	}
}

func TestStatisticsPrunedJSONBody(t *testing.T) {
	got := StatisticsPrunedJSONBody([]byte(`{"total_project_count":2,"total_repo_count":4,"private_project_count":1}`))
	var m map[string]any
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatalf("unmarshal pruned: %v", err)
	}
	if len(m) != 2 || JSONToInt64(m["total_project_count"]) != 2 || JSONToInt64(m["total_repo_count"]) != 4 {
		t.Fatalf("unexpected pruned body: %s", string(got))
	}
}

func TestJSONToInt64(t *testing.T) {
	if JSONToInt64(" 42 ") != 42 || JSONToInt64(json.Number("3.9")) != 3 || JSONToInt64("bad") != 0 {
		t.Fatal("unexpected conversion")
	}
}
