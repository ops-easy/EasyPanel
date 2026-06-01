import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("PVE exposes full takeover routes and panels", () => {
  const routes = read("../src/app/routes/compute-routes.tsx");
  const guest = read("../src/features/compute/pve/pages/PveGuestDetail.tsx");
  const node = read("../src/features/compute/pve/pages/PveNodeDetail.tsx");

  assert.match(routes, /path="pve\/nodes\/:targetId\/:node"/);
  assert.match(routes, /path="pve\/guests\/:targetId\/:node\/:guestType\/:vmid"/);
  assert.match(guest, /TabsTrigger value="overview"/);
  assert.match(guest, /TabsTrigger value="metrics"/);
  assert.match(guest, /TabsTrigger value="hardware"/);
  assert.match(guest, /TabsTrigger value="snapshots"/);
  assert.match(guest, /TabsTrigger value="console"/);
  assert.match(guest, /TabsTrigger value="ssh"/);
  assert.match(guest, /TabsTrigger value="sftp"/);
  assert.match(guest, /PveConsolePanel/);
  assert.match(guest, /PveGuestHardwareDialog/);
  assert.match(node, /TabsTrigger value="overview"/);
  assert.match(node, /TabsTrigger value="metrics"/);
  assert.match(node, /TabsTrigger value="guests"/);
  assert.match(node, /TabsTrigger value="storage"/);
  assert.match(node, /TabsTrigger value="tasks"/);
});

test("PVE console embeds a noVNC client instead of only exposing proxy URLs", () => {
  const pkg = read("../package.json");
  const guest = read("../src/features/compute/pve/pages/PveGuestDetail.tsx");

  assert.match(pkg, /"@novnc\/novnc"/);
  assert.match(guest, /import\("@novnc\/novnc"\)/);
  assert.match(guest, /new RFB\(/);
  assert.match(guest, /qualityLevel/);
  assert.match(guest, /compressionLevel/);
  assert.match(guest, /pveConsoleQualityProfiles/);
  assert.match(guest, /disconnect\(\)/);
  assert.match(guest, /console\/ticket`[\s\S]*\{ node, type: guestType \}/);
  assert.doesNotMatch(guest, /console\/ticket`[\s\S]*width:/);
  assert.doesNotMatch(guest, /console\/ticket`[\s\S]*height:/);
});

test("PVE power operations require typed guest confirmation and send confirm flag", () => {
  const guest = read("../src/features/compute/pve/pages/PveGuestDetail.tsx");

  assert.match(guest, /const \[powerConfirmName, setPowerConfirmName\] = useState\(""\);/);
  assert.match(guest, /const powerConfirmTarget = String\(config\.name \?\? status\.name \?\? vmid\)\.trim\(\) \|\| vmid;/);
  assert.match(guest, /const powerConfirmed = powerConfirmName\.trim\(\) === powerConfirmTarget;/);
  assert.match(guest, /apiPostJson<PveTaskEnvelope>[\s\S]*\{ node, type: canonicalGuestType, action, confirm \}/);
  assert.match(guest, /disabled=\{operationPending \|\| !powerConfirmed\}/);
  assert.match(guest, /powerMut\.mutate\(\{ action, confirm: powerConfirmed \}\)/);
  assert.doesNotMatch(guest, /powerMut\.mutate\(action\)/);
});

test("PVE hardware disk and snapshot mutations require explicit confirmation", () => {
  const guest = read("../src/features/compute/pve/pages/PveGuestDetail.tsx");

  assert.match(guest, /const \[mutationConfirmName, setMutationConfirmName\] = useState\(""\);/);
  assert.match(guest, /const mutationConfirmed = mutationConfirmName\.trim\(\) === confirmTarget;/);
  assert.match(guest, /onSaveConfig: \(body: Record<string, number \| boolean>\) => void;/);
  assert.match(guest, /onResizeDisk: \(body: \{ disk: string; size: string; confirm: boolean \}\) => void;/);
  assert.match(guest, /onSaveConfig\(\{ \.\.\.body, confirm: mutationConfirmed \}\);/);
  assert.match(guest, /onResizeDisk\(\{ disk: disk\.trim\(\), size: size\.trim\(\), confirm: mutationConfirmed \}\);/);
  assert.match(guest, /disabled=\{pending \|\| !mutationConfirmed\}/);
  assert.match(guest, /const \[deleteConfirmName, setDeleteConfirmName\] = useState\(""\);/);
  assert.match(guest, /const deleteConfirmed = deleteConfirmName\.trim\(\) === name;/);
  assert.match(guest, /onDelete\(name, true\);/);
  assert.match(guest, /confirm=\$\{confirm \? "true" : "false"\}/);
});
