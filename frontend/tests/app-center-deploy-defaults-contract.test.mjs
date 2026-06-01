import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const kafka = read("../src/features/app-center/kafka/pages/AppCenterKafka.tsx");
const opensearch = read("../src/features/app-center/opensearch/pages/AppCenterOpenSearch.tsx");

test("app center deploy defaults use production-neutral resource names", () => {
  assert.match(kafka, /useState\("kafka-main"\)/);
  assert.match(opensearch, /useState\("opensearch-main"\)/);
  assert.doesNotMatch(kafka, /kafka-demo/);
  assert.doesNotMatch(opensearch, /opensearch-demo/);
});
