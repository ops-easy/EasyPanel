import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Pod terminal full-screen entry stays inside the SPA instead of opening a new browser tab", () => {
  const podDetail = read("../src/features/cluster/pages/ClusterPodDetail.tsx");

  assert.doesNotMatch(podDetail, /target="_blank"/);
  assert.match(podDetail, /<Link\s+to=\{clusterPodTerminalHref\(namespace, podName, c\.name\)\}/);
  assert.match(podDetail, /Maximize2/);
});

test("internal operation links use forward navigation icons instead of external-link affordances", () => {
  for (const path of [
    "../src/features/baota/pages/BaotaDashboard.tsx",
    "../src/features/dns/pages/DnsDomains.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /ExternalLink/);
    assert.match(source, /ArrowRight/);
  }
});

test("core operations guidance avoids placeholder-era copy", () => {
  const bastionAdmin = read("../src/features/vcenter/pages/VCenterBastionAdmin.tsx");
  const ikuaiWorkspace = read("../src/features/network/ikuai/pages/IkuaiWorkspace.tsx");
  const source = `${bastionAdmin}\n${ikuaiWorkspace}`;

  assert.doesNotMatch(source, /占位|占位示例|空映射占位/);
  assert.match(bastionAdmin, /填写格式/);
  assert.match(ikuaiWorkspace, /网络终端视图/);
});
