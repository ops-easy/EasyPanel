package model

type SyncStepResult struct {
	Name     string `json:"name"`
	OK       bool   `json:"ok"`
	Attempts int    `json:"attempts"`
	Error    string `json:"error,omitempty"`
}

type SyncDomainReport struct {
	Domain           string           `json:"domain"`
	BaotaTargetID    string           `json:"baotaTargetId,omitempty"`
	TargetURL        string           `json:"targetUrl,omitempty"`
	BaotaHTTPS       bool             `json:"baotaHttps,omitempty"`
	OverallOK        bool             `json:"overallOk"`
	Steps            []SyncStepResult `json:"steps"`
	IngressNamespace string           `json:"ingressNamespace,omitempty"`
	IngressName      string           `json:"ingressName,omitempty"`
}

type TargetEntry struct {
	ID             string
	DisplayName    string
	URL            string
	APIKey         string
	SkipTLSVerify  *bool
	DefaultForSync bool
}
