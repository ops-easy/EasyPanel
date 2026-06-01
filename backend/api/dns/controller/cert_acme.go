package controller

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/acme"
)

type dnsCertificateIssueRequest struct {
	Email            string
	Domains          []string
	Zones            []string
	Provider         DnsProviderClient
	DirectoryURL     string
	PropagationDelay time.Duration
}

type dnsCertificateIssueResult struct {
	CertPEM       string
	KeyPEM        string
	IssuedAt      time.Time
	ExpireAt      time.Time
	DNSRecords    []dnsCertChallengeRecord
	CleanupErrors []string
}

type dnsCertChallengeRecord struct {
	Domain   string
	Zone     string
	Host     string
	Value    string
	RecordID string
}

type dnsCertChallengePlanResult struct {
	Domain string
	Zone   string
	Host   string
}

type dnsACMEClient interface {
	Register(context.Context, *acme.Account, func(string) bool) (*acme.Account, error)
	AuthorizeOrder(context.Context, []acme.AuthzID, ...acme.OrderOption) (*acme.Order, error)
	GetAuthorization(context.Context, string) (*acme.Authorization, error)
	DNS01ChallengeRecord(string) (string, error)
	Accept(context.Context, *acme.Challenge) (*acme.Challenge, error)
	WaitAuthorization(context.Context, string) (*acme.Authorization, error)
	WaitOrder(context.Context, string) (*acme.Order, error)
	CreateOrderCert(context.Context, string, []byte, bool) ([][]byte, string, error)
}

type dnsACMEIssuer struct {
	newClient func(crypto.Signer, string) dnsACMEClient
	sleep     func(context.Context, time.Duration) error
}

var dnsCertIssueCertificate = func(ctx context.Context, req dnsCertificateIssueRequest) (*dnsCertificateIssueResult, error) {
	return dnsACMEIssuer{}.Issue(ctx, req)
}

