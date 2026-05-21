import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const parentFiles = [
  "ClusterK8sListPage.tsx",
  "ClusterServiceDetail.tsx",
  "ClusterServices.tsx",
  "ClusterWorkloadDetail.tsx",
];

test("K8s pages use the lazy graphic dialog wrapper", () => {
  for (const file of parentFiles) {
    const source = readFileSync(new URL(`../src/features/cluster/pages/${file}`, import.meta.url), "utf8");
    assert.match(source, /K8sGraphicEditDialogLazy/);
    assert.equal(source.includes("from \"./k8s/K8sGraphicEditDialog\""), false, file);
  }
});

test("K8sGraphicEditDialogLazy loads implementation only when opened", () => {
  const source = readFileSync(
    new URL("../src/features/cluster/pages/k8s/K8sGraphicEditDialogLazy.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /lazy\(\(\) =>\s*import\("\.\/K8sGraphicEditDialog"\)/);
  assert.match(source, /if \(!props\.open\) return null/);
});
