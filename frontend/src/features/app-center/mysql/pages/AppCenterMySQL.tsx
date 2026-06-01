import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Cloud,
  Database,
  HardDrive,
  KeyRound,
  Layers,
  Loader2,
  Minimize2,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useSearchParams } from "react-router-dom";
import { ApiHttpError, apiDeleteJson, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { k8sPodExecAllowed, mysqlAppCenterCanWrite, mysqlShowK8sDeployWizard } from "@/lib/platform-permissions";
import {
  withAppCenterMutationConfirm,
  withAppCenterMutationConfirmQuery,
} from "@/features/app-center/lib/appCenterMutationConfirm";
import MySQLSqlConsoleSheet from "@/features/app-center/mysql/components/MySQLSqlConsoleSheet";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { ConfirmActionButton } from "@/shared/ui/confirm-action-button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MySQLStatus = {
  mysqlReachable: boolean;
  encryptionReady: boolean;
  k8sReady: boolean;
  encryptionError?: string;
  mysqlConnectError?: string;
};

type MySQLInstance = {
  id: number;
  name: string;
  mode: "external" | "k8s";
  summary: {
    mode: "external" | "k8s";
    host?: string;
    port?: number;
    username?: string;
    defaultSchema?: string;
    tlsMode?: string;
    hasPassword?: boolean;
    k8sManaged?: boolean;
    k8sNamespace?: string;
    k8sBaseName?: string;
    k8sServiceType?: string;
    k8sSvcPort?: number;
    k8sVersionLine?: string;
    k8sMysqlImageResolved?: string;
    k8sExporterEnabled?: boolean;
    k8sPersistenceEnabled?: boolean;
    k8sStorageSize?: string;
    k8sTemplateId?: number;
    k8sTemplateName?: string;
  };
  createdAt?: string;
  createdBy?: string;
};

type MySQLTemplate = {
  id: number;
  name: string;
  description?: string;
  config: {
    mysqlImage: string;
    exporterImage?: string;
    imagePullSecret?: string;
    defaultVersion?: string;
    defaultStorageSize?: string;
    defaultStorageClass?: string;
    defaultEnableExporter?: boolean;
  };
};

type RuntimeSnapshot = {
  version?: string;
  versionComment?: string;
  hostname?: string;
  port?: number;
  readOnly?: boolean;
  superReadOnly?: boolean;
  maxConnections?: number;
  uptimeSeconds?: number;
  status?: Record<string, string>;
};

type SQLResult = {
  readOnly: boolean;
  columns?: string[];
  rows?: Record<string, unknown>[];
  truncated?: boolean;
  rowsAffected?: number;
  lastInsertId?: number;
};

type MySQLBackup = {
  id: number;
  backupName: string;
  status: string;
  storageRef?: string;
  sizeBytes?: number;
  startedAt?: string;
  finishedAt?: string;
  errorSummary?: string;
};

type MySQLUser = {
  username: string;
  host: string;
  plugin?: string;
  accountLocked?: boolean;
};

const emptyExternal = {
  name: "",
  host: "",
  port: 3306,
  username: "root",
  password: "",
  defaultSchema: "",
  tlsMode: "disabled",
};

const emptyDeploy = {
  namespace: "default",
  baseName: "",
  version: "8.0",
  rootPassword: "",
  database: "",
  appUsername: "",
  appPassword: "",
  svcPort: 3306,
  serviceType: "clusterip",
  nodePortMysql: 0,
  enableExporter: true,
  persistenceEnabled: true,
  storageSize: "10Gi",
  storageClassName: "",
  mysqlCpuRequest: "250m",
  mysqlCpuLimit: "1",
  mysqlMemoryRequest: "512Mi",
  mysqlMemoryLimit: "1Gi",
  templateId: "none",
  mysqlImage: "",
  exporterImage: "",
};

const emptyTemplate = {
  name: "",
  description: "",
  mysqlImage: "mysql:8.0",
  exporterImage: "prom/mysqld-exporter:v0.15.1",
  imagePullSecret: "",
  defaultVersion: "8.0",
  defaultStorageSize: "10Gi",
  defaultStorageClass: "",
  defaultEnableExporter: true,
};

const emptyBackup = {
  schema: "",
  backupName: "",
  restoreBackupId: "",
  targetSchema: "",
};

const emptyUser = {
  username: "",
  host: "%",
  password: "",
  schema: "",
  role: "readonly",
  passwordUser: "",
  passwordHost: "%",
  newPassword: "",
};

