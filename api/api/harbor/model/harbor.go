package model

type ImageIndexEntry struct {
	Project   string `json:"project"`
	Repo      string `json:"repo"`
	Tag       string `json:"tag"`
	Digest    string `json:"digest,omitempty"`
	PushTime  string `json:"pushTime,omitempty"`
	Reference string `json:"reference"`
}

type ImageIndexProgress struct {
	State          string `json:"state"`
	Phase          string `json:"phase"`
	Message        string `json:"message,omitempty"`
	ProjectsTotal  int    `json:"projectsTotal"`
	ProjectsDone   int    `json:"projectsDone"`
	ReposScanned   int    `json:"reposScanned"`
	TagsIndexed    int    `json:"tagsIndexed"`
	CurrentProject string `json:"currentProject,omitempty"`
	CurrentRepo    string `json:"currentRepo,omitempty"`
	StartedAt      string `json:"startedAt,omitempty"`
	FinishedAt     string `json:"finishedAt,omitempty"`
	PercentApprox  int    `json:"percentApprox"`
	LastError      string `json:"lastError,omitempty"`
}

type ProxyLogEntry struct {
	Ts         string `json:"ts"`
	User       string `json:"user,omitempty"`
	IP         string `json:"ip,omitempty"`
	Method     string `json:"method,omitempty"`
	APIRoute   string `json:"apiRoute,omitempty"`
	HarborPath string `json:"harborPath,omitempty"`
	Status     int    `json:"status,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	FromCache  bool   `json:"fromCache,omitempty"`
	Note       string `json:"note,omitempty"`
}
