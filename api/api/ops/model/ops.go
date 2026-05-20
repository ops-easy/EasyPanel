package model

type AlertRule struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type GrafanaDashboard struct {
	UID   string `json:"uid"`
	Title string `json:"title"`
}
