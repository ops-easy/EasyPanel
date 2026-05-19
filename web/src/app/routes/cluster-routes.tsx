import { lazy, type ReactNode } from "react";
import { Navigate, Outlet, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import { appCenterRoutes } from "@/app/routes/app-center-routes";
import { opsRoutes } from "@/app/routes/ops-routes";
import { vcenterRoutes } from "@/app/routes/vcenter-routes";
import ViewerRedirect from "@/app/guards/ViewerRedirect";
import BaotaSync from "@/features/baota/pages/BaotaSync";
import IngressList from "@/features/baota/pages/IngressList";
import BaotaLayout from "@/features/baota/pages/BaotaLayout";
import BaotaSettingsPage from "@/features/baota/pages/BaotaSettingsPage";
import ClusterCustomResourcesLayout, {
  ClusterCustomResourceCrdList,
  ClusterCustomResourceDetail,
  ClusterCustomResourceInstances,
} from "@/features/cluster/pages/ClusterCustomResources";
import ClusterEtcdPage from "@/features/cluster/pages/ClusterEtcdPage";
import ClusterIngresses from "@/features/cluster/pages/ClusterIngresses";
import ClusterK8sSettings from "@/features/cluster/pages/ClusterK8sSettings";
import ClusterLayout from "@/features/cluster/pages/ClusterLayout";
import ClusterNamespacePicker from "@/features/cluster/pages/ClusterNamespacePicker";
import ClusterNamespaceResourcesLayout from "@/features/cluster/pages/ClusterNamespaceResourcesLayout";
import ClusterNodes from "@/features/cluster/pages/ClusterNodes";
import ClusterOverview from "@/features/cluster/pages/ClusterOverview";
import ClusterPods from "@/features/cluster/pages/ClusterPods";
import ClusterPodsAll from "@/features/cluster/pages/ClusterPodsAll";
import ClusterRBAC from "@/features/cluster/pages/ClusterRBAC";
import ClusterRBACServiceAccountDetail from "@/features/cluster/pages/ClusterRBACServiceAccountDetail";
import ClusterServices from "@/features/cluster/pages/ClusterServices";
import {
  ClusterConfigMapsScoped,
  ClusterDaemonSetsScoped,
  ClusterDeploymentsScoped,
  ClusterPVCsScoped,
  ClusterSecretsScoped,
  ClusterStatefulSetsScoped,
} from "@/features/cluster/pages/ClusterWorkloadPages";
import LegacyPodDetailRedirect from "@/features/cluster/pages/LegacyPodDetailRedirect";

const HarborSectionPage = lazy(() => import("@/features/harbor/pages/HarborSection"));
const HarborProjectsPageLazy = lazy(() => import("@/features/harbor/pages/HarborProjectsPage"));
const HarborReposPageLazy = lazy(() => import("@/features/harbor/pages/HarborReposPage"));
const HarborArtifactsPageLazy = lazy(() => import("@/features/harbor/pages/HarborArtifactsPage"));
const ClusterPodDetailPage = lazy(() => import("@/features/cluster/pages/ClusterPodDetail"));
const ClusterPodTerminalPageLazy = lazy(() => import("@/features/cluster/pages/ClusterPodTerminalPage"));
const ClusterWorkloadDetailPage = lazy(() => import("@/features/cluster/pages/ClusterWorkloadDetail"));
const ClusterServiceDetailPage = lazy(() => import("@/features/cluster/pages/ClusterServiceDetail"));
const ClusterIngressDetailPage = lazy(() => import("@/features/cluster/pages/ClusterIngressDetail"));
const ClusterConfigMapDetailPage = lazy(() => import("@/features/cluster/pages/ClusterConfigMapDetail"));
const ClusterSecretDetailPage = lazy(() => import("@/features/cluster/pages/ClusterSecretDetail"));
const ClusterPVCFilesPageLazy = lazy(() => import("@/features/cluster/pages/ClusterPVCFilesPage"));
const PodRestartAiReportsPageLazy = lazy(() => import("@/features/cluster/pages/PodRestartAiReportsPage"));

export function clusterRoutes(): ReactNode {
  return (
    <Route path="cluster" element={<Outlet />}>
      <Route
        path="baota"
        element={
          <ViewerRedirect to="/cluster">
            <BaotaLayout />
          </ViewerRedirect>
        }
      >
        <Route index element={<Navigate to="sync" replace />} />
        <Route path="ingress" element={<IngressList />} />
        <Route path="sync" element={<BaotaSync />} />
        <Route path="settings" element={<BaotaSettingsPage />} />
      </Route>
      <Route
        path="ns/:namespace/pods/:podName/terminal"
        element={
          <RouteSuspense>
            <ClusterPodTerminalPageLazy />
          </RouteSuspense>
        }
      />
      <Route element={<ClusterLayout />}>
        <Route index element={<ClusterOverview />} />
        <Route path="ns" element={<ClusterNamespacePicker />} />
        <Route path="ns/:namespace" element={<ClusterNamespaceResourcesLayout />}>
          <Route index element={<Navigate to="pods" replace />} />
          <Route
            path="pods/:podName"
            element={
              <RouteSuspense>
                <ClusterPodDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="pods" element={<ClusterPods />} />
          <Route
            path="deployments/:workloadName"
            element={
              <RouteSuspense>
                <ClusterWorkloadDetailPage segment="deployments" />
              </RouteSuspense>
            }
          />
          <Route path="deployments" element={<ClusterDeploymentsScoped />} />
          <Route
            path="statefulsets/:workloadName"
            element={
              <RouteSuspense>
                <ClusterWorkloadDetailPage segment="statefulsets" />
              </RouteSuspense>
            }
          />
          <Route path="statefulsets" element={<ClusterStatefulSetsScoped />} />
          <Route
            path="daemonsets/:workloadName"
            element={
              <RouteSuspense>
                <ClusterWorkloadDetailPage segment="daemonsets" />
              </RouteSuspense>
            }
          />
          <Route path="daemonsets" element={<ClusterDaemonSetsScoped />} />
          <Route
            path="services/:serviceName"
            element={
              <RouteSuspense>
                <ClusterServiceDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="services" element={<ClusterServices />} />
          <Route
            path="ingresses/:ingressName"
            element={
              <RouteSuspense>
                <ClusterIngressDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="ingresses" element={<ClusterIngresses />} />
          <Route
            path="pvcs/:pvcName/files"
            element={
              <RouteSuspense>
                <ClusterPVCFilesPageLazy />
              </RouteSuspense>
            }
          />
          <Route path="pvcs" element={<ClusterPVCsScoped />} />
          <Route
            path="configmaps/:configMapName"
            element={
              <RouteSuspense>
                <ClusterConfigMapDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="configmaps" element={<ClusterConfigMapsScoped />} />
          <Route
            path="secrets/:secretName"
            element={
              <RouteSuspense>
                <ClusterSecretDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="secrets" element={<ClusterSecretsScoped />} />
        </Route>
        <Route path="pods/:namespace/:podName" element={<LegacyPodDetailRedirect />} />
        <Route path="pods" element={<ClusterPodsAll />} />
        <Route path="statefulsets" element={<Navigate to="/cluster/ns?resource=statefulsets" replace />} />
        <Route path="services" element={<Navigate to="/cluster/ns?resource=services" replace />} />
        <Route path="ingresses" element={<Navigate to="/cluster/ns?resource=ingresses" replace />} />
        <Route path="pvcs" element={<Navigate to="/cluster/ns?resource=pvcs" replace />} />
        <Route path="configmaps" element={<Navigate to="/cluster/ns?resource=configmaps" replace />} />
        <Route path="secrets" element={<Navigate to="/cluster/ns?resource=secrets" replace />} />
        <Route path="deployments" element={<Navigate to="/cluster/ns?resource=deployments" replace />} />
        <Route path="daemonsets" element={<Navigate to="/cluster/ns?resource=daemonsets" replace />} />
        <Route path="nodes" element={<ClusterNodes />} />
        <Route path="etcd" element={<ClusterEtcdPage />} />
        <Route
          path="pod-restart-reports"
          element={
            <RouteSuspense>
              <PodRestartAiReportsPageLazy />
            </RouteSuspense>
          }
        />
        <Route path="rbac" element={<ClusterRBAC />} />
        <Route path="rbac/sa/:namespace/:name" element={<ClusterRBACServiceAccountDetail />} />
        <Route path="custom-resources" element={<ClusterCustomResourcesLayout />}>
          <Route index element={<ClusterCustomResourceCrdList />} />
          <Route
            path=":crdName/instances/:namespace/:objName"
            element={<ClusterCustomResourceDetail />}
          />
          <Route path=":crdName" element={<ClusterCustomResourceInstances />} />
        </Route>
        <Route
          path="harbor"
          element={
            <RouteSuspense>
              <HarborSectionPage />
            </RouteSuspense>
          }
        >
          <Route
            index
            element={
              <RouteSuspense>
                <HarborProjectsPageLazy />
              </RouteSuspense>
            }
          />
          <Route
            path="p/:projectName"
            element={
              <RouteSuspense>
                <HarborReposPageLazy />
              </RouteSuspense>
            }
          />
          <Route
            path="p/:projectName/*"
            element={
              <RouteSuspense>
                <HarborArtifactsPageLazy />
              </RouteSuspense>
            }
          />
        </Route>
        <Route path="settings" element={<ClusterK8sSettings />} />
        <Route path="tools/ip-scan" element={<Navigate to="/cluster/vcenter/tools/ip-scan" replace />} />
        {appCenterRoutes()}
        {opsRoutes()}
        {vcenterRoutes()}
      </Route>
    </Route>
  );
}
