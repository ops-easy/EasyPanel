import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const backendHandlers = read("../../backend/api/dns/controller/handlers.go");

test("DNS write routes are guarded by the confirmation middleware before handlers run", () => {
  for (const route of [
    'g.POST("/accounts", dnsMutationConfirmMiddleware("DNS account create")',
    'g.PUT("/accounts/:id", dnsMutationConfirmMiddleware("DNS account update")',
    'g.DELETE("/accounts/:id", dnsMutationConfirmMiddleware("DNS account delete")',
    'g.POST("/accounts/:id/sync-domains", dnsMutationConfirmMiddleware("DNS account domain sync")',
    'g.POST("/domains", dnsMutationConfirmMiddleware("DNS domain create")',
    'g.PUT("/domains/:id", dnsMutationConfirmMiddleware("DNS domain update")',
    'g.DELETE("/domains/:id", dnsMutationConfirmMiddleware("DNS domain delete")',
    'g.POST("/domains/:id/records/sync", dnsMutationConfirmMiddleware("DNS record sync")',
    'g.POST("/domains/:id/records", dnsMutationConfirmMiddleware("DNS record create")',
    'g.PUT("/domains/:id/records/:rid", dnsMutationConfirmMiddleware("DNS record update")',
    'g.DELETE("/domains/:id/records/:rid", dnsMutationConfirmMiddleware("DNS record delete")',
    'g.POST("/domains/:id/records/:rid/status", dnsMutationConfirmMiddleware("DNS record status update")',
    'g.POST("/failover", dnsMutationConfirmMiddleware("DNS failover create")',
    'g.PUT("/failover/:id", dnsMutationConfirmMiddleware("DNS failover update")',
    'g.DELETE("/failover/:id", dnsMutationConfirmMiddleware("DNS failover delete")',
    'g.POST("/failover/:id/check", dnsMutationConfirmMiddleware("DNS failover manual check")',
    'g.POST("/scheduled", dnsMutationConfirmMiddleware("DNS scheduled task create")',
    'g.DELETE("/scheduled/:id", dnsMutationConfirmMiddleware("DNS scheduled task delete")',
    'g.POST("/certs", dnsMutationConfirmMiddleware("DNS certificate order create")',
    'g.DELETE("/certs/:id", dnsMutationConfirmMiddleware("DNS certificate order delete")',
    'g.POST("/certs/:id/apply", dnsMutationConfirmMiddleware("DNS certificate apply")',
    'g.PATCH("/certs/:id/baota", dnsMutationConfirmMiddleware("DNS certificate Baota settings update")',
    'g.POST("/certs/:id/push-baota", dnsMutationConfirmMiddleware("DNS certificate push to Baota")',
  ]) {
    assert.ok(backendHandlers.includes(route), `missing confirmation middleware for ${route}`);
  }
  assert.match(backendHandlers, /g\.POST\("\/accounts\/:id\/test", func/);
  assert.doesNotMatch(backendHandlers, /g\.POST\("\/accounts\/:id\/test", dnsMutationConfirmMiddleware/);
});

test("DNS frontend mutations send explicit confirmation semantics", () => {
  const helper = read("../src/features/dns/lib/dnsMutationConfirm.ts");
  const pages = {
    accounts: read("../src/features/dns/pages/DnsAccounts.tsx"),
    domains: read("../src/features/dns/pages/DnsDomains.tsx"),
    records: read("../src/features/dns/pages/DnsRecords.tsx"),
    failover: read("../src/features/dns/pages/DnsFailover.tsx"),
    scheduled: read("../src/features/dns/pages/DnsScheduled.tsx"),
    certs: read("../src/features/dns/pages/DnsCerts.tsx"),
  };

  assert.match(helper, /withDnsMutationConfirm/);
  assert.match(helper, /withDnsMutationConfirmQuery/);
  assert.doesNotMatch(helper, /window\.confirm/);
  assert.doesNotMatch(helper, /confirmDnsMutation/);

  for (const [name, source] of Object.entries(pages)) {
    assert.match(source, /ConfirmActionButton/, `${name} must use the platform confirmation dialog`);
    assert.match(source, /withDnsMutationConfirm/);
    assert.match(source, /dnsMutationConfirm/);
    assert.doesNotMatch(source, /confirmDnsMutation/, `${name} must not use the native confirm helper`);
    assert.doesNotMatch(source, /window\.confirm|\bconfirm\s*\(/, `${name} must not use native browser confirm`);
  }

  assert.match(pages.accounts, /withDnsMutationConfirmQuery\(`\/api\/dns\/accounts\/\$\{id\}`\)/);
  assert.match(pages.domains, /withDnsMutationConfirmQuery\(`\/api\/dns\/domains\/\$\{id\}`\)/);
  assert.match(pages.records, /withDnsMutationConfirmQuery\(`\/api\/dns\/domains\/\$\{selectedDomainId\}\/records\/\$\{r\.id\}`\)/);
  assert.match(pages.failover, /withDnsMutationConfirmQuery\(`\/api\/dns\/failover\/\$\{id\}`\)/);
  assert.match(pages.scheduled, /withDnsMutationConfirmQuery\(`\/api\/dns\/scheduled\/\$\{id\}`\)/);
  assert.match(pages.certs, /withDnsMutationConfirmQuery\(`\/api\/dns\/certs\/\$\{id\}`\)/);

  assert.match(pages.records, /records\/\$\{r\.id\}\/status`[\s\S]*withDnsMutationConfirm\(\{ enabled: r\.status === 0 \}\)/);
  assert.match(pages.failover, /failover\/\$\{id\}\/check`[\s\S]*withDnsMutationConfirm\(\{\}\)/);
  assert.match(pages.certs, /certs\/\$\{id\}\/apply`[\s\S]*withDnsMutationConfirm\(\{\}\)/);
});
