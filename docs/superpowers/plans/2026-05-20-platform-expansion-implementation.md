# PVE、OpenWrt、Hermes 平台扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增虚拟化与主机、网络设备、Hermes 应用中心能力，使 PVE、OpenWrt、Hermes 分别达到现有 vCenter、iKuai、OpenClaw 的同级第一版深度。

**Architecture:** 采用“同级能力线 + 薄共享工具”方案：`compute` 负责前端信息架构，`api/pve` 负责 PVE REST API 纳管，`api/network` 负责 iKuai/OpenWrt Prometheus 只读监控，`appcenter/hermes` 复用 OpenClaw 的 K8s 部署和 platform_kv 模式。保留旧 vCenter/iKuai 路由和 API 兼容，避免一次升级打断现有入口。

**Tech Stack:** Go 1.25、Gin、client-go、React 19、TypeScript、Vite、TanStack Query、Tailwind CSS、Radix/shadcn 风格组件、Prometheus HTTP API、Proxmox VE REST API、Kubernetes Deployment/Service/PVC/Secret/ConfigMap。

---

## File Structure

### Backend

- Create: `api/router/pve/pve.go`
- Create: `api/api/pve/controller/pve.go`
- Create: `api/api/pve/service/routes.go`
- Create: `api/api/pve/service/client.go`
- Create: `api/api/pve/service/targets.go`
- Create: `api/api/pve/service/targets_test.go`
- Create: `api/api/pve/model/pve.go`
- Create: `api/router/network/network.go`
- Create: `api/api/network/controller/network.go`
- Create: `api/api/network/service/routes.go`
- Create: `api/api/network/service/devices.go`
- Create: `api/api/network/service/prometheus.go`
- Create: `api/api/network/service/ikuai.go`
- Create: `api/api/network/service/openwrt.go`
- Create: `api/api/network/service/network_test.go`
- Create: `api/api/network/model/network.go`
- Create: `api/api/appcenter/service/hermes_bootstrap.go`
- Create: `api/api/appcenter/service/hermes_store.go`
- Create: `api/api/appcenter/service/hermes_k8s.go`
- Create: `api/api/appcenter/service/hermes_handlers.go`
- Create: `api/api/appcenter/service/hermes_test.go`
- Modify: `api/router/router.go`
- Modify: `api/api/appcenter/controller/appcenter.go`
- Modify: `api/api/appcenter/service/shared.go` only if shared aliases are required.

### Frontend

- Create: `web/src/app/routes/compute-routes.tsx`
- Create: `web/src/app/routes/network-routes.tsx`
- Create: `web/src/features/compute/layout/ComputeLayout.tsx`
- Create: `web/src/features/compute/layout/ComputeSubNav.tsx`
- Create: `web/src/features/compute/pages/ComputeDashboard.tsx`
- Create: `web/src/features/compute/pve/pages/PveDashboard.tsx`
- Create: `web/src/features/compute/pve/pages/PveTargets.tsx`
- Create: `web/src/features/network/layout/NetworkLayout.tsx`
- Create: `web/src/features/network/layout/NetworkSubNav.tsx`
- Create: `web/src/features/network/pages/NetworkDashboard.tsx`
- Create: `web/src/features/network/ikuai/pages/IkuaiDashboard.tsx`
- Create: `web/src/features/network/openwrt/pages/OpenWrtDashboard.tsx`
- Create: `web/src/features/app-center/hermes/pages/AppCenterHermes.tsx`
- Create: `web/src/features/app-center/hermes/pages/AppCenterHermesBootstrap.tsx`
- Create: `web/src/features/app-center/hermes/pages/AppCenterHermesDetail.tsx`
- Modify: `web/src/app/routes/vcenter-routes.tsx`
- Modify: `web/src/app/routes/app-center-routes.tsx`
- Modify: `web/src/app/route-inventory.ts`
- Modify: `web/src/shared/layout/Sidebar.tsx`
- Modify: `web/src/features/app-center/layout/AppCenterSubNav.tsx`
- Modify: `web/src/features/app-center/layout/AppCenterDashboard.tsx`

---

## Task 1: Backend Route Shells

**Files:**
- Create: `api/router/pve/pve.go`
- Create: `api/api/pve/controller/pve.go`
- Create: `api/api/pve/service/routes.go`
- Create: `api/router/network/network.go`
- Create: `api/api/network/controller/network.go`
- Create: `api/api/network/service/routes.go`
- Modify: `api/router/router.go`

- [ ] **Step 1: Write route registration smoke tests**

Use existing router conventions and add tests only where local route registration can be validated without booting full dependencies. Expected route names:

```go
GET /api/pve/targets
GET /api/network/devices
GET /api/network/devices/discover
```

- [ ] **Step 2: Run smoke tests and verify failure**

Run:

