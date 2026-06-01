import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("runtime settings save delegates Harbor index refresh to the Harbor service", () => {
  const settingsRoutes = read("../../backend/api/settings/service/routes.go");
  const coreSettingsRoutes = read("../../backend/common/core/settings_routes.go");
  const runtimeHandlers = read("../../backend/common/core/settings_runtime_handlers.go");
  const harborWorker = read("../../backend/api/harbor/service/index_worker.go");
  const harborHandlers = read("../../backend/api/harbor/service/handlers.go");
  const harborRefresh = read("../../backend/api/harbor/service/index_refresh.go");

  assert.match(settingsRoutes, /backend\/api\/harbor\/service/);
  assert.match(settingsRoutes, /MountSettingsRoutesWithHooks/);
  assert.match(settingsRoutes, /InvalidateHarborCache:\s*harborsvc\.HarborCacheBustGen/);
  assert.match(settingsRoutes, /RefreshHarborIndex:\s*harborsvc\.HarborIndexRefreshOnce/);
  assert.match(settingsRoutes, /HarborIndexTimeout:\s*harborsvc\.HarborIndexCrawlTimeout/);

  assert.match(coreSettingsRoutes, /type RuntimeSettingsHooks struct/);
  assert.match(runtimeHandlers, /hooks\.InvalidateHarborCache/);
  assert.match(runtimeHandlers, /hooks\.RefreshHarborIndex/);
  assert.doesNotMatch(runtimeHandlers, /HarborCacheBustGen\(context\.Background\(\),\s*app\)/);
  assert.doesNotMatch(runtimeHandlers, /HarborIndexRefreshOnce\(ctx,\s*a\)/);
  assert.doesNotMatch(runtimeHandlers, /harborIndexCrawlTimeoutSec\(\)/);

  assert.match(harborWorker, /func HarborIndexCrawlTimeout\(\) time\.Duration/);
  assert.match(harborHandlers, /context\.WithTimeout\(context\.Background\(\),\s*HarborIndexCrawlTimeout\(\)\)/);
  assert.match(harborRefresh, /context\.WithTimeout\(context\.Background\(\),\s*HarborIndexCrawlTimeout\(\)\)/);
  assert.doesNotMatch(harborHandlers, /harborIndexCrawlTimeoutSec\(\)\s*\*\s*time\.Second/);
  assert.doesNotMatch(harborRefresh, /harborIndexCrawlTimeoutSec\(\)\s*\*\s*time\.Second/);
});
