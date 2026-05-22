import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(path, import.meta.url));

const wizardPath = "../src/features/baota/components/BaotaSettingsWizard.tsx";
const runtimeSource = read("../src/features/settings/components/SettingsRuntimeSection.tsx");
const clusterSettingsSource = read("../src/features/cluster/pages/ClusterK8sSettings.tsx");

test("宝塔设置使用常驻接入向导组织主流程", () => {
  assert.equal(exists(wizardPath), true, "BaotaSettingsWizard.tsx should exist");
  const wizardSource = read(wizardPath);

  for (const label of ["接入向导", "面板接入", "同步策略", "HTTPS 证书", "高级配置", "刷新状态"]) {
    assert.match(wizardSource, new RegExp(label));
  }

  assert.match(runtimeSource, /BaotaSettingsWizard/);
  assert.match(runtimeSource, /v === "baota"[\s\S]*<BaotaSettingsWizard/);
});

test("宝塔向导保留多实例能力但不承载 ingress-nginx 安装参数", () => {
  assert.equal(exists(wizardPath), true, "BaotaSettingsWizard.tsx should exist");
  const wizardSource = read(wizardPath);

  assert.match(wizardSource, /多宝塔实例/);
  assert.match(wizardSource, /添加实例/);
  assert.match(wizardSource, /默认实例/);
  assert.match(wizardSource, /跳过 TLS 校验/);

  for (const field of [
    "ingressNginxHostHttpPort",
    "ingressNginxHostHttpsPort",
    "ingressNginxControllerNodeName",
    "ingressNginxManifestUrl",
    "k8sAddonsManifestMirror",
  ]) {
    assert.doesNotMatch(wizardSource, new RegExp(field));
  }
});

test("ingress-nginx 参数仍在集群设置语境中维护", () => {
  for (const field of [
    "ingressNginxHostHttpPort",
    "ingressNginxHostHttpsPort",
    "ingressNginxControllerNodeName",
    "ingressNginxManifestUrl",
    "k8sAddonsManifestMirror",
  ]) {
    assert.match(runtimeSource, new RegExp(field));
  }

  assert.match(clusterSettingsSource, /宝塔设置页只维护宝塔接入与同步策略/);
});
