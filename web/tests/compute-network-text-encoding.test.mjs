import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const sourceExtensions = new Set([".ts", ".tsx", ".html", ".md", ".css"]);

const suspiciousFragments = [
  [32515, 25120, 31926], // network
  [32510, 23815], // managed
  [38095, 27693, 23257], // virtual
  [28729, 22840, 23500], // host
  [27996, 25116, 23500], // cloud host
  [37739, 8243, 28735], // bastion
  [37804, 26127], // overview
  [37818, 12517, 24411], // interface
  [28729, 12833, 22491, 32468], // client
  [26473, 28852, 24116], // connection
  [37825, 29256, 23873, 23143], // data source
  [37813, 57507, 24383], // scan
  [37924, 25116, 25216], // likely used
  [32460, 27946, 26877], // likely free
  [37912, 33333], // status
].map((codes) => String.fromCharCode(...codes));

const scanEntries = [
  "index.html",
  "README.md",
  "src",
];

const requiredPhrases = new Map([
  [
    "src/features/compute/pages/ComputeDashboard.tsx",
    ["虚拟主机资源中心", "虚拟机、宿主机、存储和任务活动", "打开配置"],
  ],
  [
    "src/features/network/pages/NetworkDashboard.tsx",
    ["网络资源中心", "设备、接口、终端、无线、防火墙和监控", "打开接入设置", "iKuai 数据源", "OpenWrt 接入"],
  ],
  [
    "src/features/compute/pages/PVEPage.tsx",
    ["PVE 纳管", "新增 PVE 目标", "虚拟机与容器", "PVE API 连通"],
  ],
  [
    "src/features/cluster/pages/ToolNetworkIpScan.tsx",
    ["内网工具箱", "空闲 IP 探测", "扫描队列", "结果判定说明"],
  ],
  [
    "src/features/compute/layout/ComputeSubNav.tsx",
    ["总览", "虚拟机 / CT", "宿主机 / 节点", "存储", "配置"],
  ],
  [
    "src/features/network/layout/NetworkSubNav.tsx",
    ["总览", "设备", "接口", "终端", "无线", "防火墙", "监控", "接入设置"],
  ],
  [
    "src/shared/layout/Sidebar.tsx",
    ["虚拟化与主机", "网络设备", "虚拟机 / CT", "宿主机 / 节点", "任务活动"],
  ],
]);

function collectSourceFiles(entry) {
  const abs = resolve(webRoot, entry);
  const stat = statSync(abs);

  if (stat.isFile()) {
    return sourceExtensions.has(extname(abs)) ? [abs] : [];
  }

  return readdirSync(abs, { withFileTypes: true }).flatMap((dirent) => {
    const child = join(abs, dirent.name);
    return dirent.isDirectory() ? collectSourceFiles(relative(webRoot, child)) : collectSourceFiles(relative(webRoot, child));
  });
}

function findMojibakeIssues(source) {
  const issues = [];

  if (source.includes("\uFFFD")) {
    issues.push("contains replacement character");
  }
  if (/[\uE000-\uF8FF]/u.test(source)) {
    issues.push("contains private-use glyphs common in mojibake");
  }
  if (/[ÃÂ][\u0080-\u00ff]/u.test(source)) {
    issues.push("contains Latin-1 style mojibake");
  }

  for (const fragment of suspiciousFragments) {
    if (source.includes(fragment)) {
      issues.push("contains GBK-decoded UTF-8 Chinese fragment");
      break;
    }
  }

  return issues;
}

test("detects common mojibake samples before scanning source files", () => {
  const corruptedNetworkDevice = String.fromCharCode(32515, 25120, 31926, 28729, 24871, 57516);

  assert.notDeepEqual(findMojibakeIssues(corruptedNetworkDevice), []);
});

test("frontend user-facing sources stay valid UTF-8 Chinese", () => {
  const files = [...new Set(scanEntries.flatMap(collectSourceFiles))].sort();
  const failures = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const issues = findMojibakeIssues(source);
    if (issues.length > 0) {
      failures.push(`${relative(webRoot, file)}: ${issues.join(", ")}`);
    }
  }

  assert.deepEqual(failures, []);
});

test("key compute and network labels remain readable Chinese", () => {
  for (const [file, phrases] of requiredPhrases) {
    const source = readFileSync(resolve(webRoot, file), "utf8");

    for (const phrase of phrases) {
      assert.ok(source.includes(phrase), `${file} should include: ${phrase}`);
    }
  }
});
