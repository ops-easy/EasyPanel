package model

type RuntimeStatus struct {
	Initialized bool   `json:"initialized"`
	Mode        string `json:"mode,omitempty"`
}
