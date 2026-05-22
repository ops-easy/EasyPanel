import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const desktopLayoutSource = read("../src/shared/layout/AppLayout.tsx");
const mobileLayoutSource = read("../src/shared/layout/AppLayoutMobile.tsx");
const clusterLayoutSource = read("../src/features/cluster/pages/ClusterLayout.tsx");
const vcenterRoutesSource = read("../src/app/routes/vcenter-routes.tsx");
const bastionLayoutSource = read("../src/features/bastion/pages/BastionLayout.tsx");
const bastionHomeSource = read("../src/features/bastion/pages/BastionConsoleHome.tsx");
const headerSource = read("../src/shared/layout/Header.tsx");
const globalSearchSource = read("../src/shared/layout/GlobalSearchBar.tsx");
const userGuideSource = read("../src/shared/layout/UserGuideSheet.tsx");

test("bastion module home keeps the main app chrome", () => {
  for (const source of [desktopLayoutSource, mobileLayoutSource]) {
    assert.doesNotMatch(source, /pathname\.startsWith\("\/cluster\/bastion\/"\)/);
    assert.match(source, /pathname === "\/cluster\/bastion\/session"/);
    assert.match(source, /pathname\.startsWith\("\/cluster\/bastion\/session\/"\)/);
    assert.match(source, /pathname\.startsWith\("\/cluster\/bastion\/console\/"\)/);
    assert.match(source, /hideAppChrome = isPodTerminalShell \|\| isBastionFullBleed/);
  }
});

test("cluster layout lets the whole bastion workspace own the full dark canvas", () => {
  assert.match(clusterLayoutSource, /const isBastionWorkspace =/);
  assert.match(clusterLayoutSource, /pathname === "\/cluster\/bastion"/);
  assert.match(clusterLayoutSource, /pathname\.startsWith\("\/cluster\/bastion\/"\)/);
  assert.match(clusterLayoutSource, /pathname === "\/cluster\/bastion\/session"/);
  assert.match(clusterLayoutSource, /pathname\.startsWith\("\/cluster\/bastion\/session\/"\)/);
  assert.match(clusterLayoutSource, /pathname\.startsWith\("\/cluster\/bastion\/console\/"\)/);
  assert.match(clusterLayoutSource, /isBastionWorkspace && "h-full min-h-0 max-w-none px-0 pb-0"/);
});

test("bastion module home keeps the top shell, full-width canvas, and console home", () => {
  assert.match(desktopLayoutSource, /const isBastionShell =/);
  assert.match(desktopLayoutSource, /const appChromeDark = isBastionShell && !hideAppChrome;/);
  assert.match(desktopLayoutSource, /pathname === "\/cluster\/bastion"/);
  assert.match(desktopLayoutSource, /pathname === "\/cluster\/bastion\/"/);
  assert.match(desktopLayoutSource, /!\(isDocsShell \|\| isBastionShell\) && !hideAppChrome \? <Sidebar \/> : null/);
  assert.match(desktopLayoutSource, /<Header tone=\{appChromeDark \? "dark" : "light"\} \/>/);
  assert.match(desktopLayoutSource, /<UserGuideSheet tone=\{appChromeDark \? "dark" : "light"\} \/>/);
  assert.match(desktopLayoutSource, /appChromeDark \? "bg-\[#0c0f14\]" : "bg-\[#F1F5F9\]"/);
  assert.match(desktopLayoutSource, /appChromeDark \|\| isPodTerminalShell \|\| isBastionFullBleed/);

  assert.match(vcenterRoutesSource, /BastionConsoleHome/);
  assert.doesNotMatch(vcenterRoutesSource, /<Route index element=\{null\} \/>/);
  assert.doesNotMatch(vcenterRoutesSource, /<Route index element=\{<Navigate to="session" replace \/>} \/>/);
  assert.match(vcenterRoutesSource, /<BastionConsoleHome \/>/);
  assert.match(bastionLayoutSource, /bg-\[#0c0f14\]/);
  assert.match(bastionHomeSource, /max-w-\[min\(100%,92rem\)\]/);
  assert.doesNotMatch(bastionHomeSource, /max-w-4xl/);
});

test("bastion top chrome uses dark controls instead of white islands", () => {
  assert.match(headerSource, /type HeaderProps =/);
  assert.match(headerSource, /tone\?: "light" \| "dark"/);
  assert.match(headerSource, /const isDark = tone === "dark";/);
  assert.match(headerSource, /<GlobalSearchBar tone=\{tone\} \/>/);
  assert.match(headerSource, /isDark \? "border-slate-800 bg-\[#0c0f14\] text-slate-100" : "border-\[#E2E8F0\] bg-white"/);

  assert.match(globalSearchSource, /type GlobalSearchBarProps =/);
  assert.match(globalSearchSource, /const isDark = tone === "dark";/);
  assert.match(globalSearchSource, /isDark\s*\?\s*"border border-slate-800 bg-\[#111820\] text-slate-100/);

  assert.match(userGuideSource, /type UserGuideSheetProps =/);
  assert.match(userGuideSource, /const isDark = tone === "dark";/);
  assert.match(userGuideSource, /isDark\s*\?\s*"border-slate-800 bg-slate-900 text-slate-100/);
});
