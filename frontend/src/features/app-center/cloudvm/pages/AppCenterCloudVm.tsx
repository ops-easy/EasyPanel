import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  FileCode,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  LayoutDashboard,
  Loader2,
  Network,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";
import { Checkbox } from "@/shared/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { cloudVmAppCenterCanWrite } from "@/lib/platform-permissions";
import { LogoBaota, LogoDocker, LogoHysteria2, LogoNginx } from "@/features/app-center/cloudvm/components/CloudVmSoftwareLogos";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CLOUD_VM_LIST_PATH = "/cluster/apps/cloud-vm";
const CLOUD_VM_CREATE_PATH = "/cluster/apps/cloud-vm/create";
const BOOTSTRAP_PATH = "/cluster/apps/cloud-vm/bootstrap";
type CloudVmPageTab = "list" | "create" | "bootstrap";
type CloudVmRouteState = {
  allowIncompleteBootstrap?: boolean;
  mainTab?: CloudVmPageTab;
};

const CLOUD_VM_CAPABILITIES = [
  { title: "SSH 工作机", detail: "在 Kubernetes 中创建可 root 登录的容器化工作机，外部通过节点 IP + NodePort 访问。" },
  { title: "持久化数据盘", detail: "数据集中落到 /data，镜像重启后保留工作目录、Docker 数据、站点文件和脚本日志。" },
  { title: "资源监控", detail: "接入 Kubernetes Prometheus 后，在列表直接显示 CPU 与内存相对 limit 的使用率。" },
  { title: "自定义软件", detail: "创建时可选择 Docker、Nginx、宝塔、Hysteria2 客户端和常用 CLI 工具。" },
  { title: "出站代理", detail: "Hysteria2 客户端可暴露集群内 HTTP/SOCKS 代理，供 OpenClaw 等 Pod 走出站链路。" },
  { title: "初始化脚本", detail: "支持 bash 初始化脚本、环境变量、command 与 args，便于把工作机做成可复用模板。" },
] as const;

type Bootstrap = {
  bootstrapComplete: boolean;
  images: { id: string; label: string; image: string; bakedInSSH?: boolean }[];
  defaultNamespace: string;
  /** 访问地址展示用节点；空则自动选集群首个节点 IP */
  defaultAccessNodeName?: string;
};

type InstanceRow = {
  id: number;
  name: string;
  namespace: string;
  /** RFC3339 */
  createdAt?: string;
  summary: { nodeIP?: string; sshPort?: number; phase?: string; image?: string };
};

type UsageItem = {
  id: number;
  phase?: string;
  cpuPercent?: number | null;
  memPercent?: number | null;
  cpuUsageCores?: number | null;
  memUsageBytes?: number | null;
  cpuLimitCores?: number;
  memLimitBytes?: number;
  cpuQuery?: string | null;
  memQuery?: string | null;
};

function CloudVmInstanceResourceCell({
  u,
  promConfigured,
  usagePending,
}: {
  u: UsageItem | undefined;
  promConfigured: boolean;
  usagePending: boolean;
}) {
  if (usagePending) {
    return (
      <TableCell className="align-middle">
        <span className="text-xs text-slate-400">加载中…</span>
      </TableCell>
    );
  }

  const pctCpu = u?.cpuPercent;
  const pctMem = u?.memPercent;
  const cpuOk = pctCpu != null && Number.isFinite(pctCpu);
  const memOk = pctMem != null && Number.isFinite(pctMem);
  const showBars = cpuOk || memOk;

  if (!showBars) {
    return (
      <TableCell className="align-middle">
        <span className="text-xs text-slate-500">
          {!promConfigured ? "未配置监控" : "暂无使用率数据"}
        </span>
      </TableCell>
    );
  }

  return (
    <TableCell className="align-top">
      <div className="flex w-full min-w-[220px] max-w-[min(100%,320px)] flex-col gap-2 py-0.5">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] font-medium text-slate-500">CPU</span>
          {cpuOk ? (
            <>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width]"
                  style={{ width: `${Math.min(100, Math.max(0, pctCpu!))}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right tabular-nums text-[10px] text-slate-800">
                {pctCpu!.toFixed(0)}%
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 text-[11px] text-slate-400">—</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] font-medium text-slate-500">内存</span>
          {memOk ? (
            <>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-violet-500 transition-[width]"
                  style={{ width: `${Math.min(100, Math.max(0, pctMem!))}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right tabular-nums text-[10px] text-slate-800">
                {pctMem!.toFixed(0)}%
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 text-[11px] text-slate-400">—</span>
          )}
        </div>
      </div>
    </TableCell>
  );
}

