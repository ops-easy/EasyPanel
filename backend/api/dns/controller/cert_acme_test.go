package controller

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"math/big"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/acme"
)

func TestDnsCertChallengePlanSelectsBestZoneAndHost(t *testing.T) {
	tests := []struct {
		name   string
		domain string
		zones  []string
		zone   string
		host   string
	}{
		{
			name:   "root domain",
			domain: "example.com",
			zones:  []string{"example.com"},
			zone:   "example.com",
			host:   "_acme-challenge",
		},
		{
			name:   "subdomain",
			domain: "www.example.com",
			zones:  []string{"example.com"},
			zone:   "example.com",
			host:   "_acme-challenge.www",
		},
		{
			name:   "wildcard",
			domain: "*.example.com",
			zones:  []string{"example.com"},
			zone:   "example.com",
			host:   "_acme-challenge",
		},
		{
			name:   "best matching zone",
			domain: "api.prod.example.com",
			zones:  []string{"example.com", "prod.example.com"},
			zone:   "prod.example.com",
			host:   "_acme-challenge.api",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			plan, err := dnsCertChallengePlan(tt.domain, tt.zones)
			if err != nil {
				t.Fatalf("dnsCertChallengePlan() error = %v", err)
			}
			if plan.Zone != tt.zone {
				t.Fatalf("zone = %q, want %q", plan.Zone, tt.zone)
			}
			if plan.Host != tt.host {
				t.Fatalf("host = %q, want %q", plan.Host, tt.host)
			}
		})
	}
}

func TestDnsNormalizeCertDomainsRejectsInvalidInput(t *testing.T) {
	if _, err := dnsNormalizeCertDomains([]string{"example.com", " *.Example.com ", "example.com"}); err != nil {
		t.Fatalf("dnsNormalizeCertDomains() error = %v", err)
	}
	for _, input := range [][]string{
		{},
		{""},
		{"*.*.example.com"},
		{"bad domain.com"},
		{"_acme-challenge.example.com"},
	} {
		if _, err := dnsNormalizeCertDomains(input); err == nil {
			t.Fatalf("dnsNormalizeCertDomains(%q) returned nil error", input)
		}
	}
}

func TestDnsACMEIssuerPresentsAcceptsAndCleansDNS01(t *testing.T) {
	provider := &fakeDNSProvider{}
	acmeClient := &fakeDNSACMEClient{certDER: testDNSCertDER(t, "www.example.com")}
	issuer := dnsACMEIssuer{
		newClient: func(crypto.Signer, string) dnsACMEClient { return acmeClient },
		sleep:     func(context.Context, time.Duration) error { return nil },
	}

	result, err := issuer.Issue(context.Background(), dnsCertificateIssueRequest{
		Email:            "admin@example.com",
		Domains:          []string{"www.example.com"},
		Zones:            []string{"example.com"},
		Provider:         provider,
		PropagationDelay: time.Second,
	})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}
	if len(provider.added) != 1 {
		t.Fatalf("added records = %d, want 1", len(provider.added))
	}
	if provider.added[0].domain != "example.com" {
		t.Fatalf("added domain = %q", provider.added[0].domain)
	}
	if provider.added[0].record.Host != "_acme-challenge.www" {
		t.Fatalf("added host = %q", provider.added[0].record.Host)
	}
	if provider.added[0].record.Value != "dns-value" {
		t.Fatalf("added value = %q", provider.added[0].record.Value)
	}
	if !acmeClient.accepted {
		t.Fatalf("ACME challenge was not accepted")
	}
	if len(provider.deleted) != 1 || provider.deleted[0] != "rec-1" {
		t.Fatalf("deleted records = %#v", provider.deleted)
	}
	if !strings.Contains(result.CertPEM, "BEGIN CERTIFICATE") {
		t.Fatalf("result cert PEM missing certificate block")
	}
	if !strings.Contains(result.KeyPEM, "BEGIN RSA PRIVATE KEY") {
		t.Fatalf("result key PEM missing RSA private key")
	}
	if result.ExpireAt.IsZero() {
		t.Fatalf("result expireAt is zero")
	}
}