func (i dnsACMEIssuer) Issue(ctx context.Context, req dnsCertificateIssueRequest) (res *dnsCertificateIssueResult, err error) {
	if req.Provider == nil {
		return nil, errors.New("未配置 DNS 服务商账号")
	}
	domains, err := dnsNormalizeCertDomains(req.Domains)
	if err != nil {
		return nil, err
	}
	zones, err := dnsNormalizeDNSZones(req.Zones)
	if err != nil {
		return nil, err
	}
	if len(zones) == 0 {
		return nil, errors.New("未找到可用于 DNS-01 验证的域名区域，请先同步或录入 DNS 域名")
	}

	accountKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	newClient := i.newClient
	if newClient == nil {
		newClient = func(key crypto.Signer, directoryURL string) dnsACMEClient {
			return &acme.Client{Key: key, DirectoryURL: directoryURL}
		}
	}
	client := newClient(accountKey, firstNonEmpty(req.DirectoryURL, acme.LetsEncryptURL))
	contact := []string{}
	if email := strings.TrimSpace(req.Email); email != "" {
		contact = append(contact, "mailto:"+email)
	}
	if _, err := client.Register(ctx, &acme.Account{Contact: contact}, acme.AcceptTOS); err != nil && !errors.Is(err, acme.ErrAccountAlreadyExists) {
		return nil, fmt.Errorf("注册 ACME 账号失败: %w", err)
	}

	order, err := client.AuthorizeOrder(ctx, acme.DomainIDs(domains...))
	if err != nil {
		return nil, fmt.Errorf("创建 ACME 订单失败: %w", err)
	}

	var records []dnsCertChallengeRecord
	defer func() {
		if len(records) == 0 {
			return
		}
		cleanupErrors := dnsCleanupChallengeRecords(ctx, req.Provider, records)
		if res != nil {
			res.CleanupErrors = cleanupErrors
			return
		}
		if err != nil && len(cleanupErrors) > 0 {
			err = fmt.Errorf("%w；清理 DNS TXT 记录失败：%s", err, strings.Join(cleanupErrors, "；"))
		}
	}()

	for _, authzURL := range order.AuthzURLs {
		authz, err := client.GetAuthorization(ctx, authzURL)
		if err != nil {
			return nil, fmt.Errorf("读取 ACME 授权失败: %w", err)
		}
		if authz.Status != acme.StatusPending {
			continue
		}
		challenge := dnsPickDNS01Challenge(authz.Challenges)
		if challenge == nil {
			return nil, fmt.Errorf("域名 %s 未返回 DNS-01 验证挑战", authz.Identifier.Value)
		}
		value, err := client.DNS01ChallengeRecord(challenge.Token)
		if err != nil {
			return nil, fmt.Errorf("生成 DNS-01 验证值失败: %w", err)
		}
		domain := strings.TrimPrefix(strings.TrimSpace(authz.Identifier.Value), "*.")
		plan, err := dnsCertChallengePlan(domain, zones)
		if err != nil {
			return nil, err
		}
		recordID, err := req.Provider.AddRecord(ctx, plan.Zone, DnsProviderRecord{
			RecordType: "TXT",
			Host:       plan.Host,
			Value:      value,
			TTL:        60,
			Status:     1,
		})
		if err != nil {
			return nil, fmt.Errorf("添加 DNS-01 TXT 记录失败(%s.%s): %w", plan.Host, plan.Zone, err)
		}
		records = append(records, dnsCertChallengeRecord{
			Domain: domain, Zone: plan.Zone, Host: plan.Host, Value: value, RecordID: recordID,
		})
	}

	if len(records) > 0 && req.PropagationDelay > 0 {
		sleep := i.sleep
		if sleep == nil {
			sleep = dnsSleepContext
		}
		if err := sleep(ctx, req.PropagationDelay); err != nil {
			return nil, err
		}
	}

	for _, authzURL := range order.AuthzURLs {
		authz, err := client.GetAuthorization(ctx, authzURL)
		if err != nil {
			return nil, fmt.Errorf("读取 ACME 授权失败: %w", err)
		}
		if authz.Status != acme.StatusPending {
			continue
		}
		challenge := dnsPickDNS01Challenge(authz.Challenges)
		if challenge == nil {
			return nil, fmt.Errorf("域名 %s 未返回 DNS-01 验证挑战", authz.Identifier.Value)
		}
		if _, err := client.Accept(ctx, challenge); err != nil {
			return nil, fmt.Errorf("提交 DNS-01 验证失败: %w", err)
		}
		if _, err := client.WaitAuthorization(ctx, authz.URI); err != nil {
			return nil, fmt.Errorf("等待 DNS-01 验证失败: %w", err)
		}
	}

	readyOrder, err := client.WaitOrder(ctx, order.URI)
	if err != nil {
		return nil, fmt.Errorf("等待 ACME 订单就绪失败: %w", err)
	}
	csr, keyPEM, err := dnsNewCertificateCSR(domains)
	if err != nil {
		return nil, err
	}
	chain, _, err := client.CreateOrderCert(ctx, readyOrder.FinalizeURL, csr, true)
	if err != nil {
		return nil, fmt.Errorf("签发证书失败: %w", err)
	}
	certPEM, issuedAt, expireAt, err := dnsCertPEMFromDERChain(chain)
	if err != nil {
		return nil, err
	}
	return &dnsCertificateIssueResult{
		CertPEM: certPEM, KeyPEM: keyPEM, IssuedAt: issuedAt, ExpireAt: expireAt, DNSRecords: records,
	}, nil
}

func dnsNormalizeCertDomains(domains []string) ([]string, error) {
	seen := map[string]bool{}
	var out []string
	for _, raw := range domains {
		domain := strings.ToLower(strings.Trim(strings.TrimSpace(raw), "."))
		if domain == "" {
			continue
		}
		wildcard := strings.HasPrefix(domain, "*.")
		base := strings.TrimPrefix(domain, "*.")
		if strings.Contains(base, "*") || strings.ContainsAny(domain, " \t\r\n/\\") {
			return nil, fmt.Errorf("域名格式错误: %s", raw)
		}
		if err := dnsValidatePlainDomain(base); err != nil {
			return nil, fmt.Errorf("域名格式错误 %s: %w", raw, err)
		}
		normalized := base
		if wildcard {
			normalized = "*." + base
		}
		if !seen[normalized] {
			out = append(out, normalized)
			seen[normalized] = true
		}
	}
	if len(out) == 0 {
		return nil, errors.New("请至少填写一个证书域名")
	}
	return out, nil
}

func dnsCertOrderDomainList(domainsJSON string) ([]string, error) {
	var domains []string
	if err := json.Unmarshal([]byte(domainsJSON), &domains); err != nil {
		return nil, fmt.Errorf("证书域名数据格式错误: %w", err)
	}
	return dnsNormalizeCertDomains(domains)
}

