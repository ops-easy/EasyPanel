package core

import "github.com/ops-easy/EasyPanel/api/pkg/platformkv"

type PlatformKVFile = platformkv.File

func newPlatformKVFile(dataDir string) (*PlatformKVFile, error) {
	return platformkv.NewFile(dataDir)
}