```powershell
go test ./api/pve/... ./api/network/... -run TestRoute -count=1
```

Expected: packages or routes do not exist yet.

- [ ] **Step 3: Implement router/controller/service shells**

Follow existing domain style:

```go
func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
    controller.New(app).RegisterRoutes(api)
}
```

PVE shell returns empty `targets`. Network shell returns empty `devices` and empty `discover`.

- [ ] **Step 4: Register top-level routes**

Add imports and calls in `api/router/router.go`:

```go
pve.RegisterRoutes(api, app)
network.RegisterRoutes(api, app)
```

- [ ] **Step 5: Run tests**

Run:

```powershell
go test ./api/pve/... ./api/network/... -count=1
```

Expected: pass.

---

## Task 2: PVE Target Store And Client

**Files:**
- Create: `api/api/pve/model/pve.go`
- Create: `api/api/pve/service/client.go`
- Create: `api/api/pve/service/targets.go`
- Create: `api/api/pve/service/targets_test.go`
- Modify: `api/api/pve/service/routes.go`

- [ ] **Step 1: Write PVE URL and token tests**

Required cases:

```go
normalizePVEBaseURL("10.0.0.5") == "https://10.0.0.5:8006"
normalizePVEBaseURL("https://10.0.0.5:8006/api2/json") == "https://10.0.0.5:8006"
buildPVEAuthHeader("root@pam!kubebt", "secret") == "PVEAPIToken=root@pam!kubebt=secret"
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
go test ./api/pve/... -run TestPVE -count=1
```

Expected: helper functions missing.

- [ ] **Step 3: Implement model and helpers**

Define:

```go
type Target struct {
    ID string `json:"id"`
    Name string `json:"name"`
    BaseURL string `json:"baseUrl"`
    TokenID string `json:"tokenId"`
    TokenSecretEnc string `json:"tokenSecretEnc,omitempty"`
    SkipTLS bool `json:"skipTls"`
    PrometheusJob string `json:"prometheusJob,omitempty"`
    CreatedAt string `json:"createdAt"`
    UpdatedAt string `json:"updatedAt"`
}
```

Implement URL normalization, auth header building, masked response rows, and platform_kv load/save under `kubebt_pve_targets_v1`.

- [ ] **Step 4: Implement CRUD handlers**

Expose:

```text
GET    /api/pve/targets
POST   /api/pve/targets
PUT    /api/pve/targets/:id
DELETE /api/pve/targets/:id
POST   /api/pve/targets/:id/probe
```

Use existing role helpers from appcenter service patterns where available; admin-only write operations.

- [ ] **Step 5: Run tests**

Run:

```powershell
go test ./api/pve/... -count=1
```

Expected: pass.

---

## Task 3: PVE Read/Power APIs

**Files:**
- Modify: `api/api/pve/service/client.go`
- Modify: `api/api/pve/service/routes.go`
- Create or Modify: `api/api/pve/service/targets_test.go`

- [ ] **Step 1: Write tests for action validation**

Allowed actions:

```text
start, stop, shutdown, reboot, reset
```

