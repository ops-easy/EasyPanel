import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "../src");
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(rel) {
  return readFileSync(path.join(srcRoot, rel), "utf8");
}

function readRepo(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

test("high-risk management pages use in-app confirmation dialogs", () => {
  const confirmActionButton = readSrc("shared/ui/confirm-action-button.tsx");
  assert.match(confirmActionButton, /AlertDialog/);
  assert.match(confirmActionButton, /AlertDialogTrigger/);
  assert.match(confirmActionButton, /onConfirm/);

  const pages = [
    "features/docs/pages/DocsMedia.tsx",
    "features/ops/ai-inspect/pages/AiInspectReports.tsx",
    "features/ops/ai-inspect/pages/AiInspectLogDetails.tsx",
    "features/vcenter/pages/VCenterBastionSftpPanel.tsx",
    "features/app-center/mysql/pages/AppCenterMySQL.tsx",
    "features/app-center/kafka/pages/AppCenterKafka.tsx",
    "features/account/pages/AccountMyProfile.tsx",
    "features/account/pages/PlatformUsers.tsx",
    "features/app-center/cloudvm/pages/AppCenterCloudVm.tsx",
    "features/app-center/cloudvm/pages/AppCenterCloudVmDetail.tsx",
    "features/baota/pages/IngressList.tsx",
    "features/cluster/pages/ClusterConfigMapDetail.tsx",
    "features/cluster/pages/ClusterCustomResources.tsx",
    "features/cluster/pages/ClusterEtcdPage.tsx",
    "features/cluster/pages/ClusterIngressDetail.tsx",
    "features/cluster/pages/ClusterIngresses.tsx",
    "features/cluster/pages/ClusterK8sKubePrometheusStackSection.tsx",
    "features/cluster/pages/ClusterK8sListPage.tsx",
    "features/cluster/pages/ClusterK8sVmLogSection.tsx",
    "features/cluster/pages/ClusterOverviewPodsWorkloadPanel.tsx",
    "features/cluster/pages/ClusterPVCFilesPage.tsx",
    "features/cluster/pages/ClusterRBAC.tsx",
    "features/cluster/pages/ClusterSecretDetail.tsx",
    "features/cluster/pages/ClusterServiceDetail.tsx",
    "features/cluster/pages/ClusterServices.tsx",
    "features/cluster/pages/ClusterWorkloadDetail.tsx",
    "features/cluster/pages/K8sConnectWizard.tsx",
    "features/cluster/pages/PodListBlock.tsx",
    "features/cluster/pages/k8s/K8sGraphicEditDialog.tsx",
    "features/compute/pve/components/PveTargetForm.tsx",
    "features/compute/pve/components/PveTargetSettingsPanel.tsx",
    "features/compute/pve/pages/PveGuestDetail.tsx",
    "features/compute/pve/pages/PveWorkspace.tsx",
    "features/network/ikuai/pages/IkuaiConfigurationGate.tsx",
    "features/network/openwrt/pages/OpenWrtTargetPanel.tsx",
    "features/network/pages/NetworkConfigPage.tsx",
    "features/settings/components/SettingsPrometheusSection.tsx",
    "features/settings/components/SettingsRuntimeSection.tsx",
    "features/vcenter/pages/CloudHosts.tsx",
    "features/vcenter/pages/VCenterBastion.tsx",
    "features/vcenter/pages/VCenterBastionAdmin.tsx",
    "features/vcenter/pages/VCenterConnectWizard.tsx",
  ];

  for (const page of pages) {
    const source = readSrc(page);
    assert.match(source, /ConfirmActionButton/);
    assert.doesNotMatch(source, /window\.confirm/);
    assert.doesNotMatch(source, /\bconfirm\s*\(/);
  }

  const docsEditor = readSrc("md-editor/EditorContainer.tsx");
  assert.match(docsEditor, /AlertDialog/);
  assert.match(docsEditor, /requestConfirm/);
  assert.doesNotMatch(docsEditor, /window\.confirm/);
  assert.doesNotMatch(docsEditor, /\bconfirm\s*\(/);
});

test("mutation confirmation helpers do not expose native confirm wrappers", () => {
  for (const rel of [
    "lib/ops-mutation-confirm.ts",
    "features/account/lib/accountMutationConfirm.ts",
    "features/app-center/lib/appCenterMutationConfirm.ts",
    "features/cluster/lib/k8sMutationConfirm.ts",
    "features/compute/pve/lib/pveMutationConfirm.ts",
    "features/network/lib/networkMutationConfirm.ts",
    "features/vcenter/lib/hostMutationConfirm.ts",
  ]) {
    const source = readSrc(rel);
    assert.doesNotMatch(source, /window\.confirm/);
    assert.doesNotMatch(source, /export function confirm[A-Za-z]+Mutation/);
  }
});

test("platform infrastructure writes send explicit confirmation semantics", () => {
  const prometheus = readSrc("features/settings/components/SettingsPrometheusSection.tsx");
  assert.match(prometheus, /\/api\/prometheus\/source",\s*withOpsMutationConfirm\(/);
  assert.doesNotMatch(prometheus, /apiPostJson\("\/api\/prometheus\/source",\s*\{\s*baseUrl/s);

  const docsMedia = readSrc("features/docs/pages/DocsMedia.tsx");
  assert.match(docsMedia, /\/api\/docs\/attachment-storage",\s*withOpsMutationConfirm\(/);
  assert.match(docsMedia, /withOpsMutationConfirmQuery\("\/api\/docs\/attachment-storage\/cos"\)/);
  assert.match(docsMedia, /withOpsMutationConfirmQuery\(`\/api\/docs\/media\/\$\{id\}`\)/);

  const docsEditor = readSrc("md-editor/EditorContainer.tsx");
  assert.match(docsEditor, /from "@\/lib\/ops-mutation-confirm"/);
  assert.match(docsEditor, /publishedChanged \? withOpsMutationConfirm\(payload\) : payload/);
  assert.match(docsEditor, /发布公开页/);
  assert.match(docsEditor, /publishedChanged[\s\S]*requestConfirm\(\{[\s\S]*saveMut\.mutate\(\)/);
  assert.match(docsEditor, /\/api\/docs\/guides\/\$\{encodeURIComponent\(currentGuide\.guideKey\)\}`, withOpsMutationConfirm\(/);
  assert.match(docsEditor, /保存页面指南标识/);
  assert.match(docsEditor, /apiPutJson\(`\/api\/docs\/\$\{activeNumericId\}`, withOpsMutationConfirm\(payload\)\)/);
  assert.match(docsEditor, /保存分享设置/);
  assert.match(docsEditor, /apiDeleteJson\(withOpsMutationConfirmQuery\(`\/api\/docs\/\$\{id\}`\)\)/);
  assert.match(docsEditor, /\/restore-version`,\s*withOpsMutationConfirm\(\{\s*versionNo\s*\}\)/);

  const bastionAdmin = readSrc("features/vcenter/pages/VCenterBastionAdmin.tsx");
  assert.match(bastionAdmin, /\/api\/vcenter\/bastion\/policy",\s*withHostMutationConfirm\(/);

  const shipper = readSrc("features/ops/ai-inspect/pages/VmLogShipperAssistant.tsx");
  assert.match(shipper, /\/api\/ops\/vmlog\/vm-shipper\/apply",\s*withOpsMutationConfirm\(body\)/);

  const platformUsers = readSrc("features/account/pages/PlatformUsers.tsx");
  assert.match(platformUsers, /withAccountMutationConfirm\(\{\s*email,/);
  assert.match(platformUsers, /withAccountMutationConfirmQuery\(`\/api\/admin\/users\/\$\{id\}`\)/);
  assert.match(platformUsers, /\/api\/admin\/users\/oidc\/unbind",\s*withAccountMutationConfirm\(/);

  const accountProfile = readSrc("features/account/pages/AccountMyProfile.tsx");
  assert.match(accountProfile, /\/api\/account\/profile",\s*withAccountMutationConfirm\(payload\)/);
  assert.match(accountProfile, /\/api\/account\/profile\/oidc\/unbind",\s*withAccountMutationConfirm\(/);

  const podRestartAi = readSrc("features/cluster/pages/PodRestartAiPanel.tsx");
  assert.match(podRestartAi, /\/api\/k8s\/pod-restart-ai\/reports",\s*withOpsMutationConfirm\(/);

  const aiInspectReports = readSrc("features/ops/ai-inspect/pages/AiInspectReports.tsx");
  assert.match(aiInspectReports, /withOpsMutationConfirmQuery\(`\/api\/k8s\/pod-restart-ai\/reports\/\$\{id\}`\)/);
});

test("backend infrastructure handlers reject missing confirmation before mutating state", () => {
  const prometheus = readRepo("backend/common/core/prometheus_proxy.go");
  assert.match(prometheus, /Confirm\s+bool\s+`json:"confirm"`/);
  assert.match(prometheus, /requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"Prometheus/);

  const docs = readRepo("backend/common/core/docs_handlers.go");
  assert.match(docs, /Confirm\s+bool\s+`json:"confirm"`/);
  assert.match(docs, /requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"docs attachment storage update"\)/);
  assert.match(docs, /requireOpsMutationConfirm\(c,\s*opsMutationConfirmed\(c\.Query\("confirm"\)\),\s*"docs attachment storage clear"\)/);
  assert.match(docs, /body\.Published \|\| body\.NewSharePassword != nil[\s\S]*requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"docs public sharing create"\)/);
  assert.match(docs, /body\.NewSharePassword != nil[\s\S]*requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"docs public sharing update"\)/);
  assert.match(docs, /curPub != pub && !requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"docs public sharing update"\)/);
  assert.match(docs, /requireOpsMutationConfirm\(c,\s*opsMutationConfirmed\(c\.Query\("confirm"\)\),\s*"docs delete"\)[\s\S]*docsRequireMySQL/);
  assert.match(docs, /requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"docs version restore"\)[\s\S]*docsRequireMySQL/);
  assert.match(docs, /requireOpsMutationConfirm\(c,\s*opsMutationConfirmed\(c\.Query\("confirm"\)\),\s*"docs media delete"\)[\s\S]*docsRequireMySQL/);

  const docsGuides = readRepo("backend/common/core/docs_guides.go");
  assert.match(docsGuides, /requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"docs guide create"\)[\s\S]*docsRequireMySQL/);
  assert.match(docsGuides, /requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"docs guide update"\)[\s\S]*docsRequireMySQL/);
  assert.match(docsGuides, /requireOpsMutationConfirm\(c,\s*opsMutationConfirmed\(c\.Query\("confirm"\)\),\s*"docs guide delete"\)[\s\S]*docsRequireMySQL/);

  const network = readRepo("backend/api/network/service/devices.go");
  assert.match(network, /requireNetworkConfirm\(c,\s*body\.Confirm,\s*"network device update"\)[\s\S]*loadNetworkDevices/);

  const networkProviderConfig = readRepo("backend/api/network/service/provider_config.go");
  assert.match(networkProviderConfig, /if !body\.Confirm \{\s*c\.JSON\(http\.StatusBadRequest,\s*gin\.H\{"error": "network config apply requires confirm=true"\}\)[\s\S]*providerDeviceForRequest/);
  assert.match(networkProviderConfig, /case networkDeviceKindIkuai:\s*if !body\.Confirm \{\s*c\.JSON\(http\.StatusBadRequest,\s*gin\.H\{"error": "iKuai action requires confirm=true"\}\)/);

  const networkOpenWrt = readRepo("backend/api/network/service/openwrt.go");
  assert.match(networkOpenWrt, /OpenWrt config apply requires confirm=true[\s\S]*openWrtDeviceForRequest/);

  const restartAi = readRepo("backend/common/core/k8s_restart_ai_handlers.go");
  assert.match(restartAi, /requireOpsMutationConfirm\(c,\s*body\.Confirm,\s*"K8s restart AI report save"\)[\s\S]*app\.MySQLDB\(\)/);
  assert.match(restartAi, /requireOpsMutationConfirm\(c,\s*opsMutationConfirmed\(c\.Query\("confirm"\)\),\s*"K8s restart AI report delete"\)[\s\S]*app\.MySQLDB\(\)/);

  const pveTargets = readRepo("backend/api/pve/service/targets.go");
  assert.match(pveTargets, /requirePVEConfirm\(c,\s*body\.Confirm,\s*"PVE target create"\)[\s\S]*pveEncryptionKey/);
  assert.match(pveTargets, /requirePVEConfirm\(c,\s*body\.Confirm,\s*"PVE target update"\)[\s\S]*pveEncryptionKey/);
  assert.match(pveTargets, /requirePVEConfirm\(c,\s*pveConfirmed\(c\.Query\("confirm"\)\),\s*"PVE target delete"\)[\s\S]*loadPVETargets/);

  const pveGuestOps = readRepo("backend/api/pve/service/guest_ops.go");
  assert.match(pveGuestOps, /requirePVEConfirm\(c,\s*pveConsumeConfirmForm\(form\),\s*"PVE Guest snapshot create"\)[\s\S]*normalizePVEGuestSnapshotCreateForm/);
});
