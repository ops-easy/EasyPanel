package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"strings"
)

func DeriveAESKey(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("EASYPANEL_ENCRYPTION_KEY 未设置")
	}
	if len(raw) == 64 {
		b, err := hex.DecodeString(raw)
		if err == nil && len(b) == 32 {
			return b, nil
		}
	}
	h := sha256.Sum256([]byte(raw))
	return h[:], nil
}

func EncryptSecret(key []byte, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	b, err := Encrypt(key, []byte(plaintext))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(b), nil
}

func DecryptSecret(key []byte, encoded string) (string, error) {
	if strings.TrimSpace(encoded) == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	out, err := Decrypt(key, raw)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func EncryptToBlob(key []byte, plaintext string) ([]byte, error) {
	if strings.TrimSpace(plaintext) == "" {
		return nil, nil
	}
	return Encrypt(key, []byte(plaintext))
}

func DecryptFromBlob(key []byte, blob []byte) (string, error) {
	if len(blob) == 0 {
		return "", nil
	}
	b, err := Decrypt(key, blob)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func Encrypt(key, plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plain, nil), nil
}

func Decrypt(key, data []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ns := gcm.NonceSize()
	if len(data) < ns {
		return nil, errors.New("密文过短")
	}
	nonce, ct := data[:ns], data[ns:]
	return gcm.Open(nil, nonce, ct, nil)
}
