package internal

import "kube-bt-sync/internal/storage/platformkv"

type PlatformKVFile = platformkv.File

func newPlatformKVFile(dataDir string) (*PlatformKVFile, error) {
	return platformkv.NewFile(dataDir)
}
