package provider

import (
	"testing"

	pvemodel "github.com/ops-easy/EasyPanel/backend/api/pve/model"
	sharedcrypto "github.com/ops-easy/EasyPanel/backend/common/crypto"
)

func TestNormalizeTargetFromBodyUsesPasswordAuthByDefault(t *testing.T) {
	key, err := sharedcrypto.DeriveAESKey("pve-password-test")
	if err != nil {
		t.Fatalf("DeriveAESKey returned error: %v", err)
	}
	target, err := NormalizeTargetFromBody(TargetBody{
		Name:     "lab-pve",
		BaseURL:  "pve.local",
		Username: "root",
		Password: "secret-pass",
		SkipTLS:  true,
	}, nil, key, "2026-05-21T17:00:00+08:00")
	if err != nil {
		t.Fatalf("NormalizeTargetFromBody returned error: %v", err)
	}
	if target.AuthMethod != "password" {
		t.Fatalf("AuthMethod=%q, want password", target.AuthMethod)
	}
	if target.Username != "root" {
		t.Fatalf("Username=%q, want root", target.Username)
	}
	if target.Realm != "pam" {
		t.Fatalf("Realm=%q, want pam", target.Realm)
	}
	if target.PasswordEnc == "" {
		t.Fatalf("PasswordEnc is empty")
	}
	if target.TokenID != "" || target.TokenSecretEnc != "" {
		t.Fatalf("password auth should not keep token fields: %#v", target)
	}
	plain, err := DecryptTargetPassword(key, target)
	if err != nil {
		t.Fatalf("DecryptTargetPassword returned error: %v", err)
	}
	if plain != "secret-pass" {
		t.Fatalf("password=%q, want secret-pass", plain)
	}
}

func TestNormalizeTargetFromBodySplitsLegacyPrincipal(t *testing.T) {
	key, err := sharedcrypto.DeriveAESKey("pve-password-test")
	if err != nil {
		t.Fatalf("DeriveAESKey returned error: %v", err)
	}
	target, err := NormalizeTargetFromBody(TargetBody{
		Name:     "legacy",
		BaseURL:  "pve.local",
		Username: "admin@pve",
		Password: "secret-pass",
	}, nil, key, "2026-05-21T17:00:00+08:00")
	if err != nil {
		t.Fatalf("NormalizeTargetFromBody returned error: %v", err)
	}
	if target.Username != "admin" || target.Realm != "pve" {
		t.Fatalf("identity=(%q,%q), want (admin,pve)", target.Username, target.Realm)
	}
}

func TestTargetAuthMethodHonorsExplicitToken(t *testing.T) {
	got := TargetAuthMethod(pvemodel.Target{
		AuthMethod: AuthMethodToken,
		Username:   "legacy-user",
		TokenID:    "root@pam!easypanel",
	})
	if got != AuthMethodToken {
		t.Fatalf("TargetAuthMethod=%q, want token", got)
	}
}

func TestNormalizeTargetFromBodyKeepsExistingPasswordWhenPlaceholderSubmitted(t *testing.T) {
	key, err := sharedcrypto.DeriveAESKey("pve-password-test")
	if err != nil {
		t.Fatalf("DeriveAESKey returned error: %v", err)
	}
	enc, err := sharedcrypto.EncryptSecret(key, "old-pass")
	if err != nil {
		t.Fatalf("EncryptSecret returned error: %v", err)
	}
	cur := &pvemodel.Target{
		ID:          "pve-1",
		Name:        "old",
		BaseURL:     "https://pve.local:8006",
		AuthMethod:  "password",
		Username:    "root",
		Realm:       "pam",
		PasswordEnc: enc,
	}
	target, err := NormalizeTargetFromBody(TargetBody{
		Name:       "new",
		BaseURL:    "https://pve.local:8006",
		AuthMethod: "password",
		Username:   "admin",
		Password:   "***",
	}, cur, key, "2026-05-21T17:05:00+08:00")
	if err != nil {
		t.Fatalf("NormalizeTargetFromBody returned error: %v", err)
	}
	if target.Username != "admin" {
		t.Fatalf("Username=%q, want admin", target.Username)
	}
	if target.Realm != "pam" {
		t.Fatalf("Realm=%q, want pam", target.Realm)
	}
	plain, err := DecryptTargetPassword(key, target)
	if err != nil {
		t.Fatalf("DecryptTargetPassword returned error: %v", err)
	}
	if plain != "old-pass" {
		t.Fatalf("password=%q, want old-pass", plain)
	}
}

func TestDecryptTargetCredentialUsesPasswordForPasswordAuth(t *testing.T) {
	key, err := sharedcrypto.DeriveAESKey("pve-password-test")
	if err != nil {
		t.Fatalf("DeriveAESKey returned error: %v", err)
	}
	passwordEnc, err := sharedcrypto.EncryptSecret(key, "secret-pass")
	if err != nil {
		t.Fatalf("EncryptSecret password returned error: %v", err)
	}
	tokenEnc, err := sharedcrypto.EncryptSecret(key, "token-secret")
	if err != nil {
		t.Fatalf("EncryptSecret token returned error: %v", err)
	}
	plain, err := DecryptTargetCredential(key, pvemodel.Target{
		AuthMethod:     "password",
		Username:       "root",
		Realm:          "pam",
		PasswordEnc:    passwordEnc,
		TokenSecretEnc: tokenEnc,
	})
	if err != nil {
		t.Fatalf("DecryptTargetCredential returned error: %v", err)
	}
	if plain != "secret-pass" {
		t.Fatalf("plain=%q, want secret-pass", plain)
	}
}