const STEPS = [
  { n: 1, title: "基础配置", desc: "名称、系统镜像、登录密码" },
  { n: 2, title: "规格与存储", desc: "CPU、内存、数据盘" },
  { n: 3, title: "网络与高级", desc: "SSH 端口、初始化脚本、环境变量与启动命令" },
  { n: 4, title: "自定义软件", desc: "Docker、Nginx、宝塔、Hysteria2 客户端与常用 CLI" },
] as const;

const CLI_PKG_OPTIONS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "vim", label: "vim", Icon: FileCode },
  { id: "wget", label: "wget", Icon: Download },
  { id: "curl", label: "curl", Icon: Globe },
  { id: "iftop", label: "iftop", Icon: Gauge },
  { id: "iotop", label: "iotop", Icon: Cpu },
  { id: "htop", label: "htop", Icon: LayoutDashboard },
  { id: "git", label: "git", Icon: GitBranch },
  { id: "unzip", label: "unzip", Icon: Archive },
  { id: "net-tools", label: "net-tools", Icon: Network },
];

export default function AppCenterCloudVm({ initialTab = "create" }: { initialTab?: CloudVmPageTab }) {
  const { status } = useAuth();
  const perm = status?.permissions;
  const canWrite = cloudVmAppCenterCanWrite(status?.role, perm);
  const isAdmin = status?.role === "admin";
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const routeState = location.state as CloudVmRouteState | null;
  const allowIncompleteBootstrap = routeState?.allowIncompleteBootstrap === true;
  const incompleteBootstrapNavState = allowIncompleteBootstrap ? { allowIncompleteBootstrap: true } : undefined;
  const routeMainTab =
    routeState?.mainTab === "list" || routeState?.mainTab === "create" || routeState?.mainTab === "bootstrap"
      ? routeState.mainTab
      : undefined;
  const effectiveInitialTab = routeMainTab ?? initialTab;

  const [mainTab, setMainTab] = useState<CloudVmPageTab>(effectiveInitialTab);
  const [step, setStep] = useState(1);

  useEffect(() => {
    setMainTab(effectiveInitialTab);
    if (effectiveInitialTab === "create") {
      setStep(1);
    }
  }, [effectiveInitialTab]);

  const bootQ = useQuery({
    queryKey: ["app-center-cloud-vm-bootstrap"],
    queryFn: ({ signal }) => apiGetJson<Bootstrap>("/api/app-center/cloud-vm/bootstrap", { signal }),
  });

  const listQ = useQuery({
    queryKey: ["app-center-cloud-vm-instances"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: InstanceRow[]; mysqlRequired?: boolean }>(
        "/api/app-center/cloud-vm/instances"
      , { signal }),
  });

  const instances = useMemo(() => listQ.data?.instances ?? [], [listQ.data?.instances]);
  const usageQ = useQuery({
    queryKey: ["app-center-cloud-vm-usage"],
    queryFn: ({ signal }) =>
      apiGetJson<{ prometheusConfigured?: boolean; items: UsageItem[] }>(
        "/api/app-center/cloud-vm/instances/usage"
      , { signal }),
    enabled: instances.length > 0 && !listQ.data?.mysqlRequired,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const usageById = useMemo(() => {
    const m = new Map<number, UsageItem>();
    for (const u of usageQ.data?.items ?? []) {
      m.set(u.id, u);
    }
    return m;
  }, [usageQ.data?.items]);
  const runningCount = useMemo(
    () => instances.filter((row) => row.summary?.phase === "running").length,
    [instances]
  );
  const defaultImageLabel = bootQ.data?.images?.[0]?.label || "未配置";
  const listRefreshing = listQ.isFetching || usageQ.isFetching;

  const [form, setForm] = useState({
    name: "",
    imageId: "",
    rootPassword: "",
    cpuRequest: "500m",
    cpuLimit: "2",
    memRequest: "512Mi",
    memLimit: "2Gi",
    pvcSize: "20Gi",
    storageClass: "",
    nodePort: 0 as number,
    envText: "",
    commandText: "",
    argsText: "",
    initScript: "",
    installDocker: false,
    installNginx: false,
    installBaota: false,
    installHysteria2: false,
    hysteria2ListenPort: 8080,
    hysteria2ConfigYaml: "",
    cliPackages: [] as string[],
  });

  const selectedBootstrapImage = useMemo(
    () => (bootQ.data?.images ?? []).find((im) => im.id === form.imageId),
    [bootQ.data?.images, form.imageId]
  );

  useEffect(() => {
    const imgs = bootQ.data?.images ?? [];
    if (imgs.length && !form.imageId) {
      setForm((f) => ({ ...f, imageId: imgs[0].id }));
    }
  }, [bootQ.data, form.imageId]);

  const createMut = useMutation({
    mutationFn: () => {
      let env: { name: string; value: string }[] = [];
      const t = form.envText.trim();
      if (t) {
        try {
          const parsed = JSON.parse(t) as unknown;
          if (Array.isArray(parsed)) {
            env = parsed as { name: string; value: string }[];
          }
        } catch {
          throw new Error("环境变量须为 JSON 数组：[{name,value},...]");
        }
      }
      let command: string[] | undefined;
      let args: string[] | undefined;
      const ct = form.commandText.trim();
      if (ct) {
        try {
          const parsed = JSON.parse(ct) as unknown;
          if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
            command = parsed as string[];
          } else {
            throw new Error();
          }
        } catch {
          throw new Error("启动命令须为 JSON 字符串数组，例如 [\"/bin/bash\"]");
        }
      }
      const at = form.argsText.trim();
      if (at) {
        try {
          const parsed = JSON.parse(at) as unknown;
          if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
            args = parsed as string[];
          } else {
            throw new Error();
          }
        } catch {
          throw new Error("命令参数须为 JSON 字符串数组");
        }
      }
      if (form.installHysteria2 && !form.hysteria2ConfigYaml.trim()) {
        throw new Error("已勾选 Hysteria2 客户端时请粘贴 hysteria2:// 分享链接或填写/导入客户端 YAML");
      }
      return apiPostJson<{ id: number }>("/api/app-center/cloud-vm/instances", {
        name: form.name,
        imageId: form.imageId,
        rootPassword: form.rootPassword,
        cpuRequest: form.cpuRequest,
        cpuLimit: form.cpuLimit,
        memRequest: form.memRequest,
        memLimit: form.memLimit,
        pvcSize: form.pvcSize,
        storageClassName: form.storageClass.trim() || undefined,
        nodePort: form.nodePort || undefined,
        env,
        command,
        args,
        initScript: form.initScript.trim(),
        software: {
          installDocker: form.installDocker,
          installNginx: form.installNginx,
          installBaota: form.installBaota,
          installHysteria2: form.installHysteria2,
          hysteria2ListenPort: form.hysteria2ListenPort || 8080,
          hysteria2ConfigYaml: form.hysteria2ConfigYaml.trim(),
          cliPackages: form.cliPackages,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("已创建");
      setMainTab("list");
      setStep(1);
      void qc.invalidateQueries({ queryKey: ["app-center-cloud-vm-instances"] });
      navigate(`/cluster/apps/cloud-vm/${res.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const step1Ok =
    form.name.trim().length >= 2 && Boolean(form.imageId) && form.rootPassword.length >= 8;

  const goNext = () => {
    if (step === 1 && !step1Ok) {
      toast.error("请填写名称（≥2 字符）、选择镜像，并设置 root 密码（≥8 位）");
      return;
    }
    if (step < 4) setStep((s) => s + 1);
  };
  const goPrev = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const openCreateTab = () => {
    setStep(1);
    navigate(CLOUD_VM_CREATE_PATH, { state: incompleteBootstrapNavState });
  };

  const onMainTabChange = (value: string) => {
    const next = value as CloudVmPageTab;
    setMainTab(next);
    if (next === "create") {
      setStep(1);
      navigate(CLOUD_VM_CREATE_PATH, { state: incompleteBootstrapNavState });
      return;
    }
    if (next === "bootstrap") {
      navigate(BOOTSTRAP_PATH);
      return;
    }
    navigate(CLOUD_VM_LIST_PATH, {
      state: { ...incompleteBootstrapNavState, mainTab: "list" },
    });
  };

  if (bootQ.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载…
      </p>
    );
  }

  if (bootQ.data && !bootQ.data.bootstrapComplete && !canWrite) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        容器主机镜像尚未完成首次引导。管理员请打开{" "}
        <Link to={BOOTSTRAP_PATH} className="font-mono font-semibold underline">
          {BOOTSTRAP_PATH}
        </Link>{" "}
        完成配置。
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-slate-50/80 px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-900/80">应用中心</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <HardDrive className="h-7 w-7 text-indigo-600" />
          容器主机
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Kubernetes 中的轻量 SSH 工作机入口：支持镜像模板、规格与数据盘、NodePort 登录、初始化脚本、
          环境变量、自定义软件和 Hysteria2 出站代理。仅 <code className="rounded bg-slate-100 px-1">/data</code> 持久化。
        </p>
      </section>

      {listQ.data?.mysqlRequired && (
        <p className="text-sm text-amber-800">需要 MySQL 以保存实例元数据。</p>
      )}

      <Tabs value={mainTab} onValueChange={onMainTabChange} className="gap-3">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1">
          <TabsTrigger value="create" className="rounded-lg">
            部署向导
          </TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="bootstrap" className="rounded-lg">
              模板配置
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="list" className="rounded-lg">
            已部署实例
          </TabsTrigger>
        </TabsList>

      {mainTab === "list" ? (
        <TabsContent value="list" className="outline-none">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">实例</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{instances.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">运行中</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{runningCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">默认镜像</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-950">{defaultImageLabel}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">容器主机管理能力</h2>
                <p className="mt-1 text-xs text-slate-500">创建后可在实例详情里管理 SSH、资源、终端和运行配置。</p>
              </div>
              {canWrite ? (
                <Button type="button" size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={openCreateTab}>
                  <Plus className="h-4 w-4" />
                  创建容器主机
                </Button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {CLOUD_VM_CAPABILITIES.map((item) => (
                <div key={item.title} className="min-h-[92px] rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-3">
                  <p className="text-sm font-medium text-slate-950">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {usageQ.data?.prometheusConfigured === false && instances.length > 0 ? (
            <p className="text-xs text-slate-600">
              未配置 Kubernetes Prometheus（<code className="rounded bg-slate-100 px-1">prometheusUrlK8s</code>
              ），列表仅显示创建时间与阶段；配置后可显示 CPU/内存占用率（相对 limit）。
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-950">容器主机实例</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={listRefreshing}
              onClick={() => {
                void listQ.refetch();
                void usageQ.refetch();
              }}
            >
              <RefreshCw className={cn("h-4 w-4", listRefreshing && "animate-spin")} />
              刷新状态
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead className="min-w-[120px]">镜像</TableHead>
                  <TableHead className="whitespace-nowrap">创建时间</TableHead>
                  <TableHead className="min-w-[220px]">资源（相对 limit）</TableHead>
                  <TableHead>访问</TableHead>
                  <TableHead>阶段</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center">
                      <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                        <span>暂无容器主机实例</span>
                        {canWrite ? (
                          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={openCreateTab}>
                            <Plus className="h-4 w-4" />
                            创建容器主机
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  instances.map((row) => {
                    const u = usageById.get(row.id);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-sm">{row.name}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-slate-600" title={row.summary?.image}>
                          {row.summary?.image ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-slate-700">
                          {row.createdAt
                            ? format(new Date(row.createdAt), "yyyy-MM-dd HH:mm", { locale: zhCN })
                            : "—"}
                        </TableCell>
                        <CloudVmInstanceResourceCell
                          u={u}
                          promConfigured={usageQ.data?.prometheusConfigured === true}
                          usagePending={usageQ.isPending}
                        />
                        <TableCell className="font-mono text-xs">
                          {row.summary?.nodeIP && row.summary?.sshPort
                            ? `${row.summary.nodeIP}:${row.summary.sshPort}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {row.summary?.phase === "running" ? (
                            <Badge className="border-emerald-600/40 bg-emerald-50 font-normal text-emerald-900">
                              运行中
                            </Badge>
                          ) : row.summary?.phase === "deploying" ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/70 bg-amber-50 font-normal text-amber-950"
                            >
                              部署中
                            </Badge>
                          ) : (
                            <span className="text-sm text-slate-600">{row.summary?.phase ?? "—"}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/cluster/apps/cloud-vm/${row.id}`}>管理</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          </section>
        </TabsContent>
      ) : null}

      {canWrite && mainTab === "create" ? (
          <TabsContent value="create" className="outline-none">
          <section>
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">创建容器主机</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  这是在 Kubernetes 中创建可 SSH 登录的容器化工作机；共四步，完成后点击「创建容器主机」。
                </CardDescription>
                <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2 lg:grid-cols-4 lg:items-stretch lg:gap-2">
                  {STEPS.map((s) => (
                    <li
                      key={s.n}
                      className={cn(
                        "box-border w-full min-w-0 rounded-lg border px-2.5 py-2 text-left",
                        step === s.n
                          ? "border-indigo-400 bg-indigo-50/90"
                          : step > s.n
                            ? "border-emerald-200/80 bg-emerald-50/50"
                            : "border-slate-200 bg-white"
                      )}
                    >
                      <div className="flex w-full items-start gap-2">
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-none",
                            step === s.n
                              ? "bg-indigo-600 text-white"
                              : step > s.n
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-200 text-slate-600"
                          )}
                        >
                          {s.n}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium leading-tight text-slate-900">{s.title}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{s.desc}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardHeader>
              <CardContent className="space-y-4">
                {step === 1 && (
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div>
                      <Label>容器主机名称</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="例如 my-web-01"
                      />
                    </div>
                    <div>
                      <Label>系统镜像</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                        value={form.imageId}
                        onChange={(e) => setForm((f) => ({ ...f, imageId: e.target.value }))}
                      >
                        {(bootQ.data?.images ?? []).map((im) => (
                          <option key={im.id} value={im.id}>
                            {im.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        镜像列表由管理员在{" "}
                        <Link to={BOOTSTRAP_PATH} className="text-sky-700 underline">
                          {BOOTSTRAP_PATH}
                        </Link>{" "}
                        配置。
                      </p>
                      {selectedBootstrapImage?.bakedInSSH ? (
                        <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/90 px-2 py-1.5 text-[11px] leading-snug text-emerald-950">
                          当前镜像已标记为<strong>预装 OpenSSH</strong>：启动时会跳过 apt 安装，Pod 就绪更快。请确保镜像 Dockerfile 中已安装{" "}
                          <code className="rounded bg-white/70 px-0.5">openssh-server</code>。
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] leading-snug text-slate-600">
                          官方 <code className="rounded bg-slate-100 px-0.5">ubuntu:22.04/24.04</code>{" "}
                          不含 sshd，首次启动会执行 apt。若使用<strong>自研镜像</strong>并在镜像内预装{" "}
                          <code className="rounded bg-slate-100 px-0.5">openssh-server</code>，请在引导页勾选「镜像已预装
                          OpenSSH」以作说明并便于团队识别。
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>root 登录密码（≥8 位）</Label>
                      <Input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={form.rootPassword}
                        onChange={(e) => setForm((f) => ({ ...f, rootPassword: e.target.value }))}
                        placeholder="创建后用于 SSH"
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label>CPU 申请（request）</Label>
                        <Input
                          value={form.cpuRequest}
                          onChange={(e) => setForm((f) => ({ ...f, cpuRequest: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>CPU 上限（limit）</Label>
                        <Input
                          value={form.cpuLimit}
                          onChange={(e) => setForm((f) => ({ ...f, cpuLimit: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>内存申请（request）</Label>
                        <Input
                          value={form.memRequest}
                          onChange={(e) => setForm((f) => ({ ...f, memRequest: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>内存上限（limit）</Label>
                        <Input
                          value={form.memLimit}
                          onChange={(e) => setForm((f) => ({ ...f, memLimit: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>数据盘容量（仅挂载 /data）</Label>
                      <Input
                        value={form.pvcSize}
                        onChange={(e) => setForm((f) => ({ ...f, pvcSize: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>StorageClass（可空，由集群默认）</Label>
                      <Input
                        value={form.storageClass}
                        onChange={(e) => setForm((f) => ({ ...f, storageClass: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <Label>初始化脚本（bash，可选）</Label>
                      <Textarea
                        value={form.initScript}
                        onChange={(e) => setForm((f) => ({ ...f, initScript: e.target.value }))}
                        placeholder={`#!/bin/bash
# 每次 Pod 启动在 sshd 之前执行；可 apt install、写 /data 等。配置保存在平台，不依赖改镜像。`}
                        className="min-h-[140px] font-mono text-xs"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        与内置引导一致：若填写了「自定义启动命令」，则不会挂载该脚本（需自行在命令中处理）。
                      </p>
                    </div>
                    <div>
                      <Label>SSH NodePort（0 表示随机分配）</Label>
                      <Input
                        type="number"
                        value={form.nodePort || ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, nodePort: parseInt(e.target.value, 10) || 0 }))
                        }
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        集群外使用<strong>节点 IP:端口</strong>，用户 <code className="rounded bg-slate-100 px-1">root</code> 登录。
                      </p>
                    </div>
                    <div>
                      <Label>环境变量（JSON 数组，可选）</Label>
                      <Textarea
                        value={form.envText}
                        onChange={(e) => setForm((f) => ({ ...f, envText: e.target.value }))}
                        placeholder='[{"name":"TZ","value":"Asia/Shanghai"}]'
                        className="min-h-[80px] font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label>启动命令 command（JSON 字符串数组，可选）</Label>
                      <Textarea
                        value={form.commandText}
                        onChange={(e) => setForm((f) => ({ ...f, commandText: e.target.value }))}
                        placeholder='["/bin/bash","-c","sleep infinity"]'
                        className="min-h-[64px] font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label>命令参数 args（JSON 字符串数组，可选）</Label>
                      <Textarea
                        value={form.argsText}
                        onChange={(e) => setForm((f) => ({ ...f, argsText: e.target.value }))}
                        className="min-h-[64px] font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <p className="text-sm text-slate-600 lg:col-span-2">
                      以下为可选自动化安装：会优先切换 Ubuntu 软件源至阿里云镜像；<strong>应用数据</strong>写入{" "}
                      <code className="rounded bg-slate-100 px-1">/data</code>（Docker 数据目录、Nginx 站点根目录、宝塔相关日志与安装脚本等）。命令行工具通过 apt 装在系统路径，不单独放到{" "}
                      <code className="rounded bg-slate-100 px-1">/data</code>。
                    </p>
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">软件 / 服务</p>
                      <div className="grid gap-3">
                        <label
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-xl border p-3.5 shadow-sm transition-all",
                            form.installDocker
                              ? "border-sky-400/90 bg-sky-50/90 ring-2 ring-sky-400/25"
                              : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                          )}
                        >
                          <Checkbox
                            className="mt-2 shrink-0"
                            checked={form.installDocker}
                            onCheckedChange={(v) => setForm((f) => ({ ...f, installDocker: v === true }))}
                          />
                          <LogoDocker className="h-11 w-11 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">Docker</span>
                              <Badge variant="secondary" className="font-mono text-[10px] font-normal">
                                /data/docker
                              </Badge>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                              Engine 与镜像数据落盘；已配 DaoCloud 公共镜像加速。
                            </p>
                          </div>
                        </label>
                        <label
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-xl border p-3.5 shadow-sm transition-all",
                            form.installNginx
                              ? "border-emerald-400/90 bg-emerald-50/90 ring-2 ring-emerald-400/25"
                              : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                          )}
                        >
                          <Checkbox
                            className="mt-2 shrink-0"
                            checked={form.installNginx}
                            onCheckedChange={(v) => setForm((f) => ({ ...f, installNginx: v === true }))}
                          />
                          <LogoNginx className="h-11 w-11 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">Nginx</span>
                              <Badge variant="secondary" className="font-mono text-[10px] font-normal">
                                /data/nginx/html
                              </Badge>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                              默认站点根指向数据盘，便于与持久化目录一致。
                            </p>
                          </div>
                        </label>
                        <label
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-xl border p-3.5 shadow-sm transition-all",
                            form.installBaota
                              ? "border-lime-500/80 bg-lime-50/80 ring-2 ring-lime-400/30"
                              : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                          )}
                        >
                          <Checkbox
                            className="mt-2 shrink-0"
                            checked={form.installBaota}
                            onCheckedChange={(v) => setForm((f) => ({ ...f, installBaota: v === true }))}
                          />
                          <LogoBaota className="h-11 w-11 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">宝塔面板</span>
                              <Badge variant="secondary" className="font-mono text-[10px] font-normal">
                                /data/bt-panel
                              </Badge>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                              安装脚本与日志在数据盘；<span className="font-mono">/www</span> 指向{" "}
                              <span className="font-mono">/data/www</span>。容器内常无 systemd，面板进程可能无法长期运行。
                            </p>
                          </div>
                        </label>
                        <label
                          className={cn(
                            "flex cursor-pointer flex-col gap-3 rounded-xl border p-3.5 shadow-sm transition-all",
                            form.installHysteria2
                              ? "border-fuchsia-400/90 bg-fuchsia-50/90 ring-2 ring-fuchsia-400/25"
                              : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                          )}
                        >
                          <div className="flex gap-3">
                            <Checkbox
                              className="mt-2 shrink-0"
                              checked={form.installHysteria2}
                              onCheckedChange={(v) => setForm((f) => ({ ...f, installHysteria2: v === true }))}
                            />
                            <LogoHysteria2 className="h-11 w-11 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">Hysteria2 客户端</span>
                                <Badge variant="secondary" className="font-mono text-[10px] font-normal">
                                  client · 分享链接 / YAML
                                </Badge>
                              </div>
                              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                                支持整行粘贴官方 <code className="rounded bg-white/80 px-0.5">hysteria2://</code> 或 <code className="rounded bg-white/80 px-0.5">hy2://</code> 分享链接（与客户端「复制分享」一致），也可导入 YAML；平台会补全本地{" "}
                                <code className="rounded bg-white/80 px-0.5">http.listen</code>，并将 <code className="rounded bg-white/80 px-0.5">127.0.0.1</code> 改为{" "}
                                <code className="rounded bg-white/80 px-0.5">0.0.0.0</code>，创建集群内 <code className="rounded bg-white/80 px-0.5">ClusterIP</code>（TCP）供其它 Pod 走 HTTP/SOCKS。下方端口须与本地 inbound 一致。二进制由<strong>容器主机镜像引导</strong>中配置的全局下载地址（及自动镜像）按架构拉取；可在本向导<strong>环境变量</strong>中为 Deployment 设置{" "}
                                <code className="rounded bg-white/80 px-0.5">HTTPS_PROXY</code> / <code className="rounded bg-white/80 px-0.5">HTTP_PROXY</code> 辅助 Pod 内 <code className="rounded bg-white/80 px-0.5">curl</code>。
                              </p>
                            </div>
                          </div>
                          {form.installHysteria2 ? (
                            <div className="space-y-3 border-t border-fuchsia-200/60 pt-3 sm:ml-14">
                              <div className="grid gap-2 sm:max-w-xs">
                                <Label className="text-xs">本地 inbound 端口（≥1024，须与 YAML / 分享链接展开后一致，默认 8080）</Label>
                                <Input
                                  type="number"
                                  value={form.hysteria2ListenPort || ""}
                                  onChange={(e) =>
                                    setForm((f) => ({
                                      ...f,
                                      hysteria2ListenPort: parseInt(e.target.value, 10) || 8080,
                                    }))
                                  }
                                  className="font-mono text-sm"
                                />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const inp = document.createElement("input");
                                    inp.type = "file";
                                    inp.accept = ".yaml,.yml,text/plain";
                                    inp.onchange = () => {
                                      const file = inp.files?.[0];
                                      if (!file) return;
                                      const r = new FileReader();
                                      r.onload = () =>
                                        setForm((f) => ({
                                          ...f,
                                          hysteria2ConfigYaml: String(r.result ?? ""),
                                        }));
                                      r.readAsText(file);
                                    };
                                    inp.click();
                                  }}
                                >
                                  导入 YAML 文件
                                </Button>
                              </div>
                              <div>
                                <Label className="text-xs">客户端配置（分享链接整行粘贴 或 YAML）</Label>
                                <Textarea
                                  value={form.hysteria2ConfigYaml}
                                  onChange={(e) =>
                                    setForm((f) => ({ ...f, hysteria2ConfigYaml: e.target.value }))
                                  }
                                  placeholder={`hysteria2://uuid@host:443/?insecure=1&sni=example.com#备注\n\n或手写 YAML，例如：\nserver: your.server:443\nauth: your-auth-string\nhttp:\n  listen: 127.0.0.1:8080`}
                                  className="mt-1 min-h-[200px] font-mono text-xs"
                                  spellCheck={false}
                                />
                              </div>
                            </div>
                          ) : null}
                        </label>
                      </div>
                    </div>
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">命令行工具（apt）</p>
                      <div className="flex flex-wrap gap-2">
                        {CLI_PKG_OPTIONS.map((o) => {
                          const checked = form.cliPackages.includes(o.id);
                          const Icon = o.Icon;
                          return (
                            <label
                              key={o.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                                checked
                                  ? "border-violet-300 bg-violet-50/90 text-violet-950"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80"
                              )}
                            >
                              <Checkbox
                                className="shrink-0"
                                checked={checked}
                                onCheckedChange={(v) =>
                                  setForm((f) => ({
                                    ...f,
                                    cliPackages:
                                      v === true
                                        ? [...f.cliPackages, o.id]
                                        : f.cliPackages.filter((x) => x !== o.id),
                                  }))
                                }
                              />
                              <span
                                className={cn(
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                  checked ? "bg-violet-200/80 text-violet-900" : "bg-slate-100 text-slate-600"
                                )}
                              >
                                <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              </span>
                              <span className="font-mono text-xs">{o.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  <Button type="button" variant="outline" size="sm" onClick={goPrev} disabled={step <= 1} className="gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    上一步
                  </Button>
                  {step < 4 ? (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1 bg-indigo-600 hover:bg-indigo-700"
                      onClick={goNext}
                      disabled={step === 1 && !step1Ok}
                    >
                      下一步
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1 bg-indigo-600 hover:bg-indigo-700"
                      disabled={createMut.isPending || !step1Ok}
                      onClick={() => createMut.mutate()}
                    >
                      {createMut.isPending ? "创建中…" : "创建容器主机"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
          </TabsContent>
      ) : null}
      </Tabs>
    </div>
  );
}
