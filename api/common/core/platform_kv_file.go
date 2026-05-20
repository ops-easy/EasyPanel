package core

import "kube-bt-sync/pkg/platformkv"

type PlatformKVFile = platformkv.File

func newPlatformKVFile(dataDir string) (*PlatformKVFile, error) {
	return platformkv.NewFile(dataDir)
}
