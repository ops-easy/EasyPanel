import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import YAML from "yaml";

const repoRoot = new URL("../../", import.meta.url);

async function readYaml(relativePath) {
  const contents = await readFile(new URL(relativePath, repoRoot), "utf8");
  return YAML.parse(contents);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function assertNoInlineBackendSecrets(config) {
  assert.equal(
    hasOwn(config.server, "password"),
    false,
    "server.password must be supplied by Secret env, not ConfigMap/values.yaml",
  );
  assert.equal(
    hasOwn(config.server, "sessionSecret"),
    false,
    "server.sessionSecret must be supplied by Secret env, not ConfigMap/values.yaml",
  );
  assert.equal(
    hasOwn(config.db, "password"),
    false,
    "db.password must be supplied by Secret env, not ConfigMap/values.yaml",
  );
  assert.equal(
    hasOwn(config.redis, "password"),
    false,
    "redis.password must be supplied by Secret env, not ConfigMap/values.yaml",
  );
}

test("kustomize backend config keeps sensitive defaults out of ConfigMap", async () => {
  const configMap = await readYaml("k8s/backend/configmap.yaml");
  const backendConfig = YAML.parse(configMap.data["config.yaml"]);

  assertNoInlineBackendSecrets(backendConfig);
});

test("helm defaults require Secret env injection for sensitive runtime values", async () => {
  const values = await readYaml("k8s/charts/easypanel/values.yaml");

  assertNoInlineBackendSecrets(values.backend.config);
  assert.deepEqual(values.backend.extraEnvFrom, [
    {
      secretRef: {
        name: "easypanel-secrets",
      },
    },
  ]);
});

test("secret example uses envFrom-compatible keys for required secrets", async () => {
  const secret = await readYaml("k8s/backend/secret-example.yaml");
  const keys = Object.keys(secret.stringData ?? {});
  const requiredKeys = [
    "DASHBOARD_PASSWORD",
    "DASHBOARD_SESSION_SECRET",
    "MYSQL_PASSWORD",
    "REDIS_PASSWORD",
    "EASYPANEL_ENCRYPTION_KEY",
  ];

  for (const key of keys) {
    assert.match(
      key,
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      `${key} cannot be injected by envFrom as a process environment variable`,
    );
  }

  for (const key of requiredKeys) {
    assert.ok(keys.includes(key), `${key} is required by the deployment defaults`);
  }
});
