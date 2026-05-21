import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const navSource = read("../src/features/app-center/layout/appCenterNavigation.ts");
const sidebarSource = read("../src/shared/layout/Sidebar.tsx");
const dashboardSource = read("../src/features/app-center/layout/AppCenterDashboard.tsx");
const bootstrapSource = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap.tsx");
const listSource = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVm.tsx");
const detailSource = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVmDetail.tsx");
const terminalSource = read("../src/features/app-center/cloudvm/components/CloudVmSshTerminalSheet.tsx");
const openClawSource = read("../src/features/app-center/openclaw/pages/AppCenterOpenClaw.tsx");
const openClawDetailSource = read("../src/features/app-center/openclaw/pages/AppCenterOpenClawDetail.tsx");
const guideSource = read("../src/shared/layout/UserGuideSheet.tsx");
const cloudVmGuideSource = read("../../api/common/core/default_guides/cloud-vm.md");

const CONTAINER_HOST = "\u5bb9\u5668\u4e3b\u673a";
const CLOUD_HOST = "\u4e91\u4e3b\u673a";

function assertDoesNotIncludeAny(source, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(!source.includes(phrase), `${label} should not include: ${phrase}`);
  }
}

test("app center Cloud VM user-facing name is consistently container host", () => {
  assert.match(navSource, /to:\s*"\/cluster\/apps\/cloud-vm"[\s\S]*label:\s*"\u5bb9\u5668\u4e3b\u673a"/);
  assert.match(navSource, /to:\s*"\/cluster\/apps\/cloud-vm"[\s\S]*sidebarLabel:\s*"\u5bb9\u5668\u4e3b\u673a"/);
  assert.doesNotMatch(navSource, /label:\s*"\u4e91\u4e3b\u673a"|sidebarLabel:\s*"\u4e91\u4e3b\u673a"/);

  assert.match(sidebarSource, /APP_CENTER_MODULE_NAV_ITEMS\.map/);
  assert.doesNotMatch(sidebarSource, /to="\/cluster\/apps\/cloud-vm"[\s\S]{0,260}<span>\u4e91\u4e3b\u673a<\/span>/);

  for (const [label, source] of [
    ["dashboard", dashboardSource],
    ["bootstrap", bootstrapSource],
    ["list", listSource],
    ["detail", detailSource],
    ["terminal", terminalSource],
  ]) {
    assert.ok(source.includes(CONTAINER_HOST), `${label} should include ${CONTAINER_HOST}`);
    assertDoesNotIncludeAny(
      source,
      [
        `\u5e94\u7528\u4e2d\u5fc3 \u00b7 ${CLOUD_HOST}`,
        `\u8fd4\u56de${CLOUD_HOST}`,
        `${CLOUD_HOST}\u955c\u50cf`,
        `\u521b\u5efa${CLOUD_HOST}`,
        `${CLOUD_HOST} SSH`,
        `\u5220\u9664\u8be5${CLOUD_HOST}`,
      ],
      label
    );
  }

  assert.ok(openClawSource.includes(`\u51fa\u7ad9${CONTAINER_HOST}`));
  assert.ok(openClawDetailSource.includes(`\u51fa\u7ad9${CONTAINER_HOST}`));
  assertDoesNotIncludeAny(
    openClawSource,
    [
      `\u51fa\u7ad9${CLOUD_HOST}`,
      `\u52a0\u8f7d${CLOUD_HOST}\u5217\u8868`,
      `\u5f53\u524d\u65e0\u5e26 Hysteria2 \u5ba2\u6237\u7aef\u7684${CLOUD_HOST}`,
    ],
    "openclaw list"
  );
  assertDoesNotIncludeAny(
    openClawDetailSource,
    [`\u51fa\u7ad9${CLOUD_HOST}`, `\u767b\u8bb0\u7684${CLOUD_HOST} Pod`],
    "openclaw detail"
  );

  assert.ok(guideSource.includes("/api/docs/guides/resolve?path="));
  assert.ok(guideSource.includes("OpenClawChatMarkdown"));
  assert.ok(cloudVmGuideSource.includes(CONTAINER_HOST));
  assert.ok(!cloudVmGuideSource.includes(CLOUD_HOST));
  assertDoesNotIncludeAny(
    guideSource,
    [
      `\u5e94\u7528\u4e2d\u5fc3 \u00b7 ${CLOUD_HOST}`,
      `${CLOUD_HOST}\u672c\u8d28\u662f\u96c6\u7fa4\u91cc\u7684\u4e00\u4e2a Pod`,
      `\u51fa\u7ad9${CLOUD_HOST}`,
    ],
    "user guide"
  );
});
