import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const accountSettingsSource = read("../src/features/account/pages/AccountSettings.tsx");
const appLayoutSource = read("../src/shared/layout/AppLayout.tsx");

test("account settings stays focused on platform configuration", () => {
  for (const route of ["/account/personal", "/account/users", "/account/audit", "/account/site-stats"]) {
    assert.doesNotMatch(accountSettingsSource, new RegExp(`to="${route}"`));
  }

  for (const icon of ["BarChart3", "ChevronRight", "FileText", "UserCircle", "Users"]) {
    assert.doesNotMatch(accountSettingsSource, new RegExp(`\\b${icon}\\b`));
  }
});

test("account settings hides the workspace sidebar on desktop", () => {
  assert.match(
    appLayoutSource,
    /const isAccountStandaloneShell =[\s\S]*pathname === "\/account"[\s\S]*pathname\.startsWith\("\/account\/"\);/
  );
  assert.match(
    appLayoutSource,
    /!\(isDocsShell \|\| isBastionShell \|\| isAccountStandaloneShell\) && !hideAppChrome \? <Sidebar \/> : null/
  );
});
