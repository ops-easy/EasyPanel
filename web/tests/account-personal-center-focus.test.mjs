import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const personalCenterSource = read("../src/features/account/pages/AccountPersonalCenter.tsx");
const appLayoutSource = read("../src/shared/layout/AppLayout.tsx");

test("account personal center hides the workspace sidebar on desktop", () => {
  assert.match(
    appLayoutSource,
    /const isAccountStandaloneShell =[\s\S]*pathname === "\/account"[\s\S]*pathname\.startsWith\("\/account\/"\);/
  );
  assert.match(
    appLayoutSource,
    /!\(isDocsShell \|\| isBastionShell \|\| isAccountStandaloneShell\) && !hideAppChrome \? <Sidebar \/> : null/
  );
});

test("my resources use the shared workspace visibility model", () => {
  assert.match(personalCenterSource, /workspaceMenuVisible/);
  assert.match(personalCenterSource, /type PersonalResourceEntry/);
  assert.match(personalCenterSource, /const resourceEntries: PersonalResourceEntry\[\] =/);
  assert.match(personalCenterSource, /resourceEntries\.filter\(\(entry\) => workspaceMenuVisible\(perm, entry\.key, role\)\)/);
  assert.match(personalCenterSource, /visibleResources\.length === 0/);

  for (const key of ["kubernetes", "compute", "network", "baota", "appcenter", "bastion", "aiinspect", "docs"]) {
    assert.match(personalCenterSource, new RegExp(`key:\\s*"${key}"`));
  }

  assert.doesNotMatch(personalCenterSource, /menuItemVisible\(perm, "aiInspect"/);
  assert.doesNotMatch(personalCenterSource, /showRedis|showCloudVm/);
  assert.doesNotMatch(personalCenterSource, /to="\/cluster\/apps\/redis"|to="\/cluster\/apps\/cloud-vm"/);
});