Reject other strings with a clear error.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
go test ./api/pve/... -run TestPVEGuestPowerAction -count=1
```

Expected: validation missing.

- [ ] **Step 3: Implement PVE request helpers**

Use:

```text
GET /version
GET /nodes
GET /cluster/resources?type=vm
GET /cluster/resources?type=storage
GET /cluster/tasks
POST /nodes/{node}/qemu/{vmid}/status/{action}
POST /nodes/{node}/lxc/{vmid}/status/{action}
```

For power actions, require body fields:

```json
{"node":"pve1","type":"qemu","action":"start"}
```

- [ ] **Step 4: Add routes**

Expose:

```text
GET  /api/pve/targets/:id/summary
GET  /api/pve/targets/:id/nodes
GET  /api/pve/targets/:id/guests
POST /api/pve/targets/:id/guests/:vmid/power
GET  /api/pve/targets/:id/storage
GET  /api/pve/targets/:id/tasks
```

- [ ] **Step 5: Run tests**

Run:

```powershell
go test ./api/pve/... -count=1
```

Expected: pass.

---

## Task 4: Network Store, iKuai Compatibility, OpenWrt Probe

**Files:**
- Create: `api/api/network/model/network.go`
- Create: `api/api/network/service/devices.go`
- Create: `api/api/network/service/prometheus.go`
- Create: `api/api/network/service/ikuai.go`
- Create: `api/api/network/service/openwrt.go`
- Create: `api/api/network/service/network_test.go`
- Modify: `api/api/network/service/routes.go`

- [ ] **Step 1: Write tests for network device validation**

Valid `kind` values:

```text
ikuai, openwrt
```

Valid scopes:

```text
network, vcenter, default
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
go test ./api/network/... -run TestNetwork -count=1
```

Expected: missing implementation.

- [ ] **Step 3: Implement device store**

Use platform_kv key:

```text
kubebt_network_devices_v1
```

Expose CRUD and discovery shell.

- [ ] **Step 4: Implement iKuai queries**

Move the existing query constants and conversion semantics from `common/core/vcenter_ikuai_prometheus.go` into network service while preserving old response fields:

```json
{
  "prometheusConfigured": true,
  "ratesByIp": {},
  "devices": [],
  "exporterKind": "modern",
  "note": "...",
  "queriesUsed": {}
}
```

- [ ] **Step 5: Implement OpenWrt family probe**

Return family booleans and missing hints for system, interfaces, DHCP, wifi, and netstat.

- [ ] **Step 6: Run tests**

Run:

```powershell
go test ./api/network/... -count=1
```

Expected: pass.

---

## Task 5: Hermes Store And Manifest Generation

**Files:**
- Create: `api/api/appcenter/service/hermes_bootstrap.go`
- Create: `api/api/appcenter/service/hermes_store.go`
- Create: `api/api/appcenter/service/hermes_k8s.go`
- Create: `api/api/appcenter/service/hermes_test.go`

- [ ] **Step 1: Write Hermes manifest tests**

Required assertions:

```go
gateway mode -> one container command ["gateway","run"]
dashboard mode -> one container command ["dashboard","--host","0.0.0.0","--no-open"]
gateway-dashboard mode -> two containers sharing the same PVC volume
HERMES_HOME == "/opt/data"
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
go test ./api/appcenter/... -run TestHermes -count=1
```

Expected: Hermes functions missing.

- [ ] **Step 3: Implement bootstrap/store**

Use keys:

```text
appcenter_hermes_bootstrap_v1
kubebt_app_hermes_instances_v1
```

Use structs for Bootstrap, Mode, Instance, and masked instance response.

- [ ] **Step 4: Implement K8s manifest builder**

Generate Namespace, PVC, Secret, ConfigMap, Deployment, Service, optional Ingress. Keep manifests in Go structs rather than ad-hoc YAML strings.

- [ ] **Step 5: Run tests**

Run:

```powershell
go test ./api/appcenter/... -run TestHermes -count=1
```

Expected: pass.

---

## Task 6: Hermes HTTP Handlers

**Files:**
- Create: `api/api/appcenter/service/hermes_handlers.go`
- Modify: `api/api/appcenter/controller/appcenter.go`
- Create or Modify: `api/api/appcenter/service/hermes_test.go`

- [ ] **Step 1: Write handler/store tests**

Test secret masking and instance append/remove behavior.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
go test ./api/appcenter/... -run TestHermes -count=1
```

- [ ] **Step 3: Implement routes**

Expose:

```text
GET    /api/app-center/hermes/bootstrap
PUT    /api/app-center/hermes/bootstrap
GET    /api/app-center/hermes/instances
POST   /api/app-center/hermes/k8s-deploy
GET    /api/app-center/hermes/instances/k8s-status
GET    /api/app-center/hermes/instances/:id
GET    /api/app-center/hermes/instances/:id/file
PUT    /api/app-center/hermes/instances/:id/file
POST   /api/app-center/hermes/instances/:id/probe
POST   /api/app-center/hermes/instances/:id/restart
POST   /api/app-center/hermes/instances/:id/migrate-openclaw-dry-run
POST   /api/app-center/hermes/instances/:id/migrate-openclaw
DELETE /api/app-center/hermes/instances/:id
```

- [ ] **Step 4: Register routes**

Add:

```go
appcentersvc.RegisterHermesRoutes(api, ctl.app)
```

- [ ] **Step 5: Run tests**

Run:

```powershell
go test ./api/appcenter/... -run TestHermes -count=1
```

Expected: pass.

---

## Task 7: Frontend Routes And Navigation

**Files:**
- Create: `web/src/app/routes/compute-routes.tsx`
- Create: `web/src/app/routes/network-routes.tsx`
- Modify: `web/src/app/routes/vcenter-routes.tsx`
- Modify: `web/src/app/routes/app-center-routes.tsx`
- Modify: `web/src/app/route-inventory.ts`
- Modify: `web/src/shared/layout/Sidebar.tsx`
- Modify: `web/src/features/app-center/layout/AppCenterSubNav.tsx`

- [ ] **Step 1: Add route files**

Create compute and network route trees with `RouteSuspense` and lazy imports.

- [ ] **Step 2: Add compatibility redirects**

Keep:

```text
/cluster/vcenter/router -> /cluster/network/ikuai/dashboard
/cluster/vcenter/cloud -> /cluster/compute/cloud
/cluster/vcenter -> /cluster/compute/vcenter/vms
```

- [ ] **Step 3: Update sidebar**

Add top-level `虚拟化与主机` and `网络设备`. Keep `堡垒机` as an independent top-level entry.

