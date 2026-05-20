package model

type IPSegmentsConfig struct {
	Segments []string `json:"segments"`
}

type IPScanResultRow struct {
	IP     string `json:"ip"`
	Status string `json:"status"`
}

type IPScanSummary struct {
	Total      int `json:"total"`
	Used       int `json:"used"`
	LikelyFree int `json:"likelyFree"`
}

type IPScanRun struct {
	ID          string            `json:"id"`
	StartedAt   string            `json:"startedAt"`
	EndedAt     string            `json:"endedAt"`
	Segment     string            `json:"segment"`
	PodSourceIP string            `json:"podSourceIp,omitempty"`
	Results     []IPScanResultRow `json:"results"`
	Summary     IPScanSummary     `json:"summary"`
	Note        string            `json:"note,omitempty"`
}

type IPScanConfigPut struct {
	Segments []string `json:"segments"`
}

type IPScanRunBody struct {
	Segment string `json:"segment"`
}
