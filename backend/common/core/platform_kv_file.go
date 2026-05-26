package core

import "github.com/ops-easy/EasyPanel/backend/pkg/platformkv"

type PlatformKVFile = platformkv.File

func newPlatformKVFile(dataDir string) (*PlatformKVFile, error) {
	return platformkv.NewFile(dataDir)
}
