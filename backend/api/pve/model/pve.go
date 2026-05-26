package model

type Target struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	BaseURL        string `json:"baseUrl"`
	AuthMethod     string `json:"authMethod,omitempty"`
	Username       string `json:"username,omitempty"`
	Realm          string `json:"realm,omitempty"`
	PasswordEnc    string `json:"passwordEnc,omitempty"`
	TokenID        string `json:"tokenId,omitempty"`
	TokenSecretEnc string `json:"tokenSecretEnc,omitempty"`
	SkipTLS        bool   `json:"skipTls"`
	PrometheusJob  string `json:"prometheusJob,omitempty"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type TargetListItem struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	BaseURL            string `json:"baseUrl"`
	AuthMethod         string `json:"authMethod"`
	Username           string `json:"username,omitempty"`
	Realm              string `json:"realm,omitempty"`
	PasswordSet        bool   `json:"passwordSet"`
	PasswordPreview    string `json:"passwordPreview,omitempty"`
	TokenID            string `json:"tokenId,omitempty"`
	TokenSecretSet     bool   `json:"tokenSecretSet,omitempty"`
	TokenSecretPreview string `json:"tokenSecretPreview,omitempty"`
	SkipTLS            bool   `json:"skipTls"`
	PrometheusJob      string `json:"prometheusJob,omitempty"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}
