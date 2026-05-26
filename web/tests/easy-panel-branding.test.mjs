import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("default product branding is EasyPanel on visible surfaces", () => {
  const cases = [
    ["../index.html", /<title>EasyPanel<\/title>/],
    ["../src/app/shell/BrandingEffect.tsx", /: "EasyPanel"/],
    ["../src/shared/layout/Sidebar.tsx", /\|\| "EasyPanel"/],
    ["../src/shared/layout/AppLayoutMobile.tsx", />EasyPanel<\/span>/],
    ["../src/pages/Login.tsx", /alt="EasyPanel"/],
    ["../public/brand-logo.svg", /<title id="title">EasyPanel<\/title>/],
    ["../../README.md", /^# EasyPanel/m],
  ];

  for (const [path, pattern] of cases) {
    assert.match(read(path), pattern, path);
  }
});

