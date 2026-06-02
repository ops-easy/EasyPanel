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
    "../../k8s/frontend/frontend-configmap.yaml",
    "../../k8s/frontend/frontend-deployment.yaml",
    "../../k8s/frontend/frontend-service.yaml",
    "../../k8s/frontend/ingress.yaml",
  ];

  for (const file of files) {
    assert.doesNotMatch(read(file), /^  namespace: easypanel$/m, file);
    assert.doesNotMatch(read(file), /github\.com\/ops-easy\/EasyPanel\/api/, file);
  }

  assert.match(read("../../k8s/backend/namespace.yaml"), /^  name: easy$/m);
  assert.match(read("../../k8s/kustomization.yaml"), /^namespace: easy$/m);
  assert.match(read("../../k8s/backend/kustomization.yaml"), /^namespace: easy$/m);
  assert.match(read("../../k8s/frontend/kustomization.yaml"), /^namespace: easy$/m);
  assert.match(read("../../k8s/backend/deployment.yaml"), /ghcr\.io\/ops-easy\/easypanel-api:latest/);
  assert.match(read("../../k8s/frontend/frontend-deployment.yaml"), /ghcr\.io\/ops-easy\/easypanel-web:latest/);
});

test("raw Kubernetes manifests use unified EasyPanel names and labels", () => {
  const backendDeployment = read("../../k8s/backend/deployment.yaml");
  const backendService = read("../../k8s/backend/service.yaml");
  const frontendDeployment = read("../../k8s/frontend/frontend-deployment.yaml");
  const frontendService = read("../../k8s/frontend/frontend-service.yaml");
  const frontendConfig = read("../../k8s/frontend/frontend-configmap.yaml");
  const nginx = read("../deploy/nginx.conf");

  assert.match(backendDeployment, /^  name: easypanel-backend$/m);
  assert.match(backendService, /^  name: easypanel-backend$/m);
  assert.match(frontendDeployment, /^  name: easypanel-frontend$/m);
  assert.match(frontendService, /^  name: easypanel-frontend$/m);

  for (const source of [backendDeployment, backendService, frontendDeployment, frontendService]) {
    assert.match(source, /app\.kubernetes\.io\/part-of: easy/);
    assert.match(source, /app\.kubernetes\.io\/name: easypanel/);
  }

  assert.match(backendDeployment, /app\.kubernetes\.io\/component: backend/);
  assert.match(frontendDeployment, /app\.kubernetes\.io\/component: frontend/);
  assert.match(backendDeployment, /imagePullPolicy: Always/);
  assert.match(frontendDeployment, /imagePullPolicy: Always/);
  assert.match(backendDeployment, /startupProbe:/);
  assert.match(frontendDeployment, /startupProbe:/);
  assert.match(frontendDeployment, /name: easypanel-frontend-nginx/);
  assert.match(frontendConfig, /proxy_pass http:\/\/easypanel-backend:8080;/);
  assert.match(nginx, /proxy_pass http:\/\/easypanel-backend:8080;/);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/easypanel:8080;/);
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

test("backend container image includes helm for kube-prometheus-stack installs", () => {
  const dockerfile = read("../../backend/Dockerfile");

  assert.match(dockerfile, /COPY --from=helm\s+\/helm\s+\/app\/helm/);
  assert.match(dockerfile, /ENV [^\n]*HELM_BIN=\/app\/helm/);
});

test("Kubernetes backend waits for MySQL and Redis before starting", () => {
  const rawDeployment = read("../../k8s/backend/deployment.yaml");
  const helmDeployment = read("../../k8s/charts/easypanel/templates/deployment.yaml");

  for (const source of [rawDeployment, helmDeployment]) {
    assert.match(source, /initContainers:/);
    assert.match(source, /name: wait-for-platform-deps/);
    assert.match(source, /MYSQL_HOST/);
    assert.match(source, /REDIS_ADDR/);
    assert.match(source, /nc -z/);
  }
});
