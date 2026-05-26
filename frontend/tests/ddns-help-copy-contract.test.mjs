import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(path, import.meta.url));

const ddnsHelpPath = "../src/lib/ddns-help.ts";
const setupSource = read("../src/pages/Setup.tsx");
const baotaWizardSource = read("../src/features/baota/components/BaotaSettingsWizard.tsx");
const publishIngressSource = read("../src/features/cluster/components/PublishIngress.tsx");
const ingressFormSource = read("../src/features/cluster/components/IngressGraphicalForm.tsx");
const readmeSource = read("../../README.md");

test("DDNS copy is centralized for the setup, baota, and ingress flows", () => {
  assert.equal(exists(ddnsHelpPath), true, "DDNS help copy module should exist");
  const ddnsHelpSource = read(ddnsHelpPath);

  for (const phrase of [
    "ddnsHost",
    "ddns-port",
    "ddns-scheme",
    "默认回源",
    "单条 Ingress",
    "HTTP + ddnsHost + defaultPort",
    "HTTPS + HTTPS 入口端口",
  ]) {
    assert.equal(ddnsHelpSource.includes(phrase), true, phrase);
  }

  for (const source of [setupSource, baotaWizardSource, publishIngressSource, ingressFormSource]) {
    assert.match(source, /@\/lib\/ddns-help/);
  }
});

test("README explains DDNS defaults and per-Ingress annotation overrides", () => {
  for (const phrase of [
    "### DDNS 回源与覆盖规则",
    "ddnsHost",
    "ddns-port",
    "ddns-scheme",
    "默认：HTTP + DEFAULT_PORT",
    "开启宝塔 HTTPS",
    "只影响单条 Ingress",
  ]) {
    assert.equal(readmeSource.includes(phrase), true, phrase);
  }
});
