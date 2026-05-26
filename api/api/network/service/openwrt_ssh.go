package service

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	networkmodel "github.com/ops-easy/EasyPanel/api/api/network/model"

	"golang.org/x/crypto/ssh"
)

type openWrtSSHRunner struct{}

func (openWrtSSHRunner) Run(ctx context.Context, dev networkmodel.Device, command string) (string, error) {
	host := strings.TrimSpace(dev.Host)
	if host == "" {
		return "", fmt.Errorf("OpenWrt 目标缺少 host")
	}
	port := dev.Port
	if port == 0 {
		port = 22
	}
	auth, err := openWrtSSHAuthMethods(dev)
	if err != nil {
		return "", err
	}
	config := &ssh.ClientConfig{
		User:            firstNonEmpty(dev.Username, "root"),
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	addr := fmt.Sprintf("%s:%d", host, port)
	dialer := net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return "", err
	}
	defer conn.Close()
	cc, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		return "", err
	}
	client := ssh.NewClient(cc, chans, reqs)
	defer client.Close()
	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	out, err := session.CombinedOutput(command)
	return string(out), err
}

func openWrtSSHAuthMethods(dev networkmodel.Device) ([]ssh.AuthMethod, error) {
	methods := []ssh.AuthMethod{}
	if strings.TrimSpace(dev.PrivateKey) != "" {
		signer, err := ssh.ParsePrivateKey([]byte(dev.PrivateKey))
		if err != nil {
			return nil, fmt.Errorf("OpenWrt SSH 私钥解析失败: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if strings.TrimSpace(dev.Password) != "" {
		methods = append(methods, ssh.Password(dev.Password))
	}
	if len(methods) == 0 {
		return nil, fmt.Errorf("OpenWrt 目标缺少 SSH 密码或私钥")
	}
	return methods, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
