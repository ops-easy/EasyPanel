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
const upstreamRepositoryURL = `https://github.com/abcdocker/${legacyKubeName}`;

const read = (path) => readFileSync(resolve(root, path), "utf8");
const stripAllowedAttribution = (source) => source.replaceAll(upstreamRepositoryURL, "");
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
  "NOTICE",
  "makefile",
  "backend/Dockerfile",
  "backend/go.mod",
  "frontend/README.md",
  "frontend/Dockerfile",
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/deploy/nginx.conf",
  ".github/workflows/ci.yml",
  ".github/workflows/publish-images.yml",
  ...trackedFiles.filter((path) => path.startsWith("docs/") && path.endsWith(".md")),
  ...trackedFiles.filter((path) => path.startsWith("k8s/") && (/\.(md|ya?ml|tpl|txt)$/.test(path) || path.endsWith("Chart.yaml"))),
].filter((path) => existsSync(resolve(root, path)));

test("project source directories are named frontend and backend", () => {
  assert.equal(existsSync(resolve(root, "backend/go.mod")), true);
  assert.equal(existsSync(resolve(root, "backend/Dockerfile")), true);
  assert.equal(existsSync(resolve(root, "frontend/package.json")), true);
  assert.equal(existsSync(resolve(root, "frontend/Dockerfile")), true);
  assert.equal(existsSync(resolve(root, "api/go.mod")), false);
  assert.equal(existsSync(resolve(root, "web/package.json")), false);
});

test("public project naming is consistently EasyPanel", () => {
  for (const file of publicTextFiles) {
    const source = stripAllowedAttribution(read(file));
    assert.doesNotMatch(source, new RegExp(`\\b${legacyKubeName}\\b`, "i"), file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyShortName}\\b`, "i"), file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyEnvPrefix}`, "i"), file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyCompactName}\\b`, "i"), file);
    assert.doesNotMatch(source, new RegExp(`\\b${legacyAncestorName}\\b`), file);
  }
});

test("README and NOTICE document project origin and licensing", () => {
  assert.match(read("README.md"), new RegExp(upstreamRepositoryURL.replaceAll("/", "\\/")));
  assert.match(read("README.md"), /\[MIT License\]\(\.\/LICENSE\)/);
  assert.match(read("README.md"), /\[NOTICE\]\(\.\/NOTICE\)/);
  assert.match(read("NOTICE"), new RegExp(upstreamRepositoryURL.replaceAll("/", "\\/")));
  assert.match(read("NOTICE"), /MIT License/);
  assert.match(read("NOTICE"), /backend\/go\.mod/);
  assert.match(read("NOTICE"), /frontend\/package-lock\.json/);
});

test("repository, package, image, and chart names use canonical EasyPanel names", () => {
  assert.match(read("README.md"), /https:\/\/github\.com\/ops-easy\/EasyPanel\.git/);
  assert.match(read("backend/go.mod"), /^module github\.com\/ops-easy\/EasyPanel\/backend$/m);
  assert.equal(JSON.parse(read("frontend/package.json")).name, "easypanel-web");
  assert.equal(JSON.parse(read("frontend/package.json")).license, "MIT");
  assert.equal(JSON.parse(read("frontend/package-lock.json")).name, "easypanel-web");
  assert.equal(JSON.parse(read("frontend/package-lock.json")).packages[""].license, "MIT");
  assert.equal(existsSync(resolve(root, "k8s/charts/easypanel/Chart.yaml")), true);
  assert.equal(existsSync(resolve(root, `k8s/charts/${legacyKubeName}/Chart.yaml`)), false);
  assert.match(read("k8s/charts/easypanel/Chart.yaml"), /^name: easypanel$/m);
  assert.match(read(".github/workflows/publish-images.yml"), /image: easypanel-api/);
  assert.match(read(".github/workflows/publish-images.yml"), /image: easypanel-web/);
});
