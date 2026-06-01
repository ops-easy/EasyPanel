package core

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type bastionTargetSSHPutBody struct {
	User            string  `json:"user"`
	Password        *string `json:"password"`
	PrivateKeyPEM   *string `json:"privateKeyPem"`
	KeyPassphrase   *string `json:"keyPassphrase"`
	Port            *int    `json:"port"`
	InsecureHostKey *bool   `json:"insecureHostKey"`
	SSHHost         *string `json:"sshHost"`
	Confirm         bool    `json:"confirm"`
}

func bastionTargetFromQuery(c *gin.Context) (BastionTargetKey, bool) {
	targetID := strings.TrimSpace(c.Query("target"))
	if targetID == "" {
		targetID = strings.TrimSpace(c.Query("id"))
	}
	key, err := parseBastionTargetKey(targetID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return BastionTargetKey{}, false
	}
	return key, true
}

func handleGetBastionTargetSSHSettings(c *gin.Context, app *ServerApp) {
	targetKey, ok := bastionTargetFromQuery(c)
	if !ok {
		return
	}
	if vcenterBastionAbortIfForbiddenTarget(c, app, targetKey.Canonical) {
		return
	}
	cfg := app.Cfg()
	store := app.SSHStore()
	ctx := c.Request.Context()
	encKey, keyErr := sshEncryptionKey(cfg)
	override := getBastionTargetOverride(app.PlatformKV(), targetKey.Canonical)
	out := gin.H{
		"target":          targetKey.Canonical,
		"provider":        targetKey.Provider,
		"backend":         string(cfg.SSHSettingsBackend),
		"writable":        store != nil && keyErr == nil,
		"encryptionReady": keyErr == nil,
		"sshHost":         override.SSHHost,
	}
	if keyErr != nil {
		out["encryptionError"] = keyErr.Error()
	}
	var rec *SSHVMStored
	if store != nil && keyErr == nil {
		var err error
		rec, err = store.GetVM(ctx, bastionTargetCredentialStoreKey(targetKey), encKey)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
	}
	out["stored"] = rec != nil && (strings.TrimSpace(rec.User) != "" || rec.hasAuth())
	if rec != nil {
		out["user"] = rec.User
		out["port"] = rec.Port
		out["insecureHostKey"] = rec.InsecureHostKey
		out["passwordSet"] = strings.TrimSpace(rec.Password) != ""
		out["privateKeySet"] = strings.TrimSpace(rec.PrivateKeyPEM) != ""
	}
	if rec == nil || strings.TrimSpace(rec.User) == "" {
		if override.SSHUser != "" {
			out["user"] = override.SSHUser
		} else if strings.TrimSpace(cfg.VCenterVMSshUser) != "" {
			out["user"] = cfg.VCenterVMSshUser
		} else if targetKey.Provider == bastionProviderPVE {
			out["user"] = defaultBastionPVESSHUser
		} else {
			out["user"] = cfg.VCenterVMSshUser
		}
	}
	if rec == nil || rec.Port <= 0 {
		if override.SSHPort > 0 {
			out["port"] = override.SSHPort
		} else if cfg.VCenterVMSshPort > 0 {
			out["port"] = cfg.VCenterVMSshPort
		} else if targetKey.Provider == bastionProviderPVE {
			out["port"] = 22
		} else {
			out["port"] = cfg.VCenterVMSshPort
		}
	}
	if rec == nil {
		out["insecureHostKey"] = cfg.VCenterVMSshInsecureHostKey
	}
	if targetKey.Provider == bastionProviderPVE {
		out["canConnect"] = bastionPVESSHReady(cfg, rec)
	} else {
		out["canConnect"] = cfg.vCenterVMSshConfigured() || (rec != nil && rec.hasAuth())
	}
	c.JSON(http.StatusOK, out)
}

func handlePutBastionTargetSSHSettings(c *gin.Context, app *ServerApp) {
	targetKey, ok := bastionTargetFromQuery(c)
	if !ok {
		return
	}
	var body bastionTargetSSHPutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !requireOpsMutationConfirm(c, body.Confirm, "bastion target SSH settings update") {
		return
	}
	if vcenterBastionAbortIfForbiddenTarget(c, app, targetKey.Canonical) {
		return
	}
	if app.PlatformKV() != nil && (body.SSHHost != nil || body.Port != nil || strings.TrimSpace(body.User) != "") {
		ov := getBastionTargetOverride(app.PlatformKV(), targetKey.Canonical)
		ov.TargetID = targetKey.Canonical
		if body.SSHHost != nil {
			ov.SSHHost = strings.TrimSpace(*body.SSHHost)
		}
		if body.Port != nil {
			if *body.Port > 0 {
				ov.SSHPort = *body.Port
			} else {
				ov.SSHPort = 0
			}
		}
		if strings.TrimSpace(body.User) != "" {
			ov.SSHUser = strings.TrimSpace(body.User)
		}
		ov.UpdatedAt = NowBeijingRFC3339()
		if err := putBastionTargetOverride(app.PlatformKV(), targetKey.Canonical, ov); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
	}
	hasCredentialPatch := body.Password != nil || body.PrivateKeyPEM != nil || body.KeyPassphrase != nil || body.InsecureHostKey != nil
	if hasCredentialPatch {
		store := app.SSHStore()
		if store == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "SSH settings store is not enabled"})
			return
		}
		encKey, err := sshEncryptionKey(app.Cfg())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "EASYPANEL_ENCRYPTION_KEY: " + err.Error()})
			return
		}
		if strings.TrimSpace(body.User) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user cannot be empty when updating credentials"})
			return
		}
		patch := &sshVMPutInput{
			User:            body.User,
			Password:        body.Password,
			PrivateKeyPEM:   body.PrivateKeyPEM,
			KeyPassphrase:   body.KeyPassphrase,
			Port:            body.Port,
			InsecureHostKey: body.InsecureHostKey,
		}
		if err := store.PutVM(c.Request.Context(), bastionTargetCredentialStoreKey(targetKey), patch, encKey); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
	}
	SetAuditDetail(c, "Bastion target "+targetKey.Canonical+": SSH settings updated")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleDeleteBastionTargetSSHSettings(c *gin.Context, app *ServerApp) {
	targetKey, ok := bastionTargetFromQuery(c)
	if !ok {
		return
	}
	if !requireOpsMutationConfirm(c, opsMutationConfirmed(c.Query("confirm")), "bastion target SSH settings delete") {
		return
	}
	if vcenterBastionAbortIfForbiddenTarget(c, app, targetKey.Canonical) {
		return
	}
	if store := app.SSHStore(); store != nil {
		if err := store.DeleteVM(c.Request.Context(), bastionTargetCredentialStoreKey(targetKey)); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
	}
	if err := deleteBastionTargetOverride(app.PlatformKV(), targetKey.Canonical); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "Bastion target "+targetKey.Canonical+": SSH settings cleared")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
