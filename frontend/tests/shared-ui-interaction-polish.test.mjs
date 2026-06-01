import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const srcRoot = new URL("../src/", import.meta.url);

function listSourceFiles(dirUrl = srcRoot) {
  return readdirSync(dirUrl, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) return listSourceFiles(child);
    if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) return [];
    return [child];
  });
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

test("shared interactive primitives use pointer affordance instead of default cursor", () => {
  const button = read("../src/shared/ui/button.tsx");
  assert.match(button, /cursor-pointer/);
  assert.match(button, /disabled:pointer-events-none/);

  for (const path of [
    "../src/shared/ui/dropdown-menu.tsx",
    "../src/shared/ui/context-menu.tsx",
    "../src/shared/ui/menubar.tsx",
    "../src/shared/ui/command.tsx",
    "../src/shared/ui/select.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /cursor-pointer/, `${path} should expose a pointer cursor for interactive rows`);
    assert.doesNotMatch(source, /cursor-default/, `${path} should not make clickable rows feel inert`);
  }
});

test("global native controls inherit professional cursor semantics", () => {
  const css = read("../src/index.css");

  assert.match(css, /button:not\(:disabled\)/);
  assert.match(css, /\[role="button"\]:not\(\[aria-disabled="true"\]\)/);
  assert.match(css, /input\[type="checkbox"\]:not\(:disabled\)/);
  assert.match(css, /input\[type="radio"\]:not\(:disabled\)/);
  assert.match(css, /select:not\(:disabled\)/);
  assert.match(css, /summary/);
  assert.match(css, /cursor:\s*pointer/);
  assert.match(css, /button:disabled/);
  assert.match(css, /select:disabled/);
  assert.match(css, /\[aria-disabled="true"\]/);
  assert.match(css, /cursor:\s*not-allowed/);
});

test("native buttons declare an explicit type", () => {
  const offenders = [];
  for (const file of listSourceFiles()) {
    if (!statSync(file).isFile()) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<button\b[\s\S]*?>/g)) {
      if (!/\btype=/.test(match[0])) {
        offenders.push(`${file.pathname.replace(srcRoot.pathname, "src/")}:${lineOf(source, match.index ?? 0)}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("main shell raw controls keep clear click and navigation semantics", () => {
  const mobile = read("../src/shared/layout/AppLayoutMobile.tsx");
  const header = read("../src/shared/layout/Header.tsx");
  const search = read("../src/shared/layout/GlobalSearchBar.tsx");
  const notifications = read("../src/shared/layout/HeaderNotificationsSheet.tsx");
  const login = read("../src/pages/Login.tsx");

  assert.match(mobile, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(mobile, /aria-label=\{`打开账户菜单：\$\{status\?\.username \?\? "未命名用户"\}`\}/);
  assert.match(mobile, /cursor-pointer/);

  assert.match(header, /aria-label=\{`打开账户菜单：\$\{displayName\}`\}/);
  assert.match(header, /cursor-pointer/);

  assert.match(search, /cursor-pointer/);
  assert.match(notifications, /cursor-pointer/);
  assert.match(login, /cursor-pointer/);
});

test("high-frequency operation actions avoid scale-transform click feedback", () => {
  const cloudHosts = read("../src/features/vcenter/pages/CloudHosts.tsx");

  assert.doesNotMatch(cloudHosts, /active:scale|hover:scale|scale-\[/);
  assert.match(cloudHosts, /hover:shadow-lg/);
});

test("dense dashboard controls avoid hover translation motion", () => {
  const computeSettings = read("../src/features/compute/pages/VirtualMachineSettings.tsx");
  const networkDashboard = read("../src/features/network/pages/NetworkDashboard.tsx");

  assert.doesNotMatch(computeSettings, /hover:-?translate-[xy]/);
  assert.doesNotMatch(networkDashboard, /hover:-?translate-[xy]/);
});

test("HTML rendering sinks keep explicit escaping and CSS filtering", () => {
  const chart = read("../src/shared/ui/chart.tsx");
  assert.match(chart, /toChartCssName/);
  assert.match(chart, /isSafeChartColorValue/);
  assert.match(chart, /\[data-chart="\$\{id\}"\]/);
  assert.match(chart, /\[\^a-zA-Z0-9_-\]/);
  assert.match(chart, /url\|expression/);

  const podLogs = read("../src/features/cluster/pages/PodLogsSheet.tsx");
  assert.match(podLogs, /a\.escape_html = true/);
  assert.match(podLogs, /ansiUp\.ansi_to_html\(text\)/);
  assert.match(podLogs, /dangerouslySetInnerHTML=\{\{ __html: logHtml \}\}/);
});

test("shared chart tooltip keeps zero as a real metric value", () => {
  const chart = read("../src/shared/ui/chart.tsx");

  assert.doesNotMatch(chart, /item\.value\s*&&\s*\(/);
  assert.match(chart, /item\.value != null && \(/);
  assert.match(chart, /item\.value\.toLocaleString\(\)/);
});
