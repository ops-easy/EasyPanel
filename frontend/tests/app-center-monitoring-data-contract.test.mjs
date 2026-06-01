import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Redis exporter charts preserve zero values but do not turn invalid Prometheus samples into zero", () => {
  const source = read("../src/features/app-center/redis/components/RedisExporterMonitorCharts.tsx");

  assert.doesNotMatch(source, /parseFloat\(String\(sv\)\)\s*\|\|\s*0/);
  assert.match(source, /const v = Number\.parseFloat\(String\(sv\)\)/);
  assert.match(source, /Number\.isFinite\(v\)/);
  assert.match(source, /points\.push\(\{ t: t \* 1000, v \}\)/);
});