function errMsg(err: unknown): string {
  if (err instanceof ApiHttpError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function isPlatformMySQL(i: MySQLInstance): boolean {
  return i.mode === "k8s" || Boolean(i.summary.k8sManaged);
}

function endpointOf(i: MySQLInstance): string {
  const s = i.summary;
  if (isPlatformMySQL(i)) return `${s.k8sNamespace ?? "-"} / ${s.k8sBaseName ?? "-"}:${s.k8sSvcPort ?? 3306}`;
  return `${s.host ?? "-"}:${s.port ?? 3306}`;
}

function boolText(v: unknown): string {
  return v ? "是" : "否";
}

function formatBytes(v?: number): string {
  if (!v || v <= 0) return "-";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KiB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MiB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(1)} GiB`;
}

function formatDate(v?: string): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

export default function AppCenterMySQL() {
  const qc = useQueryClient();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const canWrite = mysqlAppCenterCanWrite(auth.status?.role, auth.status?.permissions);
  const canDeploy = mysqlShowK8sDeployWizard(auth.status?.role, auth.status?.permissions);
  const canPodExec = k8sPodExecAllowed(auth.status?.role, auth.status?.permissions);

  const [mainTab, setMainTab] = useState<"mysql" | "install" | "templates">("mysql");
  const [managePanelOpen, setManagePanelOpen] = useState(false);
  const [cliSheetOpen, setCliSheetOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const requestedInstanceId = useMemo(() => {
    const raw = searchParams.get("instance");
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);
  const [instanceSourceFilter, setInstanceSourceFilter] = useState<"all" | "platform" | "managed">("all");

  const statusQ = useQuery({
    queryKey: ["app-center-mysql-status"],
    queryFn: ({ signal }) => apiGetJson<MySQLStatus>("/api/app-center/mysql/status", { signal }),
  });
  const instancesQ = useQuery({
    queryKey: ["app-center-mysql-instances"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: MySQLInstance[]; mysqlRequired?: boolean }>(
        "/api/app-center/mysql/instances",
        { signal }
      ),
  });
  const templatesQ = useQuery({
    queryKey: ["app-center-mysql-templates"],
    queryFn: ({ signal }) =>
      apiGetJson<{ templates: MySQLTemplate[]; mysqlRequired?: boolean }>(
        "/api/app-center/mysql/templates",
        { signal }
      ),
  });

  const instances = useMemo(() => instancesQ.data?.instances ?? [], [instancesQ.data?.instances]);
  const templates = templatesQ.data?.templates ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => instances.find((i) => i.id === selectedId) ?? null,
    [instances, selectedId]
  );

  useEffect(() => {
    if (requestedInstanceId == null) return;
    if (!instances.some((i) => i.id === requestedInstanceId)) return;
    setMainTab("mysql");
    setSearchQ("");
    setInstanceSourceFilter("all");
    setSelectedId(requestedInstanceId);
  }, [instances, requestedInstanceId]);

  useEffect(() => {
    setCliSheetOpen(false);
  }, [selected?.id]);

  const filteredInstances = useMemo(() => {
    let list = instances;
    if (instanceSourceFilter === "platform") {
      list = list.filter(isPlatformMySQL);
    } else if (instanceSourceFilter === "managed") {
      list = list.filter((i) => !isPlatformMySQL(i));
    }
    const q = searchQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => {
      const haystack = [
        i.name,
        String(i.id),
        endpointOf(i),
        i.summary.defaultSchema,
        i.summary.username,
        i.summary.k8sVersionLine,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [instances, instanceSourceFilter, searchQ]);

  useEffect(() => {
    if (selectedId == null) return;
    if (!filteredInstances.some((i) => i.id === selectedId)) setSelectedId(null);
  }, [filteredInstances, selectedId]);

  const [external, setExternal] = useState(emptyExternal);
  const createExternalM = useMutation({
    mutationFn: () =>
      apiPostJson<{ id: number }>(
        "/api/app-center/mysql/instances",
        withAppCenterMutationConfirm({
          ...external,
          mode: "external",
          port: Number(external.port) || 3306,
        })
      ),
    onSuccess: (res) => {
      toast.success("MySQL 实例已登记");
      setExternal(emptyExternal);
      setSelectedId(res.id);
      setManagePanelOpen(false);
      qc.invalidateQueries({ queryKey: ["app-center-mysql-instances"] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) =>
      apiDeleteJson(withAppCenterMutationConfirmQuery(`/api/app-center/mysql/instances/${id}`)),
    onSuccess: () => {
      toast.success("MySQL 实例已删除");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["app-center-mysql-instances"] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const pingM = useMutation({
    mutationFn: (id: number) =>
      apiPostJson<{ ok: boolean; version?: string; latencyMs?: number }>(
        `/api/app-center/mysql/instances/${id}/ping`,
        {}
      ),
    onSuccess: (res) => toast.success(`连接正常 ${res.version ?? ""} ${res.latencyMs ?? 0}ms`),
    onError: (err) => toast.error(errMsg(err)),
  });

  const [deploy, setDeploy] = useState(emptyDeploy);
  const deployM = useMutation({
    mutationFn: () =>
      apiPostJson<{ instanceId?: number; instanceWarning?: string }>(
        withAppCenterMutationConfirmQuery("/api/app-center/mysql/k8s-deploy"),
        {
          ...deploy,
          templateId: deploy.templateId === "none" ? 0 : Number(deploy.templateId),
          svcPort: Number(deploy.svcPort) || 3306,
          nodePortMysql: Number(deploy.nodePortMysql) || 0,
        }
      ),
    onSuccess: (res) => {
      toast.success(res.instanceWarning ? `已部署，登记提示：${res.instanceWarning}` : "MySQL 已部署到集群");
      if (res.instanceId) setSelectedId(res.instanceId);
      setMainTab("mysql");
      qc.invalidateQueries({ queryKey: ["app-center-mysql-instances"] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const [template, setTemplate] = useState(emptyTemplate);
  const createTplM = useMutation({
    mutationFn: () =>
      apiPostJson<{ id: number }>(
        "/api/app-center/mysql/templates",
        withAppCenterMutationConfirm({
          name: template.name,
          description: template.description,
          config: {
            mysqlImage: template.mysqlImage,
            exporterImage: template.exporterImage,
            imagePullSecret: template.imagePullSecret,
            defaultVersion: template.defaultVersion,
            defaultStorageSize: template.defaultStorageSize,
            defaultStorageClass: template.defaultStorageClass,
            defaultEnableExporter: template.defaultEnableExporter,
          },
        })
      ),
    onSuccess: () => {
      toast.success("MySQL 模版已创建");
      setTemplate(emptyTemplate);
      qc.invalidateQueries({ queryKey: ["app-center-mysql-templates"] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const [sql, setSql] = useState("show databases");
  const [schema, setSchema] = useState("");
  const [confirmMutation, setConfirmMutation] = useState(false);
  const [sqlResult, setSqlResult] = useState<SQLResult | null>(null);
  const queryM = useMutation({
    mutationFn: () => {
      const payload = {
        sql,
        schema,
        limit: 300,
        confirmMutation,
      };
      return apiPostJson<SQLResult>(
        `/api/app-center/mysql/instances/${selected?.id}/query`,
        confirmMutation ? withAppCenterMutationConfirm(payload) : payload
      );
    },
    onSuccess: (res) => setSqlResult(res),
    onError: (err) => toast.error(errMsg(err)),
  });
  const submitSql = () => {
    queryM.mutate();
  };

  const runtimeQ = useQuery({
    queryKey: ["app-center-mysql-runtime", selected?.id],
    queryFn: ({ signal }) =>
      apiGetJson<RuntimeSnapshot>(`/api/app-center/mysql/instances/${selected?.id}/runtime`, {
        signal,
      }),
    enabled: Boolean(selected?.id),
    retry: false,
  });
  const schemasQ = useQuery({
    queryKey: ["app-center-mysql-schemas", selected?.id],
    queryFn: ({ signal }) =>
      apiGetJson<{ schemas: string[] }>(`/api/app-center/mysql/instances/${selected?.id}/schemas`, {
        signal,
      }),
    enabled: Boolean(selected?.id),
    retry: false,
  });
  const processQ = useQuery({
    queryKey: ["app-center-mysql-processlist", selected?.id],
    queryFn: ({ signal }) =>
      apiGetJson<{ processes: Array<Record<string, unknown>> }>(
        `/api/app-center/mysql/instances/${selected?.id}/processlist?limit=50`,
        { signal }
      ),
    enabled: Boolean(selected?.id),
    retry: false,
  });
  const backupsQ = useQuery({
    queryKey: ["app-center-mysql-backups", selected?.id],
    queryFn: ({ signal }) =>
      apiGetJson<{ backups: MySQLBackup[] }>(`/api/app-center/mysql/instances/${selected?.id}/backups`, {
        signal,
      }),
    enabled: Boolean(selected?.id),
    retry: false,
  });
  const usersQ = useQuery({
    queryKey: ["app-center-mysql-users", selected?.id],
    queryFn: ({ signal }) =>
      apiGetJson<{ users: MySQLUser[] }>(`/api/app-center/mysql/instances/${selected?.id}/users`, {
        signal,
      }),
    enabled: Boolean(selected?.id),
    retry: false,
  });

  const [backup, setBackup] = useState(emptyBackup);
  const createBackupM = useMutation({
    mutationFn: () =>
      apiPostJson<{ id: number; backupName: string }>(
        `/api/app-center/mysql/instances/${selected?.id}/backups`,
        withAppCenterMutationConfirm({
          schema: backup.schema,
          backupName: backup.backupName,
        })
      ),
    onSuccess: (res) => {
      toast.success(`MySQL 备份已完成：${res.backupName}`);
      setBackup((b) => ({ ...b, backupName: "" }));
      qc.invalidateQueries({ queryKey: ["app-center-mysql-backups", selected?.id] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  const restoreBackupM = useMutation({
    mutationFn: () =>
      apiPostJson(
        `/api/app-center/mysql/instances/${selected?.id}/backups/${backup.restoreBackupId}/restore`,
        withAppCenterMutationConfirm({ targetSchema: backup.targetSchema })
      ),
    onSuccess: () => {
      toast.success("MySQL 备份已恢复");
      setBackup((b) => ({ ...b, restoreBackupId: "" }));
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  const deleteBackupM = useMutation({
    mutationFn: (id: number) =>
      apiDeleteJson(
        withAppCenterMutationConfirmQuery(`/api/app-center/mysql/instances/${selected?.id}/backups/${id}`)
      ),
    onSuccess: () => {
      toast.success("MySQL 备份已删除");
      qc.invalidateQueries({ queryKey: ["app-center-mysql-backups", selected?.id] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const [userForm, setUserForm] = useState(emptyUser);
  const createUserM = useMutation({
    mutationFn: () =>
      apiPostJson(
        `/api/app-center/mysql/instances/${selected?.id}/users`,
        withAppCenterMutationConfirm({
          username: userForm.username,
          host: userForm.host,
          password: userForm.password,
          schema: userForm.schema,
          role: userForm.role,
        })
      ),
    onSuccess: () => {
      toast.success("MySQL 用户已创建");
      setUserForm((f) => ({ ...f, username: "", password: "" }));
      qc.invalidateQueries({ queryKey: ["app-center-mysql-users", selected?.id] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  const changePasswordM = useMutation({
    mutationFn: () =>
      apiPutJson(
        `/api/app-center/mysql/instances/${selected?.id}/users/${encodeURIComponent(userForm.passwordUser)}/password`,
        withAppCenterMutationConfirm({
          host: userForm.passwordHost,
          password: userForm.newPassword,
        })
      ),
    onSuccess: () => {
      toast.success("MySQL 用户密码已更新");
      setUserForm((f) => ({ ...f, newPassword: "" }));
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  const deleteUserM = useMutation({
    mutationFn: (u: MySQLUser) =>
      apiDeleteJson(
        withAppCenterMutationConfirmQuery(
          `/api/app-center/mysql/instances/${selected?.id}/users/${encodeURIComponent(u.username)}?host=${encodeURIComponent(u.host)}`
        )
      ),
    onSuccess: () => {
      toast.success("MySQL 用户已删除");
      qc.invalidateQueries({ queryKey: ["app-center-mysql-users", selected?.id] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["app-center-mysql-status"] });
    qc.invalidateQueries({ queryKey: ["app-center-mysql-instances"] });
    qc.invalidateQueries({ queryKey: ["app-center-mysql-templates"] });
    if (selected?.id) {
      qc.invalidateQueries({ queryKey: ["app-center-mysql-runtime", selected.id] });
      qc.invalidateQueries({ queryKey: ["app-center-mysql-schemas", selected.id] });
      qc.invalidateQueries({ queryKey: ["app-center-mysql-processlist", selected.id] });
      qc.invalidateQueries({ queryKey: ["app-center-mysql-backups", selected.id] });
      qc.invalidateQueries({ queryKey: ["app-center-mysql-users", selected.id] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-white to-cyan-50/40 px-6 py-8 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-100/40 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-800/90">MySQL 数据库 · 实例</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]">
              云数据库 MySQL
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              <strong className="font-medium text-slate-800">平台部署</strong> 与{" "}
              <strong className="font-medium text-slate-800">纳管</strong> 共用同一张实例表；选中实例后在下方详情中处理运行态、SQL、用户与备份。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="h-10 shrink-0 gap-1.5 bg-sky-600 shadow-sm hover:bg-sky-700"
              disabled={!canWrite || !statusQ.data?.mysqlReachable}
              onClick={() => setManagePanelOpen((o) => !o)}
            >
              {managePanelOpen ? (
                <>
                  <Minimize2 className="h-4 w-4" />
                  收起纳管表单
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  纳管实例
                </>
              )}
            </Button>
            {canDeploy ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 gap-1.5 border-sky-200 bg-white text-sky-900 hover:bg-sky-50"
                onClick={() => setMainTab("install")}
              >
                <Terminal className="h-4 w-4" />
                创建
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="h-10 gap-1.5" onClick={refreshAll}>
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (statusQ.isFetching || instancesQ.isFetching || templatesQ.isFetching) && "animate-spin"
                )}
              />
              刷新
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className="w-full">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 sm:w-auto">
          <TabsTrigger
            value="mysql"
            className="gap-1.5 rounded-lg px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Database className="h-4 w-4 shrink-0" />
            实例列表
          </TabsTrigger>
          {canDeploy ? (
            <TabsTrigger
              value="install"
              className="gap-1.5 rounded-lg px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Terminal className="h-4 w-4 shrink-0" />
              部署向导
            </TabsTrigger>
          ) : null}
          {canDeploy ? (
            <TabsTrigger
              value="templates"
              className="gap-1.5 rounded-lg px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Layers className="h-4 w-4 shrink-0" />
              模版中心
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="mysql" className="mt-4 space-y-4 outline-none">
          {!statusQ.data?.mysqlReachable ? (
            <Alert className="border-amber-200 bg-amber-50 text-amber-950">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertTitle>需要 MySQL 元数据存储</AlertTitle>
              <AlertDescription>
                请配置 <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">MYSQL_DSN</code> 后再纳管实例。
                {statusQ.data?.mysqlConnectError ? (
                  <span className="ml-1 font-mono text-xs">{statusQ.data.mysqlConnectError}</span>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {statusQ.data?.encryptionError ? (
            <Alert variant="destructive">
              <AlertTitle>加密密钥不可用</AlertTitle>
              <AlertDescription>{statusQ.data.encryptionError}</AlertDescription>
            </Alert>
          ) : null}

          {canWrite && managePanelOpen ? (
            <div className="overflow-hidden rounded-2xl border border-sky-200/80 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-sky-100 bg-sky-50/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">纳管云数据库实例</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    仅登记连接信息，不会在集群内创建工作负载；凭据会按平台密钥加密保存。
                  </p>
                </div>
                <Badge variant="outline" className="border-sky-200 bg-white text-sky-900">
                  外部实例
                </Badge>
              </div>
              <div className="grid gap-4 px-5 py-5 lg:grid-cols-3">
                <Field label="名称">
                  <Input value={external.name} onChange={(e) => setExternal({ ...external, name: e.target.value })} />
                </Field>
                <Field label="主机">
                  <Input value={external.host} onChange={(e) => setExternal({ ...external, host: e.target.value })} />
                </Field>
                <Field label="端口">
                  <Input
                    type="number"
                    value={external.port}
                    onChange={(e) => setExternal({ ...external, port: Number(e.target.value) })}
                  />
                </Field>
                <Field label="用户">
                  <Input value={external.username} onChange={(e) => setExternal({ ...external, username: e.target.value })} />
                </Field>
                <Field label="密码">
                  <Input
                    type="password"
                    value={external.password}
                    onChange={(e) => setExternal({ ...external, password: e.target.value })}
                  />
                </Field>
                <Field label="默认库">
                  <Input
                    value={external.defaultSchema}
                    onChange={(e) => setExternal({ ...external, defaultSchema: e.target.value })}
                  />
                </Field>
                <Field label="TLS">
                  <Select value={external.tlsMode} onValueChange={(v) => setExternal({ ...external, tlsMode: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">disabled</SelectItem>
                      <SelectItem value="required">required</SelectItem>
                      <SelectItem value="skip-verify">skip-verify</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-end lg:col-span-2">
                  <Button
                    className="h-10 w-full gap-2 bg-sky-600 hover:bg-sky-700 sm:w-auto"
                    disabled={!canWrite || createExternalM.isPending}
                    onClick={() => createExternalM.mutate()}
                  >
                    {createExternalM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    登记实例
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">实例列表</h2>
                  <p className="text-xs text-slate-500">单击行查看下方实例详情；来源筛选只影响当前列表。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-500">来源</span>
                  <ToggleGroup
                    type="single"
                    value={instanceSourceFilter}
                    onValueChange={(v) => {
                      if (v) setInstanceSourceFilter(v as typeof instanceSourceFilter);
                    }}
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    spacing={0}
                  >
                    <ToggleGroupItem value="all" className="h-8 px-2.5 text-xs">
                      全部
                    </ToggleGroupItem>
                    <ToggleGroupItem value="platform" className="h-8 gap-1 px-2.5 text-xs">
                      <Cloud className="h-3 w-3" />
                      平台部署
                    </ToggleGroupItem>
                    <ToggleGroupItem value="managed" className="h-8 gap-1 px-2.5 text-xs">
                      <Network className="h-3 w-3" />
                      纳管
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="搜索名称 / ID / 地址 / 库"
                    className="h-9 pl-8"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                  />
                </div>
                <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => void instancesQ.refetch()}>
                  <RefreshCw className={cn("h-3.5 w-3.5", instancesQ.isFetching && "animate-spin")} />
                  刷新
                </Button>
              </div>
            </div>

            {instancesQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> 加载实例...
              </div>
            ) : instancesQ.data?.mysqlRequired ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-sm text-slate-500">
                <Database className="h-12 w-12 text-slate-300" />
                配置 MySQL 元数据后即可登记数据库实例。
              </div>
            ) : filteredInstances.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Server className="h-7 w-7" />
                </div>
                <p className="text-sm text-slate-600">
                  {searchQ.trim()
                    ? "无匹配实例，请调整搜索条件"
                    : instanceSourceFilter !== "all"
                      ? "当前来源筛选下暂无实例，可切换全部或另一来源"
                      : "暂无实例，使用部署向导创建或纳管外部 MySQL"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="w-[92px] text-xs font-semibold uppercase tracking-wide text-slate-500">
                        实例 ID
                      </TableHead>
                      <TableHead className="w-[100px] text-xs font-semibold text-slate-500">来源</TableHead>
                      <TableHead className="min-w-[150px] text-xs font-semibold text-slate-500">名称</TableHead>
                      <TableHead className="min-w-[120px] text-xs font-semibold text-slate-500">版本</TableHead>
                      <TableHead className="min-w-[220px] text-xs font-semibold text-slate-500">接入地址</TableHead>
                      <TableHead className="min-w-[120px] text-xs font-semibold text-slate-500">默认库</TableHead>
                      <TableHead className="w-[92px] text-xs font-semibold text-slate-500">访问控制</TableHead>
                      <TableHead className="w-[150px] text-xs font-semibold text-slate-500">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInstances.map((i) => (
                      <TableRow
                        key={i.id}
                        onClick={() => setSelectedId((prev) => (prev === i.id ? null : i.id))}
                        className={cn(
                          "cursor-pointer border-slate-100 transition-colors",
                          selected?.id === i.id ? "bg-sky-50/70 hover:bg-sky-50" : "hover:bg-slate-50/80"
                        )}
                      >
                        <TableCell className="font-mono text-xs text-slate-600">{i.id}</TableCell>
                        <TableCell>
                          {isPlatformMySQL(i) ? (
                            <Badge variant="outline" className="border-sky-200 bg-sky-50 font-normal text-sky-900">
                              平台部署
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50/90 font-normal text-amber-950">
                              纳管
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">{i.name}</TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {i.summary.k8sVersionLine ?? i.summary.tlsMode ?? "-"}
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate font-mono text-xs text-slate-700">
                          {endpointOf(i)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-700">{i.summary.defaultSchema || "-"}</TableCell>
                        <TableCell>
                          {i.summary.hasPassword ? (
                            <span className="text-xs text-emerald-700">已设密码</span>
                          ) : (
                            <span className="text-xs text-slate-400">无密码</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 px-2 text-xs"
                              disabled={pingM.isPending}
                              onClick={() => pingM.mutate(i.id)}
                            >
                              <Activity className="h-3.5 w-3.5" />
                              Ping
                            </Button>
                            <ConfirmActionButton
                              size="icon"
                              variant="ghost"
                              disabled={!canWrite || deleteM.isPending}
                              aria-label={`删除 ${i.name}`}
                              title={isPlatformMySQL(i) ? "删除平台 MySQL 实例？" : "删除纳管 MySQL 实例？"}
                              description={
                                isPlatformMySQL(i)
                                  ? `将删除 ${i.name}，并清理对应 K8s 资源；PVC 默认保留。`
                                  : `将删除 ${i.name} 的纳管记录，不会自动清理外部 MySQL。`
                              }
                              confirmLabel="删除实例"
                              confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
                              onConfirm={() => deleteM.mutate(i.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                              <span className="sr-only">删除</span>
                            </ConfirmActionButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {selected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>实例详情</span>
                <span className="text-slate-300">/</span>
                <span className="font-mono text-slate-700">{selected.name}</span>
              </div>
              <Card className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/50 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg font-semibold text-slate-900">{selected.name}</CardTitle>
                      {isPlatformMySQL(selected) ? (
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-900">
                          平台部署
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50/90 text-amber-950">
                          纳管
                        </Badge>
                      )}
                      {selected.summary.k8sTemplateName ? (
                        <Badge variant="secondary" className="font-normal">
                          {selected.summary.k8sTemplateName}
                        </Badge>
                      ) : null}
                    </div>
                    <CardDescription className="mt-2 font-mono text-xs leading-relaxed text-slate-600">
                      实例 ID {selected.id} · {endpointOf(selected)} · 默认库 {selected.summary.defaultSchema || "-"}
                    </CardDescription>
                  </div>
                  <ConfirmActionButton
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
                    disabled={!canWrite || deleteM.isPending}
                    title={isPlatformMySQL(selected) ? "释放平台 MySQL 实例？" : "释放纳管 MySQL 实例？"}
                    description={
                      isPlatformMySQL(selected)
                        ? `将释放 ${selected.name}，并清理对应 K8s 资源；PVC 默认保留。`
                        : `将释放 ${selected.name} 的纳管记录，不会自动清理外部 MySQL。`
                    }
                    confirmLabel="释放实例"
                    confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
                    onConfirm={() => deleteM.mutate(selected.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    释放实例
                  </ConfirmActionButton>
                </CardHeader>
                <CardContent className="px-0 pb-5 pt-0">
                  {isPlatformMySQL(selected) ? (
                    <div className="mx-5 mt-4 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-white px-4 py-3 text-xs shadow-sm">
                      <p className="font-semibold text-sky-900">部署规格（创建时快照）</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <SpecItem label="MySQL 镜像" value={selected.summary.k8sMysqlImageResolved ?? "-"} />
                        <SpecItem label="Service" value={selected.summary.k8sServiceType ?? "-"} />
                        <SpecItem label="持久化" value={selected.summary.k8sPersistenceEnabled ? selected.summary.k8sStorageSize ?? "已启用" : "未启用"} />
                        <SpecItem label="Exporter" value={selected.summary.k8sExporterEnabled ? "已启用" : "未启用"} />
                      </div>
                    </div>
                  ) : null}

                  <Tabs defaultValue="runtime" className="gap-0">
                    <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-slate-200 bg-transparent px-5 pt-2">
                      <TabsTrigger value="runtime" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                        运行状态
                      </TabsTrigger>
                      <TabsTrigger value="sql" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                        SQL
                      </TabsTrigger>
                      <TabsTrigger value="users" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                        用户
                      </TabsTrigger>
                      <TabsTrigger value="backups" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                        备份
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="runtime" className="space-y-4 px-5 pt-5">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Panel title="运行态" icon={<Activity className="h-4 w-4" />}>
                          {runtimeQ.isLoading ? (
                            <LoadingLine />
                          ) : runtimeQ.isError ? (
                            <ErrorLine error={runtimeQ.error} />
                          ) : (
                            <div className="space-y-1 text-sm">
                              <KV k="版本" v={`${runtimeQ.data?.version ?? "-"} ${runtimeQ.data?.versionComment ?? ""}`} />
                              <KV k="主机" v={runtimeQ.data?.hostname ?? "-"} />
                              <KV k="端口" v={runtimeQ.data?.port ?? "-"} />
                              <KV k="只读" v={boolText(runtimeQ.data?.readOnly)} />
                              <KV k="super_read_only" v={boolText(runtimeQ.data?.superReadOnly)} />
                              <KV k="最大连接" v={runtimeQ.data?.maxConnections ?? "-"} />
                              <KV k="运行秒数" v={runtimeQ.data?.uptimeSeconds ?? "-"} />
                            </div>
                          )}
                        </Panel>
                        <Panel title="Schema" icon={<ShieldCheck className="h-4 w-4" />}>
                          {schemasQ.isLoading ? (
                            <LoadingLine />
                          ) : schemasQ.isError ? (
                            <ErrorLine error={schemasQ.error} />
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(schemasQ.data?.schemas ?? []).map((s) => (
                                <Badge key={s} variant="outline" className="font-mono">
                                  {s}
                                </Badge>
                              ))}
                              {(schemasQ.data?.schemas ?? []).length === 0 ? (
                                <p className="text-sm text-slate-500">暂无 Schema</p>
                              ) : null}
                            </div>
                          )}
                        </Panel>
                      </div>
                      <Panel title="Processlist" icon={<Server className="h-4 w-4" />}>
                        {processQ.isLoading ? (
                          <LoadingLine />
                        ) : processQ.isError ? (
                          <ErrorLine error={processQ.error} />
                        ) : (
                          <DataTable rows={processQ.data?.processes ?? []} />
                        )}
                      </Panel>
                    </TabsContent>

                    <TabsContent value="sql" className="space-y-4 px-5 pt-5">
                      <Panel title="mysql-cli" icon={<Terminal className="h-4 w-4" />}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm text-slate-700">
                            <p className="font-medium text-slate-900">交互式终端</p>
                            <p className="mt-1 text-xs text-slate-500">
                              K8s 实例进入 Pod 内 mysql CLI，普通实例由平台服务端直连；界面不显示密码。
                            </p>
                          </div>
                          <Button
                            type="button"
                            className="gap-2 bg-sky-600 hover:bg-sky-700"
                            data-terminal-route="/mysql-cli/ws"
                            disabled={!selected || (isPlatformMySQL(selected) && !canPodExec)}
                            title={
                              !selected
                                ? ""
                                : isPlatformMySQL(selected) && !canPodExec
                                    ? "当前账号没有 Pod exec 权限"
                                    : "打开 mysql-cli"
                            }
                            onClick={() => setCliSheetOpen(true)}
                          >
                            <Terminal className="h-4 w-4" />
                            打开 mysql-cli
                          </Button>
                        </div>
                      </Panel>
                      <Panel title="结构化 SQL 执行" icon={<Play className="h-4 w-4" />}>
                        <div className="space-y-3">
                          <div className="max-w-sm">
                            <Field label="Schema">
                              <Input value={schema} onChange={(e) => setSchema(e.target.value)} />
                            </Field>
                          </div>
                          <Textarea className="min-h-[180px] font-mono" value={sql} onChange={(e) => setSql(e.target.value)} />
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <Checkbox checked={confirmMutation} onCheckedChange={(v) => setConfirmMutation(v === true)} />
                              允许写操作
                            </label>
                            {confirmMutation ? (
                              <ConfirmActionButton
                                disabled={!selected || queryM.isPending}
                                className="gap-2"
                                title="确认执行写 SQL？"
                                description={`将在 MySQL 实例「${selected?.name ?? "未选择"}」执行允许写操作的 SQL，可能直接改变数据。`}
                                confirmLabel="执行"
                                onConfirm={submitSql}
                              >
                                {queryM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                执行
                              </ConfirmActionButton>
                            ) : (
                              <Button disabled={!selected || queryM.isPending} className="gap-2" onClick={submitSql}>
                                {queryM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                执行
                              </Button>
                            )}
                          </div>
                          {sqlResult ? (
                            <div className="rounded-lg border border-slate-200">
                              {sqlResult.readOnly ? (
                                <DataTable rows={sqlResult.rows ?? []} columns={sqlResult.columns} />
                              ) : (
                                <div className="p-4 text-sm text-slate-700">
                                  影响行数 {sqlResult.rowsAffected ?? 0}，LastInsertId {sqlResult.lastInsertId ?? 0}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </Panel>
                    </TabsContent>

                    <TabsContent value="users" className="grid gap-4 px-5 pt-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                      <div className="space-y-4">
                        <Panel title="创建用户" icon={<KeyRound className="h-4 w-4" />}>
                          <div className="space-y-3">
                            <div className="grid grid-cols-[1fr_120px] gap-2">
                              <Field label="用户名">
                                <Input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
                              </Field>
                              <Field label="Host">
                                <Input value={userForm.host} onChange={(e) => setUserForm({ ...userForm, host: e.target.value })} />
                              </Field>
                            </div>
                            <Field label="密码">
                              <Input
                                type="password"
                                value={userForm.password}
                                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                              />
                            </Field>
                            <div className="grid grid-cols-2 gap-2">
                              <Field label="授权库">
                                <Input value={userForm.schema} onChange={(e) => setUserForm({ ...userForm, schema: e.target.value })} />
                              </Field>
                              <Field label="权限">
                                <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="readonly">只读</SelectItem>
                                    <SelectItem value="readwrite">读写</SelectItem>
                                  </SelectContent>
                                </Select>
                              </Field>
                            </div>
                            <Button className="w-full gap-2" disabled={!canWrite || createUserM.isPending} onClick={() => createUserM.mutate()}>
                              {createUserM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                              创建用户
                            </Button>
                          </div>
                        </Panel>
                        <Panel title="修改密码" icon={<ShieldCheck className="h-4 w-4" />}>
                          <div className="space-y-3">
                            <div className="grid grid-cols-[1fr_120px] gap-2">
                              <Field label="用户名">
                                <Input
                                  value={userForm.passwordUser}
                                  onChange={(e) => setUserForm({ ...userForm, passwordUser: e.target.value })}
                                />
                              </Field>
                              <Field label="Host">
                                <Input
                                  value={userForm.passwordHost}
                                  onChange={(e) => setUserForm({ ...userForm, passwordHost: e.target.value })}
                                />
                              </Field>
                            </div>
                            <Field label="新密码">
                              <Input
                                type="password"
                                value={userForm.newPassword}
                                onChange={(e) => setUserForm({ ...userForm, newPassword: e.target.value })}
                              />
                            </Field>
                            <Button className="w-full" variant="outline" disabled={!canWrite || changePasswordM.isPending} onClick={() => changePasswordM.mutate()}>
                              更新密码
                            </Button>
                          </div>
                        </Panel>
                      </div>
                      <Panel title="用户列表" icon={<KeyRound className="h-4 w-4" />}>
                        {usersQ.isLoading ? (
                          <LoadingLine />
                        ) : usersQ.isError ? (
                          <ErrorLine error={usersQ.error} />
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>用户</TableHead>
                                <TableHead>Host</TableHead>
                                <TableHead>插件</TableHead>
                                <TableHead>锁定</TableHead>
                                <TableHead className="w-[80px]">操作</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(usersQ.data?.users ?? []).map((u) => (
                                <TableRow key={`${u.username}@${u.host}`}>
                                  <TableCell className="font-mono text-xs">{u.username}</TableCell>
                                  <TableCell className="font-mono text-xs">{u.host}</TableCell>
                                  <TableCell>{u.plugin ?? "-"}</TableCell>
                                  <TableCell>{u.accountLocked ? "是" : "否"}</TableCell>
                                  <TableCell>
                                    <ConfirmActionButton
                                      size="icon"
                                      variant="ghost"
                                      disabled={!canWrite || deleteUserM.isPending}
                                      aria-label={`删除 MySQL 用户 ${u.username}@${u.host}`}
                                      title="删除 MySQL 用户？"
                                      description={`将删除 ${u.username}@${u.host}，该账号将无法继续连接实例。`}
                                      confirmLabel="删除用户"
                                      confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
                                      onConfirm={() => deleteUserM.mutate(u)}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                      <span className="sr-only">删除</span>
                                    </ConfirmActionButton>
                                  </TableCell>
                                </TableRow>
                              ))}
                              {(usersQ.data?.users ?? []).length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                                    暂无用户
                                  </TableCell>
                                </TableRow>
                              ) : null}
                            </TableBody>
                          </Table>
                        )}
                      </Panel>
                    </TabsContent>

                    <TabsContent value="backups" className="grid gap-4 px-5 pt-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                      <div className="space-y-4">
                        <Panel title="创建备份" icon={<HardDrive className="h-4 w-4" />}>
                          <div className="space-y-3">
                            <Field label="Schema">
                              <Input value={backup.schema} onChange={(e) => setBackup({ ...backup, schema: e.target.value })} />
                            </Field>
                            <Field label="备份名">
                              <Input value={backup.backupName} onChange={(e) => setBackup({ ...backup, backupName: e.target.value })} />
                            </Field>
                            <Button className="w-full gap-2" disabled={!canWrite || createBackupM.isPending} onClick={() => createBackupM.mutate()}>
                              {createBackupM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                              立即备份
                            </Button>
                          </div>
                        </Panel>
                        <Panel title="恢复备份" icon={<RefreshCw className="h-4 w-4" />}>
                          <div className="space-y-3">
                            <Field label="备份 ID">
                              <Input value={backup.restoreBackupId} onChange={(e) => setBackup({ ...backup, restoreBackupId: e.target.value })} />
                            </Field>
                            <Field label="目标 Schema">
                              <Input value={backup.targetSchema} onChange={(e) => setBackup({ ...backup, targetSchema: e.target.value })} />
                            </Field>
                            <ConfirmActionButton
                              className="w-full"
                              variant="outline"
                              disabled={!canWrite || !backup.restoreBackupId || restoreBackupM.isPending}
                              title="恢复 MySQL 备份？"
                              description={`将把备份 #${backup.restoreBackupId || "-"} 恢复到目标 Schema「${backup.targetSchema || "-"}」，可能覆盖现有数据。`}
                              confirmLabel="恢复备份"
                              confirmButtonClassName="bg-amber-600 text-white hover:bg-amber-700"
                              onConfirm={() => restoreBackupM.mutate()}
                            >
                              恢复
                            </ConfirmActionButton>
                          </div>
                        </Panel>
                      </div>
                      <Panel title="备份列表" icon={<HardDrive className="h-4 w-4" />}>
                        {backupsQ.isLoading ? (
                          <LoadingLine />
                        ) : backupsQ.isError ? (
                          <ErrorLine error={backupsQ.error} />
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>名称</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>大小</TableHead>
                                <TableHead>完成时间</TableHead>
                                <TableHead className="w-[80px]">操作</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(backupsQ.data?.backups ?? []).map((b) => (
                                <TableRow key={b.id}>
                                  <TableCell className="font-mono text-xs">{b.id}</TableCell>
                                  <TableCell className="font-mono text-xs">{b.backupName}</TableCell>
                                  <TableCell>
                                    <Badge variant={b.status === "completed" ? "default" : b.status === "failed" ? "destructive" : "outline"}>
                                      {b.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{formatBytes(b.sizeBytes)}</TableCell>
                                  <TableCell>{formatDate(b.finishedAt)}</TableCell>
                                  <TableCell>
                                    <ConfirmActionButton
                                      size="icon"
                                      variant="ghost"
                                      disabled={!canWrite || deleteBackupM.isPending}
                                      aria-label={`删除备份 ${b.backupName}`}
                                      title="删除 MySQL 备份？"
                                      description={`将删除备份「${b.backupName}」的记录与可恢复数据，此操作不可恢复。`}
                                      confirmLabel="删除备份"
                                      confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
                                      onConfirm={() => deleteBackupM.mutate(b.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                      <span className="sr-only">删除</span>
                                    </ConfirmActionButton>
                                  </TableCell>
                                </TableRow>
                              ))}
                              {(backupsQ.data?.backups ?? []).length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                                    暂无备份
                                  </TableCell>
                                </TableRow>
                              ) : null}
                            </TableBody>
                          </Table>
                        )}
                      </Panel>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
              <MySQLSqlConsoleSheet
                open={cliSheetOpen}
                onOpenChange={setCliSheetOpen}
                instanceId={selected.id}
                instanceName={selected.name}
              />
            </div>
          ) : !instancesQ.isLoading && instances.length > 0 ? (
            <Card className="border-dashed border-slate-200">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500">
                请在上方表格中选择一行实例
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {canDeploy ? (
          <TabsContent value="install" className="mt-4 outline-none">
            <Card className="overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/60 px-6 py-5">
                <CardTitle className="text-base font-semibold text-slate-900">快速部署向导</CardTitle>
                <CardDescription className="mt-1 text-slate-600">
                  依次确认版本、部署位置、网络、持久化与账号；创建后会自动登记到上方实例列表。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-6 py-6">
                <WizardSection title="部署模版与版本" subtitle="模版会带入默认镜像、存储与 Exporter 设置，可在下方继续覆盖。">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="模版">
                      <Select value={deploy.templateId} onValueChange={(v) => setDeploy({ ...deploy, templateId: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">不使用模版</SelectItem>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="版本">
                      <Select value={deploy.version} onValueChange={(v) => setDeploy({ ...deploy, version: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="8.0">8.0</SelectItem>
                          <SelectItem value="8.4">8.4</SelectItem>
                          <SelectItem value="5.7">5.7</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="MySQL 镜像">
                      <Input value={deploy.mysqlImage} onChange={(e) => setDeploy({ ...deploy, mysqlImage: e.target.value })} />
                    </Field>
                  </div>
                </WizardSection>

                <WizardSection title="部署位置与网络" subtitle="Service 类型决定集群内外访问方式；NodePort 仅在类型为 NodePort 时生效。">
                  <div className="grid gap-4 lg:grid-cols-4">
                    <Field label="命名空间">
                      <Input value={deploy.namespace} onChange={(e) => setDeploy({ ...deploy, namespace: e.target.value })} />
                    </Field>
                    <Field label="名称">
                      <Input value={deploy.baseName} onChange={(e) => setDeploy({ ...deploy, baseName: e.target.value })} />
                    </Field>
                    <Field label="Service 类型">
                      <Select value={deploy.serviceType} onValueChange={(v) => setDeploy({ ...deploy, serviceType: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clusterip">ClusterIP</SelectItem>
                          <SelectItem value="nodeport">NodePort</SelectItem>
                          <SelectItem value="loadbalancer">LoadBalancer</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Service 端口">
                        <Input
                          type="number"
                          value={deploy.svcPort}
                          onChange={(e) => setDeploy({ ...deploy, svcPort: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="NodePort">
                        <Input
                          type="number"
                          value={deploy.nodePortMysql}
                          onChange={(e) => setDeploy({ ...deploy, nodePortMysql: Number(e.target.value) })}
                        />
                      </Field>
                    </div>
                  </div>
                </WizardSection>

                <WizardSection title="初始化账号与数据库" subtitle="root 密码会进入 Kubernetes Secret；应用账号为空时只初始化 root。">
                  <div className="grid gap-4 lg:grid-cols-4">
                    <Field label="root 密码">
                      <Input
                        type="password"
                        value={deploy.rootPassword}
                        onChange={(e) => setDeploy({ ...deploy, rootPassword: e.target.value })}
                      />
                    </Field>
                    <Field label="初始化库">
                      <Input value={deploy.database} onChange={(e) => setDeploy({ ...deploy, database: e.target.value })} />
                    </Field>
                    <Field label="应用账号">
                      <Input value={deploy.appUsername} onChange={(e) => setDeploy({ ...deploy, appUsername: e.target.value })} />
                    </Field>
                    <Field label="应用密码">
                      <Input
                        type="password"
                        value={deploy.appPassword}
                        onChange={(e) => setDeploy({ ...deploy, appPassword: e.target.value })}
                      />
                    </Field>
                  </div>
                </WizardSection>

                <WizardSection title="规格与持久化" subtitle="持久化默认启用；Exporter 开启后会随 MySQL 一起部署指标容器。">
                  <div className="grid gap-4 lg:grid-cols-4">
                    <Field label="StorageClass">
                      <Input
                        value={deploy.storageClassName}
                        onChange={(e) => setDeploy({ ...deploy, storageClassName: e.target.value })}
                      />
                    </Field>
                    <Field label="容量">
                      <Input value={deploy.storageSize} onChange={(e) => setDeploy({ ...deploy, storageSize: e.target.value })} />
                    </Field>
                    <Field label="Exporter 镜像">
                      <Input value={deploy.exporterImage} onChange={(e) => setDeploy({ ...deploy, exporterImage: e.target.value })} />
                    </Field>
                    <div className="flex items-end gap-6">
                      <ToggleLine label="Exporter" checked={deploy.enableExporter} onChange={(v) => setDeploy({ ...deploy, enableExporter: v })} />
                      <ToggleLine label="持久化" checked={deploy.persistenceEnabled} onChange={(v) => setDeploy({ ...deploy, persistenceEnabled: v })} />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-4">
                    <Field label="CPU Request">
                      <Input value={deploy.mysqlCpuRequest} onChange={(e) => setDeploy({ ...deploy, mysqlCpuRequest: e.target.value })} />
                    </Field>
                    <Field label="CPU Limit">
                      <Input value={deploy.mysqlCpuLimit} onChange={(e) => setDeploy({ ...deploy, mysqlCpuLimit: e.target.value })} />
                    </Field>
                    <Field label="Memory Request">
                      <Input value={deploy.mysqlMemoryRequest} onChange={(e) => setDeploy({ ...deploy, mysqlMemoryRequest: e.target.value })} />
                    </Field>
                    <Field label="Memory Limit">
                      <Input value={deploy.mysqlMemoryLimit} onChange={(e) => setDeploy({ ...deploy, mysqlMemoryLimit: e.target.value })} />
                    </Field>
                  </div>
                </WizardSection>

                <div className="flex justify-end">
                  <Button className="h-10 gap-2 bg-sky-600 hover:bg-sky-700" disabled={!canDeploy || deployM.isPending} onClick={() => deployM.mutate()}>
                    {deployM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    部署到 Kubernetes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {canDeploy ? (
          <TabsContent value="templates" className="mt-4 outline-none">
            <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <Card className="overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4" />
                    新建模版
                  </CardTitle>
                  <CardDescription>沉淀常用镜像、版本、存储与 Exporter 默认值。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-5 py-5">
                  <Field label="名称">
                    <Input value={template.name} onChange={(e) => setTemplate({ ...template, name: e.target.value })} />
                  </Field>
                  <Field label="MySQL 镜像">
                    <Input value={template.mysqlImage} onChange={(e) => setTemplate({ ...template, mysqlImage: e.target.value })} />
                  </Field>
                  <Field label="Exporter 镜像">
                    <Input value={template.exporterImage} onChange={(e) => setTemplate({ ...template, exporterImage: e.target.value })} />
                  </Field>
                  <Field label="ImagePullSecret">
                    <Input
                      value={template.imagePullSecret}
                      onChange={(e) => setTemplate({ ...template, imagePullSecret: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="版本">
                      <Input value={template.defaultVersion} onChange={(e) => setTemplate({ ...template, defaultVersion: e.target.value })} />
                    </Field>
                    <Field label="容量">
                      <Input
                        value={template.defaultStorageSize}
                        onChange={(e) => setTemplate({ ...template, defaultStorageSize: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="默认 StorageClass">
                    <Input
                      value={template.defaultStorageClass}
                      onChange={(e) => setTemplate({ ...template, defaultStorageClass: e.target.value })}
                    />
                  </Field>
                  <ToggleLine
                    label="默认启用 Exporter"
                    checked={template.defaultEnableExporter}
                    onChange={(v) => setTemplate({ ...template, defaultEnableExporter: v })}
                  />
                  <Button className="w-full gap-2" disabled={!canWrite || createTplM.isPending} onClick={() => createTplM.mutate()}>
                    {createTplM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    创建模版
                  </Button>
                </CardContent>
              </Card>
              <Card className="overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60">
                  <CardTitle className="text-base">模版列表</CardTitle>
                </CardHeader>
                <CardContent className="px-0 py-0">
                  <DataTable
                    rows={templates.map((t) => ({
                      id: t.id,
                      name: t.name,
                      mysqlImage: t.config.mysqlImage,
                      exporterImage: t.config.exporterImage ?? "-",
                      version: t.config.defaultVersion ?? "-",
                      size: t.config.defaultStorageSize ?? "-",
                      storageClass: t.config.defaultStorageClass ?? "-",
                    }))}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

function ToggleLine({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

function WizardSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white px-4 py-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white px-4 py-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="text-slate-500">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function SpecItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-xs font-medium text-slate-900" title={String(value ?? "")}>
        {value}
      </p>
    </div>
  );
}

function LoadingLine() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      加载中...
    </div>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  return <p className="text-sm text-red-600">{errMsg(error)}</p>;
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-medium text-slate-900">{v}</span>
    </div>
  );
}

function DataTable({ rows, columns }: { rows: Record<string, unknown>[]; columns?: string[] }) {
  const cols = columns && columns.length > 0 ? columns : Object.keys(rows[0] ?? {});
  if (cols.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">无数据</p>;
  }
  return (
    <div className="max-h-[420px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={idx}>
              {cols.map((c) => (
                <TableCell key={c} className="max-w-[360px] truncate font-mono text-xs" title={String(row[c] ?? "")}>
                  {String(row[c] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
