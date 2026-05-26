import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const legacyKubeName = ["kube", "bt", "sync"].join("-");
const legacyShortName = ["kube", "bt"].join("-");
const legacyEnvPrefix = ["KUBE", "BT_"].join("");
const legacyCompactName = ["kube", "bt"].join("");
const legacyAncestorName = ["Auto", "Ops"].join("");

const read = (path) => readFileSync(resolve(root, path), "utf8");
const trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const publicTextFiles = [
  "README.md",
  "AGENT.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "LICENSE",
  "makefile",
  "api/Dockerfile",
  "api/go.mod",
  "web/README.md",
  "web/Dockerfile",
  "web/package.json",
  "web/package-lock.json",
  "web/deploy/nginx.conf",
  ".github/workflows/ci.yml",
  ".github/workflows/publish-images.yml",
  ...trackedFiles.filter((path) => path.startsWith("docs/") && path.endsWith(".md")),
  ...trackedFiles.filter((path) => path.startsWith("k8s/") && (/\.(md|ya?ml|tpl|txt)$/.test(path) || path.endsWith("Chart.yaml"))),
].filter((path) => existsSync(resolve(root, path)));

test("public project naming is consistently EasyPanel", () => {
  for (const file of publicTextFiles) {
    const source = read(file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyKubeName}\\b`, "i"), file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyShortName}\\b`, "i"), file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyEnvPrefix}`, "i"), file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyCompactName}\\b`, "i"), file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyAncestorName}\\b`), file);
  }
});

test("repository, package, image, and chart names use canonical EasyPanel names", () => {
  assert.match(read("README.md"), /https:\/\/github\.com\/ops-easy\/EasyPanel\.git/);
  assert.match(read("api/go.mod"), /^module github\.com\/ops-easy\/EasyPanel\/api$/m);
  assert.equal(JSON.parse(read("web/package.json")).name, "easypanel-web");
  assert.equal(JSON.parse(read("web/package-lock.json")).name, "easypanel-web");
  assert.equal(existsSync(resolve(root, "k8s/charts/easypanel/Chart.yaml")), true);
  assert.equal(existsSync(resolve(root, `k8s/charts/${legacyKubeName}/Chart.yaml`)), false);
  assert.match(read("k8s/charts/easypanel/Chart.yaml"), /^name: easypanel$/m);
  assert.match(read(".github/workflows/publish-images.yml"), /image: easypanel-api/);
  assert.match(read(".github/workflows/publish-images.yml"), /image: easypanel-web/);
});