func dnsNormalizeDNSZones(zones []string) ([]string, error) {
	seen := map[string]bool{}
	var out []string
	for _, raw := range zones {
		zone := strings.ToLower(strings.Trim(strings.TrimSpace(raw), "."))
		if zone == "" {
			continue
		}
		if err := dnsValidatePlainDomain(zone); err != nil {
			return nil, fmt.Errorf("DNS 区域格式错误 %s: %w", raw, err)
		}
		if !seen[zone] {
			out = append(out, zone)
			seen[zone] = true
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return len(out[i]) > len(out[j]) })
	return out, nil
}

func dnsCertChallengePlan(domain string, zones []string) (dnsCertChallengePlanResult, error) {
	domains, err := dnsNormalizeCertDomains([]string{domain})
	if err != nil {
		return dnsCertChallengePlanResult{}, err
	}
	normalizedZones, err := dnsNormalizeDNSZones(zones)
	if err != nil {
		return dnsCertChallengePlanResult{}, err
	}
	base := strings.TrimPrefix(domains[0], "*.")
	for _, zone := range normalizedZones {
		if base == zone {
			return dnsCertChallengePlanResult{Domain: base, Zone: zone, Host: "_acme-challenge"}, nil
		}
		suffix := "." + zone
		if strings.HasSuffix(base, suffix) {
			prefix := strings.TrimSuffix(base, suffix)
			return dnsCertChallengePlanResult{Domain: base, Zone: zone, Host: "_acme-challenge." + prefix}, nil
		}
	}
	return dnsCertChallengePlanResult{}, fmt.Errorf("域名 %s 未匹配到当前 DNS 账号下的托管区域", domain)
}

func dnsValidatePlainDomain(domain string) error {
	if len(domain) > 253 {
		return errors.New("长度超过 253")
	}
	labels := strings.Split(domain, ".")
	if len(labels) < 2 {
		return errors.New("缺少顶级域")
	}
	for _, label := range labels {
		if label == "" {
			return errors.New("存在空标签")
		}
		if len(label) > 63 {
			return errors.New("单段长度超过 63")
		}
		if strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return errors.New("标签不能以 - 开头或结尾")
		}
		for _, ch := range label {
			if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' {
				continue
			}
			return fmt.Errorf("包含非法字符 %q", ch)
		}
	}
	return nil
}

func dnsPickDNS01Challenge(challenges []*acme.Challenge) *acme.Challenge {
	for _, challenge := range challenges {
		if challenge != nil && challenge.Type == "dns-01" {
			return challenge
		}
	}
	return nil
}

func dnsCleanupChallengeRecords(ctx context.Context, provider DnsProviderClient, records []dnsCertChallengeRecord) []string {
	var errs []string
	for _, record := range records {
		if strings.TrimSpace(record.RecordID) == "" {
			continue
		}
		if err := provider.DeleteRecord(ctx, record.Zone, record.RecordID); err != nil {
			errs = append(errs, fmt.Sprintf("%s.%s: %v", record.Host, record.Zone, err))
		}
	}
	return errs
}

func dnsNewCertificateCSR(domains []string) ([]byte, string, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, "", err
	}
	csr, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{DNSNames: domains}, key)
	if err != nil {
		return nil, "", err
	}
	keyPEM := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	return csr, keyPEM, nil
}

func dnsCertPEMFromDERChain(chain [][]byte) (string, time.Time, time.Time, error) {
	if len(chain) == 0 {
		return "", time.Time{}, time.Time{}, errors.New("ACME 未返回证书链")
	}
	var certPEM strings.Builder
	var issuedAt, expireAt time.Time
	for idx, der := range chain {
		if idx == 0 {
			cert, err := x509.ParseCertificate(der)
			if err != nil {
				return "", time.Time{}, time.Time{}, fmt.Errorf("解析签发证书失败: %w", err)
			}
			issuedAt = cert.NotBefore
			expireAt = cert.NotAfter
		}
		certPEM.Write(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	}
	return certPEM.String(), issuedAt, expireAt, nil
}

func dnsACMEDirectoryURL() string {
	if v := strings.TrimSpace(os.Getenv("EASYPANEL_ACME_DIRECTORY_URL")); v != "" {
		return v
	}
	if v := strings.TrimSpace(os.Getenv("ACME_DIRECTORY_URL")); v != "" {
		return v
	}
	return acme.LetsEncryptURL
}

func dnsACMEPropagationDelay() time.Duration {
	raw := strings.TrimSpace(os.Getenv("EASYPANEL_ACME_DNS_PROPAGATION_SECONDS"))
	if raw == "" {
		return 20 * time.Second
	}
	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds < 0 {
		return 20 * time.Second
	}
	if seconds > 600 {
		seconds = 600
	}
	return time.Duration(seconds) * time.Second
}

func dnsSleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
