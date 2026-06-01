import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const auditDisplaySource = readFileSync(new URL("../src/lib/audit-display.ts", import.meta.url), "utf8");

test("app center audit display gives Hermes and OpenClaw product-facing mutation labels", () => {
  assert.match(auditDisplaySource, /apiHermesMutationLabel/);
  assert.match(auditDisplaySource, /apiOpenClawMutationLabel/);

  for (const label of [
    "Hermes 部署到集群",
    "Hermes 滚动重启",
    "Hermes 升级镜像",
    "Hermes 回滚镜像",
    "Hermes 更新暴露方式",
    "Hermes 迁移 OpenClaw 数据",
    "Hermes 删除实例",
    "OpenClaw 部署到集群",
    "OpenClaw 保存实例文件",
    "OpenClaw 应用上游模型运行时",
    "OpenClaw 更新 Telegram 设置",
    "OpenClaw 写入 Telegram 配置",
    "OpenClaw 更新出口代理",
    "OpenClaw 更新 RBAC 预设",
    "OpenClaw 应用工具链预设",
    "OpenClaw 同步到 AI 巡检",
    "OpenClaw 更新网关镜像",
    "OpenClaw 删除实例",
  ]) {
    assert.match(auditDisplaySource, new RegExp(label));
  }

  assert.doesNotMatch(auditDisplaySource, /return "应用中心 Hermes 操作";/);
});
