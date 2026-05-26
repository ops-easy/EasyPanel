package core

import idracint "github.com/ops-easy/EasyPanel/backend/api/ops/provider"

// IdracHostConfig iDRAC Redfish 连接参数（BaseURL 为 https:// 根地址）。
type IdracHostConfig = idracint.IdracHostConfig

// IdracPhysicalDiskRow 单块物理盘（Redfish Drive 资源摘要）。
type IdracPhysicalDiskRow = idracint.IdracPhysicalDiskRow

type IdracTelemetryPoint = idracint.IdracTelemetryPoint

// IdracMemoryModuleRow 单条内存 DIMM（Redfish Memory 资源摘要）。
type IdracMemoryModuleRow = idracint.IdracMemoryModuleRow

type IdracTelemetrySnapshot = idracint.IdracTelemetrySnapshot

// IdracSystemSummary 来自 Redfish ComputerSystem（代外机型与资源摘要）。
type IdracSystemSummary = idracint.IdracSystemSummary

// IdracHostConfigFromFlat 由 IP/主机名（可带 https://）与凭据构造配置。
func IdracHostConfigFromFlat(host, user, password string, insecure bool) (IdracHostConfig, error) {
	return idracint.IdracHostConfigFromFlat(host, user, password, insecure)
}

// VerifyIdracRedfish 在保存前校验 Redfish 账号（GET /redfish/v1/）。
func VerifyIdracRedfish(cfg IdracHostConfig) error {
	return idracint.VerifyIdracRedfish(cfg)
}

// FetchIdracSystemSummary 读取 Redfish Systems 资源（优先 System.Embedded.1）。
func FetchIdracSystemSummary(cfg IdracHostConfig) (*IdracSystemSummary, string) {
	return idracint.FetchIdracSystemSummary(cfg)
}

// FetchIdracTelemetrySnapshot 通过 iDRAC Redfish 抓取功耗、风扇与温度快照。
func FetchIdracTelemetrySnapshot(cfg IdracHostConfig) (*IdracTelemetrySnapshot, string) {
	return idracint.FetchIdracTelemetrySnapshot(cfg)
}

// FetchIdracMemoryModules 枚举 Systems/*/Memory 下的 DIMM 摘要。
func FetchIdracMemoryModules(cfg IdracHostConfig) ([]IdracMemoryModuleRow, string) {
	return idracint.FetchIdracMemoryModules(cfg)
}

// FetchIdracPhysicalDisks 通过 iDRAC Redfish 枚举物理盘（Chassis Drives + System Storage Drives）。
func FetchIdracPhysicalDisks(cfg IdracHostConfig) ([]IdracPhysicalDiskRow, string) {
	return idracint.FetchIdracPhysicalDisks(cfg)
}
