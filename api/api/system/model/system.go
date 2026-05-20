package model

type AuditRecord struct {
	Ts     string `json:"ts"`
	User   string `json:"user,omitempty"`
	Method string `json:"method,omitempty"`
	Path   string `json:"path,omitempty"`
	Status int    `json:"status,omitempty"`
}
