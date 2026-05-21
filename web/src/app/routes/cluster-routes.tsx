import { lazy, type ReactNode } from "react";
import { Navigate, Outlet, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import { appCenterRoutes } from "@/app/routes/app-center-routes";
import { computeRoutes } from "@/app/routes/compute-routes";
import { networkRoutes } from "@/app/routes/network-routes";
import { opsRoutes } from "@/app/routes/ops-routes";
import { vcenterRoutes } from "@/app/routes/vcenter-routes";
import ViewerRedirect from "@/app/guards/ViewerRedirect";

const BaotaDashboard = lazy(() => import("@/features/baota/pages/BaotaDashboard"));
const BaotaSync = lazy(() => import("@/features/baota/pages/BaotaSync"));
const IngressList = lazy(() => import("@/features/baota/pages/IngressList"));
const BaotaLayout = lazy(() => import("@/features/baota/pages/BaotaLayout"));
const BaotaSettingsPage = lazy(() => import("@/features/baota/pages/BaotaSettingsPage"));
const ClusterCustomResourcesLayout = lazy(() => import("@/features/cluster/pages/ClusterCustomResources"));
const ClusterCustomResourceCrdList = lazy(() =>
  import("@/features/cluster/pages/ClusterCustomResources").then((m) => ({
    default: m.ClusterCustomResourceCrdList,
  }))
);
const ClusterCustomResourceDetail = lazy(() =>
  import("@/features/cluster/pages/ClusterCustomResources").then((m) => ({
    default: m.ClusterCustomResourceDetail,
  }))
);
const ClusterCustomResourceInstances = lazy(() =>
  import("@/features/cluster/pages/ClusterCustomResources").then((m) => ({
    default: m.ClusterCustomResourceInstances,
  }))
);
const ClusterEtcdPage = lazy(() => import("@/features/cluster/pages/ClusterEtcdPage"));
const ClusterIngresses = lazy(() => import("@/features/cluster/pages/ClusterIngresses"));
const ClusterK8sSettings = lazy(() => import("@/features/cluster/pages/ClusterK8sSettings"));
const ClusterLayout = lazy(() => import("@/features/cluster/pages/ClusterLayout"));
const ClusterNamespacePicker = lazy(() => import("@/features/cluster/pages/ClusterNamespacePicker"));
const ClusterNamespaceResourcesLayout = lazy(() =>
  import("@/features/cluster/pages/ClusterNamespaceResourcesLayout")
);
const ClusterNodes = lazy(() => import("@/features/cluster/pages/ClusterNodes"));
const ClusterOverview = lazy(() => import("@/features/cluster/pages/ClusterOverview"));
const ClusterPods = lazy(() => import("@/features/cluster/pages/ClusterPods"));
const ClusterPodsAll = lazy(() => import("@/features/cluster/pages/ClusterPodsAll"));
const ClusterRBAC = lazy(() => import("@/features/cluster/pages/ClusterRBAC"));
const ClusterRBACServiceAccountDetail = lazy(() =>
  import("@/features/cluster/pages/ClusterRBACServiceAccountDetail")
);
const ClusterServices = lazy(() => import("@/features/cluster/pages/ClusterServices"));
const ClusterConfigMapsScoped = lazy(() =>
  import("@/features/cluster/pages/ClusterWorkloadPages").then((m) => ({
    default: m.ClusterConfigMapsScoped,
  }))
);
const ClusterDaemonSetsScoped = lazy(() =>
  import("@/features/cluster/pages/ClusterWorkloadPages").then((m) => ({
    default: m.ClusterDaemonSetsScoped,
  }))
);
const ClusterDeploymentsScoped = lazy(() =>
  import("@/features/cluster/pages/ClusterWorkloadPages").then((m) => ({
    default: m.ClusterDeploymentsScoped,
  }))
);
const ClusterPVCsScoped = lazy(() =>
  import("@/features/cluster/pages/ClusterWorkloadPages").then((m) => ({
    default: m.ClusterPVCsScoped,
  }))
);
const ClusterSecretsScoped = lazy(() =>
  import("@/features/cluster/pages/ClusterWorkloadPages").then((m) => ({
    default: m.ClusterSecretsScoped,
  }))
);
const ClusterStatefulSetsScoped = lazy(() =>
  import("@/features/cluster/pages/ClusterWorkloadPages").then((m) => ({
    default: m.ClusterStatefulSetsScoped,
  }))
);
const LegacyPodDetailRedirect = lazy(() => import("@/features/cluster/pages/LegacyPodDetailRedirect"));
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

function lazyElement(node: ReactNode): ReactNode {
  return <RouteSuspense>{node}</RouteSuspense>;
}

function clusterRouteChildren(): ReactNode {
  return (
    <>
      <Route
        path="baota"
        element={
          <ViewerRedirect to="/cluster">
            {lazyElement(<BaotaLayout />)}
          </ViewerRedirect>
        }
      >
        <Route index element={lazyElement(<BaotaDashboard />)} />
        <Route path="ingress" element={lazyElement(<IngressList />)} />
        <Route path="sync" element={lazyElement(<BaotaSync />)} />
        <Route path="settings" element={lazyElement(<BaotaSettingsPage />)} />
      </Route>
      <Route
        path="ns/:namespace/pods/:podName/terminal"
        element={
          <RouteSuspense>
            <ClusterPodTerminalPageLazy />
          </RouteSuspense>
        }
      />
      <Route element={lazyElement(<ClusterLayout />)}>
        <Route index element={lazyElement(<ClusterOverview />)} />
        <Route path="ns" element={lazyElement(<ClusterNamespacePicker />)} />
        <Route path="ns/:namespace" element={lazyElement(<ClusterNamespaceResourcesLayout />)}>
          <Route index element={<Navigate to="pods" replace />} />
          <Route
            path="pods/:podName"
            element={
              <RouteSuspense>
                <ClusterPodDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="pods" element={lazyElement(<ClusterPods />)} />
          <Route
            path="deployments/:workloadName"
            element={
              <RouteSuspense>
                <ClusterWorkloadDetailPage segment="deployments" />
              </RouteSuspense>
            }
          />
          <Route path="deployments" element={lazyElement(<ClusterDeploymentsScoped />)} />
          <Route
            path="statefulsets/:workloadName"
            element={
              <RouteSuspense>
                <ClusterWorkloadDetailPage segment="statefulsets" />
              </RouteSuspense>
            }
          />
          <Route path="statefulsets" element={lazyElement(<ClusterStatefulSetsScoped />)} />
          <Route
            path="daemonsets/:workloadName"
            element={
              <RouteSuspense>
                <ClusterWorkloadDetailPage segment="daemonsets" />
              </RouteSuspense>
            }
          />
          <Route path="daemonsets" element={lazyElement(<ClusterDaemonSetsScoped />)} />
          <Route
            path="services/:serviceName"
            element={
              <RouteSuspense>
                <ClusterServiceDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="services" element={lazyElement(<ClusterServices />)} />
          <Route
            path="ingresses/:ingressName"
            element={
              <RouteSuspense>
                <ClusterIngressDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="ingresses" element={lazyElement(<ClusterIngresses />)} />
          <Route
            path="pvcs/:pvcName/files"
            element={
              <RouteSuspense>
                <ClusterPVCFilesPageLazy />
              </RouteSuspense>
            }
          />
          <Route path="pvcs" element={lazyElement(<ClusterPVCsScoped />)} />
          <Route
            path="configmaps/:configMapName"
            element={
              <RouteSuspense>
                <ClusterConfigMapDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="configmaps" element={lazyElement(<ClusterConfigMapsScoped />)} />
          <Route
            path="secrets/:secretName"
            element={
              <RouteSuspense>
                <ClusterSecretDetailPage />
              </RouteSuspense>
            }
          />
          <Route path="secrets" element={lazyElement(<ClusterSecretsScoped />)} />
        </Route>
        <Route path="pods/:namespace/:podName" element={lazyElement(<LegacyPodDetailRedirect />)} />
        <Route path="pods" element={lazyElement(<ClusterPodsAll />)} />
        <Route path="statefulsets" element={<Navigate to="/cluster/ns?resource=statefulsets" replace />} />
        <Route path="services" element={<Navigate to="/cluster/ns?resource=services" replace />} />
        <Route path="ingresses" element={<Navigate to="/cluster/ns?resource=ingresses" replace />} />
        <Route path="pvcs" element={<Navigate to="/cluster/ns?resource=pvcs" replace />} />
        <Route path="configmaps" element={<Navigate to="/cluster/ns?resource=configmaps" replace />} />
        <Route path="secrets" element={<Navigate to="/cluster/ns?resource=secrets" replace />} />
        <Route path="deployments" element={<Navigate to="/cluster/ns?resource=deployments" replace />} />
        <Route path="daemonsets" element={<Navigate to="/cluster/ns?resource=daemonsets" replace />} />
        <Route path="nodes" element={lazyElement(<ClusterNodes />)} />
        <Route path="etcd" element={lazyElement(<ClusterEtcdPage />)} />
        <Route
          path="pod-restart-reports"
          element={
            <RouteSuspense>
              <PodRestartAiReportsPageLazy />
            </RouteSuspense>
          }
        />
        <Route path="rbac" element={lazyElement(<ClusterRBAC />)} />
        <Route path="rbac/sa/:namespace/:name" element={lazyElement(<ClusterRBACServiceAccountDetail />)} />
        <Route path="custom-resources" element={lazyElement(<ClusterCustomResourcesLayout />)}>
          <Route index element={lazyElement(<ClusterCustomResourceCrdList />)} />
          <Route
            path=":crdName/instances/:namespace/:objName"
            element={lazyElement(<ClusterCustomResourceDetail />)}
          />
          <Route path=":crdName" element={lazyElement(<ClusterCustomResourceInstances />)} />
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
        <Route path="settings" element={lazyElement(<ClusterK8sSettings />)} />
        <Route path="tools/ip-scan" element={<Navigate to="/cluster/compute/tools/ip-scan" replace />} />
        {computeRoutes()}
        {networkRoutes()}
        {appCenterRoutes()}
        {opsRoutes()}
        {vcenterRoutes()}
      </Route>
    </>
  );
}

export function clusterRoutes(basePath = "cluster"): ReactNode {
  const children = clusterRouteChildren();
  if (!basePath) {
    return <Route element={<Outlet />}>{children}</Route>;
  }
  return (
    <Route path={basePath} element={<Outlet />}>
      {children}
    </Route>
  );
}
