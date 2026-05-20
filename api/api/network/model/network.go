package model

type Device struct {
	ID              string `json:"id"`
	Kind            string `json:"kind"`
	Name            string `json:"name"`
	PrometheusScope string `json:"prometheusScope"`
	InstanceLabel   string `json:"instanceLabel"`
	JobLabel        string `json:"jobLabel,omitempty"`
	Notes           string `json:"notes,omitempty"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type OpenWrtMetricFamilies struct {
	System     bool `json:"system"`
	Interfaces bool `json:"interfaces"`
	DHCP       bool `json:"dhcp"`
	WiFi       bool `json:"wifi"`
	Netstat    bool `json:"netstat"`
}

func (f OpenWrtMetricFamilies) MissingHints() []string {
	hints := []string{}
	if !f.System {
		hints = append(hints, "未发现系统指标，可安装 prometheus-node-exporter-lua")
	}
	if !f.Interfaces {
		hints = append(hints, "未发现接口指标，请确认 node network collector 已启用")
	}
	if !f.DHCP {
		hints = append(hints, "未发现 DHCP/邻居指标，可安装或启用 prometheus-node-exporter-lua-openwrt")
	}
	if !f.WiFi {
		hints = append(hints, "未发现无线指标，可安装 prometheus-node-exporter-lua-wifi")
	}
	if !f.Netstat {
		hints = append(hints, "未发现连接跟踪指标，可安装 prometheus-node-exporter-lua-netstat")
	}
	return hints
}
