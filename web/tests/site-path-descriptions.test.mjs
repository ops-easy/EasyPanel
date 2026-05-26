import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/site-path-descriptions.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { describeSitePath } = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

test("floating AI route context names concrete app-center product pages", () => {
  const cases = [
    ["/cluster/apps/dashboard", "前端：应用中心总览（Redis、MySQL、Kafka、OpenClaw、Hermes 等实例概览）"],
    ["/cluster/apps/redis", "前端：应用中心 · Redis 实例列表、部署向导与模板中心"],
    ["/cluster/apps/mysql?tab=templates", "前端：应用中心 · MySQL 实例列表、部署向导、SQL、用户与备份"],
    ["/cluster/apps/kafka", "前端：应用中心 · Kafka 实例列表、部署向导与模板中心"],
    ["/cluster/apps/hermes", "前端：应用中心 · Hermes 实例列表"],
    ["/cluster/apps/openclaw", "前端：应用中心 · OpenClaw 实例列表"],
  ];

  for (const [path, expected] of cases) {
    assert.equal(describeSitePath(path), expected, path);
  }
});

test("floating AI route context preserves app-center instance scenarios", () => {
  const cases = [
    ["/cluster/apps/kafka/instance/42", "前端：应用中心 · Kafka 实例 42 管理（集群、Topic、消费者组、ACL、SCRAM、压测）"],
    ["/cluster/apps/kafka/instance/42/throttle", "前端：应用中心 · Kafka 实例 42 限速与配额管理"],
    ["/cluster/apps/hermes/create", "前端：应用中心 · Hermes 新建实例"],
    ["/cluster/apps/hermes/bootstrap", "前端：应用中心 · Hermes 部署初始化"],
    ["/cluster/apps/hermes/prod-gateway#logs", "前端：应用中心 · Hermes 实例 prod-gateway 详情"],
    ["/cluster/apps/openclaw/create", "前端：应用中心 · OpenClaw 新建实例"],
    ["/cluster/apps/openclaw/bootstrap", "前端：应用中心 · OpenClaw 部署初始化"],
    ["/cluster/apps/openclaw/oc-prod?tab=chat", "前端：应用中心 · OpenClaw 实例 oc-prod 详情与对话"],
    ["/cluster/apps/redis?instance=7", "前端：应用中心 · Redis 实例 7 详情"],
    ["/cluster/apps/mysql?instance=9", "前端：应用中心 · MySQL 实例 9 详情（SQL、用户与备份）"],
  ];

  for (const [path, expected] of cases) {
    assert.equal(describeSitePath(path), expected, path);
  }
});