type fakeDNSAdd struct {
	domain string
	record DnsProviderRecord
}

type fakeDNSStatus struct {
	domain   string
	recordID string
	enabled  bool
}

type fakeDNSProvider struct {
	added    []fakeDNSAdd
	updated  []fakeDNSAdd
	deleted  []string
	statuses []fakeDNSStatus
}

func (p *fakeDNSProvider) ProviderName() string { return "fake" }
func (p *fakeDNSProvider) ListDomains(context.Context) ([]string, error) {
	return []string{"example.com"}, nil
}
func (p *fakeDNSProvider) ListRecords(context.Context, string) ([]DnsProviderRecord, error) {
	return nil, nil
}
func (p *fakeDNSProvider) AddRecord(_ context.Context, domain string, record DnsProviderRecord) (string, error) {
	p.added = append(p.added, fakeDNSAdd{domain: domain, record: record})
	return "rec-1", nil
}
func (p *fakeDNSProvider) UpdateRecord(_ context.Context, domain string, record DnsProviderRecord) error {
	p.updated = append(p.updated, fakeDNSAdd{domain: domain, record: record})
	return nil
}
func (p *fakeDNSProvider) DeleteRecord(_ context.Context, _ string, recordID string) error {
	p.deleted = append(p.deleted, recordID)
	return nil
}
func (p *fakeDNSProvider) SetStatus(_ context.Context, domain string, recordID string, enabled bool) error {
	p.statuses = append(p.statuses, fakeDNSStatus{domain: domain, recordID: recordID, enabled: enabled})
	return nil
}

type fakeDNSACMEClient struct {
	accepted bool
	certDER  []byte
}

func (c *fakeDNSACMEClient) Register(context.Context, *acme.Account, func(string) bool) (*acme.Account, error) {
	return &acme.Account{}, nil
}
func (c *fakeDNSACMEClient) AuthorizeOrder(context.Context, []acme.AuthzID, ...acme.OrderOption) (*acme.Order, error) {
	return &acme.Order{URI: "order-url", AuthzURLs: []string{"authz-url"}, FinalizeURL: "finalize-url"}, nil
}
func (c *fakeDNSACMEClient) GetAuthorization(context.Context, string) (*acme.Authorization, error) {
	return &acme.Authorization{
		URI:        "authz-url",
		Status:     acme.StatusPending,
		Identifier: acme.AuthzID{Type: "dns", Value: "www.example.com"},
		Challenges: []*acme.Challenge{{Type: "dns-01", Token: "token", URI: "challenge-url"}},
	}, nil
}
func (c *fakeDNSACMEClient) DNS01ChallengeRecord(string) (string, error) {
	return "dns-value", nil
}
func (c *fakeDNSACMEClient) Accept(context.Context, *acme.Challenge) (*acme.Challenge, error) {
	c.accepted = true
	return &acme.Challenge{Type: "dns-01", Status: acme.StatusValid}, nil
}
func (c *fakeDNSACMEClient) WaitAuthorization(context.Context, string) (*acme.Authorization, error) {
	return &acme.Authorization{Status: acme.StatusValid}, nil
}
func (c *fakeDNSACMEClient) WaitOrder(context.Context, string) (*acme.Order, error) {
	return &acme.Order{URI: "order-url", Status: acme.StatusReady, FinalizeURL: "finalize-url"}, nil
}
func (c *fakeDNSACMEClient) CreateOrderCert(context.Context, string, []byte, bool) ([][]byte, string, error) {
	return [][]byte{c.certDER}, "cert-url", nil
}

func testDNSCertDER(t *testing.T, domain string) []byte {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().Add(-time.Minute)
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		NotBefore:    now,
		NotAfter:     now.Add(90 * 24 * time.Hour),
		DNSNames:     []string{domain},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return der
}
