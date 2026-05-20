package internal

import "kube-bt-sync/pkg/platformkv"

// PlatformKV 平台键值（cloud_hosts、向导状态等）；实现可为本地 JSON 文件或 MySQL。
type PlatformKV = platformkv.Store
