package core

import sharedcrypto "github.com/ops-easy/EasyPanel/backend/common/crypto"

func deriveAESKey(raw string) ([]byte, error) {
	return sharedcrypto.DeriveAESKey(raw)
}

func encryptSecret(key []byte, plaintext string) (string, error) {
	return sharedcrypto.EncryptSecret(key, plaintext)
}

func EncryptSecret(key []byte, plaintext string) (string, error) {
	return encryptSecret(key, plaintext)
}

func decryptSecret(key []byte, encoded string) (string, error) {
	return sharedcrypto.DecryptSecret(key, encoded)
}

func DecryptSecret(key []byte, encoded string) (string, error) {
	return decryptSecret(key, encoded)
}

func aesEncrypt(key, plain []byte) ([]byte, error) {
	return sharedcrypto.Encrypt(key, plain)
}

func aesDecrypt(key, data []byte) ([]byte, error) {
	return sharedcrypto.Decrypt(key, data)
}

func encryptToBlob(key []byte, plaintext string) ([]byte, error) {
	return sharedcrypto.EncryptToBlob(key, plaintext)
}

func decryptFromBlob(key []byte, blob []byte) (string, error) {
	return sharedcrypto.DecryptFromBlob(key, blob)
}
