package model

type VM struct {
	MoRef       string `json:"moref"`
	Name        string `json:"name"`
	PowerState  string `json:"powerState,omitempty"`
	GuestIP     string `json:"guestIp,omitempty"`
	ClusterName string `json:"clusterName,omitempty"`
}

type Event struct {
	VMName    string `json:"vmName,omitempty"`
	Message   string `json:"message"`
	CreatedAt string `json:"createdAt,omitempty"`
}
