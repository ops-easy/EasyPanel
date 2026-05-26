import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Kafka app center uses the Redis/MySQL-style inline instance workspace", () => {
  const source = read("../src/features/app-center/kafka/pages/AppCenterKafka.tsx");

  assert.match(source, /const \[selectedId, setSelectedId\]/);
  assert.match(source, /value="kafka"[\s\S]*实例列表/);
  assert.match(source, /value="install"[\s\S]*部署向导/);
  assert.match(source, /routeInstanceId=\{selectedId\}/);
  assert.match(source, /setSelectedId\(iid\)/);
  assert.doesNotMatch(source, /navigate\(`\/cluster\/apps\/kafka\/instance\/\$\{iid\}`\)/);
});

test("Kafka management and throttle controls are not hidden behind row action links", () => {
  const source = read("../src/features/app-center/kafka/pages/AppCenterKafka.tsx");

  assert.match(source, /KafkaThrottleWorkspace/);
  assert.match(source, /TabsTrigger value="throttle"[\s\S]*限速/);
  assert.match(source, /TabsContent value="throttle"[\s\S]*KafkaThrottleWorkspace/);
  assert.doesNotMatch(source, /管理配置/);
  assert.doesNotMatch(source, /独立限速页/);
  assert.doesNotMatch(source, /\/cluster\/apps\/kafka\/instance\/\$\{i\.id\}\/throttle/);
});

test("Kafka throttle page exposes an embeddable workspace for the instance detail tab", () => {
  const source = read("../src/features/app-center/kafka/pages/AppCenterKafkaThrottle.tsx");

  assert.match(source, /export function KafkaThrottleWorkspace/);
  assert.match(source, /embedded\?: boolean/);
  assert.match(source, /showNavigation\?: boolean/);
});
