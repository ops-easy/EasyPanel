import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const settingsSource = read("../src/features/cluster/pages/ClusterK8sSettings.tsx");
const etcdSource = read("../src/features/cluster/pages/ClusterEtcdPage.tsx");

test("cluster settings uses the shared cluster content width", () => {
  assert.match(settingsSource, /<div className="mx-auto w-full space-y-8 pb-12">/);
  assert.doesNotMatch(settingsSource, /max-w-4xl/);
});

test("cluster etcd uses the shared cluster content width", () => {
  assert.match(etcdSource, /<div className="mx-auto w-full space-y-6 pb-12">/);
  assert.doesNotMatch(etcdSource, /max-w-7xl/);
});