- [ ] **Step 4: Build frontend**

Run:

```powershell
npm run build
```

inside `web`.

Expected: TypeScript build succeeds.

---

## Task 8: Frontend Compute/PVE Pages

**Files:**
- Create: `web/src/features/compute/layout/ComputeLayout.tsx`
- Create: `web/src/features/compute/layout/ComputeSubNav.tsx`
- Create: `web/src/features/compute/pages/ComputeDashboard.tsx`
- Create: `web/src/features/compute/pve/pages/PveDashboard.tsx`
- Create: `web/src/features/compute/pve/pages/PveTargets.tsx`

- [ ] **Step 1: Implement Compute layout**

Use existing AppCenter/VCenter layout density and `Button`, `Card`, `Table`, `Badge`.

- [ ] **Step 2: Implement PVE target management**

Use:

```text
GET/POST/PUT/DELETE /api/pve/targets
POST /api/pve/targets/:id/probe
```

- [ ] **Step 3: Implement PVE dashboard**

Use:

```text
GET /api/pve/targets/:id/summary
GET /api/pve/targets/:id/guests
```

- [ ] **Step 4: Build frontend**

Run:

```powershell
npm run build
```

inside `web`.

Expected: build succeeds.

---

## Task 9: Frontend Network Pages

**Files:**
- Create: `web/src/features/network/layout/NetworkLayout.tsx`
- Create: `web/src/features/network/layout/NetworkSubNav.tsx`
- Create: `web/src/features/network/pages/NetworkDashboard.tsx`
- Create: `web/src/features/network/ikuai/pages/IkuaiDashboard.tsx`
- Create: `web/src/features/network/openwrt/pages/OpenWrtDashboard.tsx`

- [ ] **Step 1: Move iKuai page behavior**

Reuse chart/query logic from `VCenterIkuaiRouterPage.tsx`, but call `/api/network` where possible.

- [ ] **Step 2: Implement OpenWrt dashboard**

Show exporter-status, system KPI, interfaces, clients, connections, and conditional wireless state.

- [ ] **Step 3: Build frontend**

Run:

```powershell
npm run build
```

inside `web`.

Expected: build succeeds.

---

## Task 10: Frontend Hermes Pages

**Files:**
- Create: `web/src/features/app-center/hermes/pages/AppCenterHermes.tsx`
- Create: `web/src/features/app-center/hermes/pages/AppCenterHermesBootstrap.tsx`
- Create: `web/src/features/app-center/hermes/pages/AppCenterHermesDetail.tsx`
- Modify: `web/src/features/app-center/layout/AppCenterDashboard.tsx`
- Modify: `web/src/app/routes/app-center-routes.tsx`

- [ ] **Step 1: Implement Hermes bootstrap**

Use:

```text
GET/PUT /api/app-center/hermes/bootstrap
```

- [ ] **Step 2: Implement Hermes list**

Use:

```text
GET /api/app-center/hermes/instances
GET /api/app-center/hermes/instances/k8s-status
```

- [ ] **Step 3: Implement Hermes detail**

Use:

```text
GET /api/app-center/hermes/instances/:id
POST /api/app-center/hermes/instances/:id/probe
POST /api/app-center/hermes/instances/:id/restart
POST /api/app-center/hermes/instances/:id/migrate-openclaw-dry-run
```

- [ ] **Step 4: Build frontend**

Run:

```powershell
npm run build
```

inside `web`.

Expected: build succeeds.

---

## Task 11: Final Verification

**Files:**
- All changed files.

- [ ] **Step 1: Backend targeted tests**

Run:

```powershell
go test ./api/pve/... ./api/network/... ./api/appcenter/... -count=1
```

Expected: pass.

- [ ] **Step 2: Backend full tests**

Run:

```powershell
go test ./...
```

Expected: pass or report unrelated pre-existing failures with exact package names.

- [ ] **Step 3: Frontend build**

Run:

```powershell
npm run build
```

inside `web`.

Expected: pass.

- [ ] **Step 4: Frontend lint**

Run:

```powershell
npm run lint
```

inside `web`.

Expected: pass or report existing lint baseline if present.

- [ ] **Step 5: Manual route sanity**

Check that these paths render or redirect:

```text
/cluster/compute/dashboard
/cluster/compute/pve/dashboard
/cluster/network/ikuai/dashboard
/cluster/network/openwrt/dashboard
/cluster/apps/hermes
/cluster/vcenter/router
```

---

## Self-Review Notes

- Spec coverage: PVE, OpenWrt, Hermes, iKuai migration, old route compatibility, backend APIs, frontend pages, security, and tests are each represented by at least one task.
- Scope control: The plan implements first-version parity and avoids OpenWrt/iKuai write configuration and PVE NoVNC proxy.
- Type consistency: PVE target, network device, and Hermes instance fields match the design document.
