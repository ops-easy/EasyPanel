import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project docs point at the renamed EasyPanel repository", () => {
  assert.match(read("../../README.md"), /https:\/\/github\.com\/ops-easy\/EasyPanel\.git/);
  assert.match(read("../../CONTRIBUTING.md"), /git clone https:\/\/github\.com\/ops-easy\/EasyPanel\.git/);
});

test("raw Kubernetes manifests deploy EasyPanel into the easy namespace", () => {
  const files = [
    "../../k8s/backend/configmap.yaml",
    "../../k8s/backend/deployment.yaml",
    "../../k8s/backend/namespace.yaml",
    "../../k8s/backend/pvc.yaml",
    "../../k8s/backend/rbac.yaml",
    "../../k8s/backend/secret-example.yaml",
    "../../k8s/backend/service.yaml",
    "../../k8s/frontend/frontend-deployment.yaml",
    "../../k8s/frontend/frontend-service.yaml",
    "../../k8s/frontend/ingress.yaml",
  ];

  for (const file of files) {
    assert.doesNotMatch(read(file), /^  namespace: easypanel$/m, file);
    assert.doesNotMatch(read(file), /github\.com\/ops-easy\/EasyPanel\/api/, file);
  }

  assert.match(read("../../k8s/backend/namespace.yaml"), /^  name: easy$/m);
  assert.match(read("../../k8s/backend/kustomization.yaml"), /^namespace: easy$/m);
  assert.match(read("../../k8s/frontend/kustomization.yaml"), /^namespace: easy$/m);
  assert.match(read("../../k8s/backend/deployment.yaml"), /ghcr\.io\/ops-easy\/easypanel-api:latest/);
  assert.match(read("../../k8s/frontend/frontend-deployment.yaml"), /ghcr\.io\/ops-easy\/easypanel-web:latest/);
});

test("Kubernetes deployment docs use the easy namespace", () => {
  const docs = [
    "../../README.md",
    "../../k8s/README.md",
    "../../AGENT.md",
  ].map(read).join("\n");

  assert.doesNotMatch(docs, /--namespace easypanel\b/);
  assert.doesNotMatch(docs, /-n easypanel\b/);
  assert.match(docs, /--namespace easy\b/);
  assert.match(docs, /-n easy\b/);
});

test("Kubernetes config defaults resolve in the easy namespace", () => {
  const configs = [
    "../../k8s/backend/configmap.yaml",
    "../../k8s/charts/easypanel/values.yaml",
  ].map(read).join("\n");

  assert.doesNotMatch(configs, /\.easypanel\.svc\.cluster\.local/);
  assert.match(configs, /mysql\.easy\.svc\.cluster\.local/);
  assert.match(configs, /redis\.easy\.svc\.cluster\.local:6379/);
});
