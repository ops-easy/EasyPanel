package model

type Document struct {
	ID          uint64 `json:"id"`
	Title       string `json:"title"`
	Body        string `json:"body,omitempty"`
	ContentKind string `json:"contentKind"`
	Published   bool   `json:"published"`
}

type Media struct {
	ID        uint64 `json:"id"`
	URL       string `json:"url"`
	Storage   string `json:"storage"`
	MimeType  string `json:"mimeType"`
	SizeBytes int64  `json:"sizeBytes"`
}
