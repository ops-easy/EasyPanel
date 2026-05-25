import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const navSource = read("../src/features/app-center/layout/appCenterNavigation.ts");
const subNavSource = read("../src/features/app-center/layout/AppCenterSubNav.tsx");
const sidebarSource = read("../src/shared/layout/Sidebar.tsx");
const dashboardSource = read("../src/features/app-center/layout/AppCenterDashboard.tsx");
const homeHubSource = read("../src/pages/HomeHub.tsx");

const appCenterOrder = [
  "/cluster/apps/dashboard",
  "/cluster/apps/redis",
  "/cluster/apps/kafka",
  "/cluster/apps/opensearch",
  "/cluster/apps/dns",
  "/cluster/apps/cloud-vm",
  "/cluster/apps/openclaw",
  "/cluster/apps/hermes",
];

function assertInOrder(source, needles, message) {
  let previous = -1;
  for (const needle of needles) {
    const current = source.indexOf(needle);
    assert.ok(current >= 0, `${message}: missing ${needle}`);
    assert.ok(current > previous, `${message}: ${needle} is out of order`);
    previous = current;
  }
}

test("app center shared navigation defines the canonical module order", () => {
  assertInOrder(navSource, appCenterOrder, "shared navigation");
});

test("app center top navigation consumes the shared module order", () => {
  assert.match(subNavSource, /APP_CENTER_NAV_ITEMS\.map/);
  assert.match(subNavSource, /isAppCenterNavItemActive/);
  assert.doesNotMatch(subNavSource, /const\s+links\s*=\s*\[/);
});

test("app center sidebar consumes the same shared module order", () => {
  assert.match(sidebarSource, /APP_CENTER_MODULE_NAV_ITEMS\.map/);
  assert.match(sidebarSource, /isAppCenterNavItemActive/);
  assert.doesNotMatch(sidebarSource, /appCenterRedisActive|appCenterKafkaActive|appCenterOpenSearchActive/);
});

test("app center dashboard quick entries and resource cards follow the same module order", () => {
  const quickEntries = dashboardSource.slice(dashboardSource.indexOf("flex flex-wrap gap-2"));
  assertInOrder(quickEntries, appCenterOrder.slice(1), "dashboard quick entries");

  const resourceCards = dashboardSource.slice(dashboardSource.indexOf("\u5df2\u7eb3\u7ba1\u8d44\u6e90"));
  assertInOrder(
    resourceCards,
    [
      "Redis \u5b9e\u4f8b",
      "Kafka \u5b9e\u4f8b",
      "OpenSearch \u5b9e\u4f8b",
      "DNS \u670d\u52a1\u5546\u8d26\u53f7",
      "\u6258\u7ba1\u57df\u540d",
      "\u5bb9\u5668\u4e3b\u673a\u5b9e\u4f8b",
      "OpenClaw \u7f51\u5173",
      "Hermes Agent",
    ],
    "dashboard resource cards"
  );
});

test("workbench app center card uses the same compact module order", () => {
  const appCenterCard = homeHubSource.slice(homeHubSource.indexOf("{showAppCenter && ("));
  assertInOrder(
    appCenterCard,
    ["Redis", "Kafka", "OpenSearch", "DNS", "\u5bb9\u5668\u4e3b\u673a", "OpenClaw", "Hermes"],
    "workbench app center card"
  );
});

test("OpenClaw bootstrap page relies on app center navigation instead of an extra back link", () => {
  const bootstrapSource = read("../src/features/app-center/openclaw/pages/AppCenterOpenClawBootstrap.tsx");

  assert.doesNotMatch(bootstrapSource, /返回 OpenClaw/);
  assert.doesNotMatch(bootstrapSource, /ArrowLeft/);
});

test("container host bootstrap page relies on app center navigation instead of an extra back link", () => {
  const bootstrapSource = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap.tsx");

  assert.doesNotMatch(bootstrapSource, /返回容器主机/);
  assert.doesNotMatch(bootstrapSource, /ArrowLeft/);
});
