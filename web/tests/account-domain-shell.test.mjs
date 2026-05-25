import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const appLayoutSource = read("../src/shared/layout/AppLayout.tsx");
const accountRoutesSource = read("../src/app/routes/account-routes.tsx");

function routeLiteral(route) {
  return route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const accountRoutes = [...accountRoutesSource.matchAll(/withBase\(basePath, "([^"]+)"\)/g)].map(
  ([, path]) => `/account/${path}`
);

const shellExpression = appLayoutSource.match(/const isAccountStandaloneShell =([\s\S]*?);/)?.[1] ?? "";

function shellCoversAccountRoute(route) {
  return shellExpression.includes(`"${route}"`) || /pathname\.startsWith\("\/account\/"\)/.test(shellExpression);
}

test("account domain routes share the standalone shell without the workspace sidebar", () => {
  assert.deepEqual(accountRoutes, [
    "/account/settings",
    "/account/personal",
    "/account/users",
    "/account/audit",
    "/account/site-stats",
  ]);

  for (const route of accountRoutes) {
    assert.equal(shellCoversAccountRoute(route), true, `${route} is not covered by the account standalone shell`);
  }

  assert.match(
    appLayoutSource,
    /!\(isDocsShell \|\| isBastionShell \|\| isAccountStandaloneShell\) && !hideAppChrome \? <Sidebar \/> : null/
  );

  assert.doesNotMatch(shellExpression, /\/cluster\//);
  assert.match(appLayoutSource, new RegExp(`"${routeLiteral("/account")}"|pathname\\.startsWith\\("\\/account\\/`));
});
