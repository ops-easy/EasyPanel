package model

type Target struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	BaseURL        string `json:"baseUrl"`
	TokenID        string `json:"tokenId"`
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
	TokenID            string `json:"tokenId"`
	TokenSecretSet     bool   `json:"tokenSecretSet"`
	TokenSecretPreview string `json:"tokenSecretPreview,omitempty"`
	SkipTLS            bool   `json:"skipTls"`
	PrometheusJob      string `json:"prometheusJob,omitempty"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}
