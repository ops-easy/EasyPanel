import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Database,
  HardDrive,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { ApiHttpError, apiDeleteJson, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { mysqlAppCenterCanWrite, mysqlShowK8sDeployWizard } from "@/lib/platform-permissions";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";
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

function endpointOf(i: MySQLInstance): string {
  const s = i.summary;
  if (s.k8sManaged) return `${s.k8sNamespace}/${s.k8sBaseName}:${s.k8sSvcPort ?? 3306}`;
  return `${s.host ?? "-"}:${s.port ?? 3306}`;
}

function boolText(v: unknown): string {
  return v ? "是" : "否";
}

export default function AppCenterMySQL() {
  const qc = useQueryClient();
  const auth = useAuth();
  const canWrite = mysqlAppCenterCanWrite(auth.status?.role, auth.status?.permissions);
  const canDeploy = mysqlShowK8sDeployWizard(auth.status?.role, auth.status?.permissions);

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

  const instances = instancesQ.data?.instances ?? [];
  const templates = templatesQ.data?.templates ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => instances.find((i) => i.id === selectedId) ?? instances[0],
    [instances, selectedId]
  );

  useEffect(() => {
    if (selectedId == null && instances[0]) setSelectedId(instances[0].id);
  }, [instances, selectedId]);

  const [external, setExternal] = useState(emptyExternal);
  const createExternalM = useMutation({
    mutationFn: () =>
      apiPostJson<{ id: number }>("/api/app-center/mysql/instances", {
        ...external,
        mode: "external",
        port: Number(external.port) || 3306,
      }),
    onSuccess: (res) => {
      toast.success("MySQL 实例已登记");
      setExternal(emptyExternal);
      setSelectedId(res.id);
      qc.invalidateQueries({ queryKey: ["app-center-mysql-instances"] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/app-center/mysql/instances/${id}`),
    onSuccess: () => {
      toast.success("MySQL 实例已删除");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["app-center-mysql-instances"] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const pingM = useMutation({
    mutationFn: (id: number) => apiPostJson<{ ok: boolean; version?: string; latencyMs?: number }>(
      `/api/app-center/mysql/instances/${id}/ping`,
      {}
    ),
    onSuccess: (res) => toast.success(`连接正常 ${res.version ?? ""} ${res.latencyMs ?? 0}ms`),
    onError: (err) => toast.error(errMsg(err)),
  });

  const [deploy, setDeploy] = useState(emptyDeploy);
  const deployM = useMutation({
    mutationFn: () =>
      apiPostJson<{ instanceId?: number; instanceWarning?: string }>("/api/app-center/mysql/k8s-deploy", {
        ...deploy,
        templateId: deploy.templateId === "none" ? 0 : Number(deploy.templateId),
        svcPort: Number(deploy.svcPort) || 3306,
        nodePortMysql: Number(deploy.nodePortMysql) || 0,
      }),
    onSuccess: (res) => {
      toast.success(res.instanceWarning ? `已部署，登记提示：${res.instanceWarning}` : "MySQL 已部署到集群");
      if (res.instanceId) setSelectedId(res.instanceId);
      qc.invalidateQueries({ queryKey: ["app-center-mysql-instances"] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const [template, setTemplate] = useState(emptyTemplate);
  const createTplM = useMutation({
    mutationFn: () =>
      apiPostJson<{ id: number }>("/api/app-center/mysql/templates", {
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
      }),
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
    mutationFn: () =>
      apiPostJson<SQLResult>(`/api/app-center/mysql/instances/${selected?.id}/query`, {
        sql,
        schema,
        limit: 300,
        confirmMutation,
      }),
    onSuccess: (res) => setSqlResult(res),
    onError: (err) => toast.error(errMsg(err)),
  });

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
      apiPostJson<{ id: number; backupName: string }>(`/api/app-center/mysql/instances/${selected?.id}/backups`, {
        schema: backup.schema,
        backupName: backup.backupName,
      }),
    onSuccess: (res) => {
      toast.success(`MySQL 备份已完成：${res.backupName}`);
      setBackup((b) => ({ ...b, backupName: "" }));
      qc.invalidateQueries({ queryKey: ["app-center-mysql-backups", selected?.id] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  const restoreBackupM = useMutation({
    mutationFn: () =>
      apiPostJson(`/api/app-center/mysql/instances/${selected?.id}/backups/${backup.restoreBackupId}/restore`, {
        confirm: true,
        targetSchema: backup.targetSchema,
      }),
    onSuccess: () => {
      toast.success("MySQL 备份已恢复");
      setBackup((b) => ({ ...b, restoreBackupId: "" }));
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  const deleteBackupM = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/app-center/mysql/instances/${selected?.id}/backups/${id}`),
    onSuccess: () => {
      toast.success("MySQL 备份已删除");
      qc.invalidateQueries({ queryKey: ["app-center-mysql-backups", selected?.id] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  const [userForm, setUserForm] = useState(emptyUser);
  const createUserM = useMutation({
    mutationFn: () =>
      apiPostJson(`/api/app-center/mysql/instances/${selected?.id}/users`, {
        username: userForm.username,
        host: userForm.host,
        password: userForm.password,
        schema: userForm.schema,
        role: userForm.role,
      }),
    onSuccess: () => {
      toast.success("MySQL 用户已创建");
      setUserForm((f) => ({ ...f, username: "", password: "" }));
      qc.invalidateQueries({ queryKey: ["app-center-mysql-users", selected?.id] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  const changePasswordM = useMutation({
    mutationFn: () =>
      apiPutJson(`/api/app-center/mysql/instances/${selected?.id}/users/${encodeURIComponent(userForm.passwordUser)}/password`, {
        host: userForm.passwordHost,
        password: userForm.newPassword,
      }),
    onSuccess: () => {
      toast.success("MySQL 用户密码已更新");
      setUserForm((f) => ({ ...f, newPassword: "" }));
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  const deleteUserM = useMutation({
    mutationFn: (u: MySQLUser) =>
      apiDeleteJson(
        `/api/app-center/mysql/instances/${selected?.id}/users/${encodeURIComponent(u.username)}?host=${encodeURIComponent(u.host)}`
      ),
    onSuccess: () => {
      toast.success("MySQL 用户已删除");
      qc.invalidateQueries({ queryKey: ["app-center-mysql-users", selected?.id] });
    },
    onError: (err) => toast.error(errMsg(err)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">MySQL</h1>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={statusQ.data?.mysqlReachable ? "default" : "outline"}>
              元数据 {statusQ.data?.mysqlReachable ? "已连接" : "未连接"}
            </Badge>
            <Badge variant={statusQ.data?.encryptionReady ? "default" : "destructive"}>
              加密 {statusQ.data?.encryptionReady ? "就绪" : "异常"}
            </Badge>
            <Badge variant={statusQ.data?.k8sReady ? "default" : "outline"}>
              K8s {statusQ.data?.k8sReady ? "可用" : "未连接"}
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["app-center-mysql-status"] });
            qc.invalidateQueries({ queryKey: ["app-center-mysql-instances"] });
            qc.invalidateQueries({ queryKey: ["app-center-mysql-templates"] });
            qc.invalidateQueries({ queryKey: ["app-center-mysql-backups", selected?.id] });
            qc.invalidateQueries({ queryKey: ["app-center-mysql-users", selected?.id] });
          }}
        >
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      {statusQ.data?.mysqlConnectError ? (
        <Alert variant="destructive">
          <AlertTitle>MySQL 元数据连接失败</AlertTitle>
          <AlertDescription>{statusQ.data.mysqlConnectError}</AlertDescription>
        </Alert>
      ) : null}
      {statusQ.data?.encryptionError ? (
        <Alert variant="destructive">
          <AlertTitle>加密密钥不可用</AlertTitle>
          <AlertDescription>{statusQ.data.encryptionError}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="instances" className="space-y-4">
        <TabsList>
          <TabsTrigger value="instances">实例</TabsTrigger>
          <TabsTrigger value="deploy">K8s 部署</TabsTrigger>
          <TabsTrigger value="runtime">运行态</TabsTrigger>
          <TabsTrigger value="sql">SQL</TabsTrigger>
          <TabsTrigger value="users">用户</TabsTrigger>
          <TabsTrigger value="backups">备份</TabsTrigger>
          <TabsTrigger value="templates">模版</TabsTrigger>
        </TabsList>

        <TabsContent value="instances" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plus className="h-4 w-4" />
                  外部实例
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="名称">
                  <Input value={external.name} onChange={(e) => setExternal({ ...external, name: e.target.value })} />
                </Field>
                <div className="grid grid-cols-[1fr_120px] gap-2">
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
                </div>
                <Field label="用户">
                  <Input
                    value={external.username}
                    onChange={(e) => setExternal({ ...external, username: e.target.value })}
                  />
                </Field>
                <Field label="密码">
                  <Input
                    type="password"
                    value={external.password}
                    onChange={(e) => setExternal({ ...external, password: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
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
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={!canWrite || createExternalM.isPending}
                  onClick={() => createExternalM.mutate()}
                >
                  {createExternalM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  登记实例
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="h-4 w-4" />
                  实例列表
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>模式</TableHead>
                        <TableHead>连接</TableHead>
                        <TableHead>库</TableHead>
                        <TableHead className="w-[190px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {instances.map((i) => (
                        <TableRow
                          key={i.id}
                          className={cn("cursor-pointer", selected?.id === i.id && "bg-slate-50")}
                          onClick={() => setSelectedId(i.id)}
                        >
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell>
                            <Badge variant={i.summary.k8sManaged ? "default" : "outline"}>
                              {i.summary.k8sManaged ? "K8s" : "外部"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{endpointOf(i)}</TableCell>
                          <TableCell>{i.summary.defaultSchema || "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  pingM.mutate(i.id);
                                }}
                              >
                                <Activity className="h-3.5 w-3.5" />
                                Ping
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={!canWrite || deleteM.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`删除 ${i.name}？K8s 托管实例会一并清理资源。`)) deleteM.mutate(i.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {instances.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                            暂无 MySQL 实例
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="deploy">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4" />
                K8s 托管 MySQL
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <Field label="命名空间">
                <Input value={deploy.namespace} onChange={(e) => setDeploy({ ...deploy, namespace: e.target.value })} />
              </Field>
              <Field label="名称">
                <Input value={deploy.baseName} onChange={(e) => setDeploy({ ...deploy, baseName: e.target.value })} />
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
              <Field label="MySQL 镜像">
                <Input value={deploy.mysqlImage} onChange={(e) => setDeploy({ ...deploy, mysqlImage: e.target.value })} />
              </Field>
              <Field label="Exporter 镜像">
                <Input
                  value={deploy.exporterImage}
                  onChange={(e) => setDeploy({ ...deploy, exporterImage: e.target.value })}
                />
              </Field>
              <Field label="StorageClass">
                <Input
                  value={deploy.storageClassName}
                  onChange={(e) => setDeploy({ ...deploy, storageClassName: e.target.value })}
                />
              </Field>
              <Field label="容量">
                <Input value={deploy.storageSize} onChange={(e) => setDeploy({ ...deploy, storageSize: e.target.value })} />
              </Field>
              <div className="flex items-end gap-6">
                <ToggleLine label="Exporter" checked={deploy.enableExporter} onChange={(v) => setDeploy({ ...deploy, enableExporter: v })} />
                <ToggleLine label="持久化" checked={deploy.persistenceEnabled} onChange={(v) => setDeploy({ ...deploy, persistenceEnabled: v })} />
              </div>
              <div className="flex items-end">
                <Button className="w-full gap-2" disabled={!canDeploy || deployM.isPending} onClick={() => deployM.mutate()}>
                  {deployM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  部署并登记
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runtime" className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <InstanceSelect instances={instances} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" />
                  运行态
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {runtimeQ.isLoading ? <LoadingLine /> : runtimeQ.isError ? <ErrorLine error={runtimeQ.error} /> : (
                  <>
                    <KV k="版本" v={`${runtimeQ.data?.version ?? "-"} ${runtimeQ.data?.versionComment ?? ""}`} />
                    <KV k="主机" v={runtimeQ.data?.hostname ?? "-"} />
                    <KV k="只读" v={boolText(runtimeQ.data?.readOnly)} />
                    <KV k="super_read_only" v={boolText(runtimeQ.data?.superReadOnly)} />
                    <KV k="最大连接" v={runtimeQ.data?.maxConnections ?? "-"} />
                    <KV k="运行秒数" v={runtimeQ.data?.uptimeSeconds ?? "-"} />
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" />
                  Schema
                </CardTitle>
              </CardHeader>
              <CardContent>
                {schemasQ.isLoading ? <LoadingLine /> : schemasQ.isError ? <ErrorLine error={schemasQ.error} /> : (
                  <div className="flex flex-wrap gap-2">
                    {(schemasQ.data?.schemas ?? []).map((s) => (
                      <Badge key={s} variant="outline" className="font-mono">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="h-4 w-4" />
                  Processlist
                </CardTitle>
              </CardHeader>
              <CardContent>
                {processQ.isLoading ? <LoadingLine /> : processQ.isError ? <ErrorLine error={processQ.error} /> : (
                  <DataTable rows={processQ.data?.processes ?? []} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sql" className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <InstanceSelect instances={instances} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="h-4 w-4" />
                SQL 控制台
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Schema">
                <Input value={schema} onChange={(e) => setSchema(e.target.value)} />
              </Field>
              <Textarea className="min-h-[180px] font-mono" value={sql} onChange={(e) => setSql(e.target.value)} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={confirmMutation} onCheckedChange={(v) => setConfirmMutation(v === true)} />
                  允许写操作
                </label>
                <Button disabled={!selected || queryM.isPending} className="gap-2" onClick={() => queryM.mutate()}>
                  {queryM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  执行
                </Button>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <InstanceSelect instances={instances} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">创建用户</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                <Button className="w-full gap-2" disabled={!selected || !canWrite || createUserM.isPending} onClick={() => createUserM.mutate()}>
                  {createUserM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  创建用户
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">修改密码</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                <Button className="w-full" disabled={!selected || !canWrite || changePasswordM.isPending} onClick={() => changePasswordM.mutate()}>
                  更新密码
                </Button>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">用户列表</CardTitle>
            </CardHeader>
            <CardContent>
              {usersQ.isLoading ? <LoadingLine /> : usersQ.isError ? <ErrorLine error={usersQ.error} /> : (
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
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={!canWrite || deleteUserM.isPending}
                            onClick={() => {
                              if (window.confirm(`删除 MySQL 用户 ${u.username}@${u.host}？`)) deleteUserM.mutate(u);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups" className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <InstanceSelect instances={instances} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">创建备份</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Schema">
                  <Input value={backup.schema} onChange={(e) => setBackup({ ...backup, schema: e.target.value })} />
                </Field>
                <Field label="备份名">
                  <Input value={backup.backupName} onChange={(e) => setBackup({ ...backup, backupName: e.target.value })} />
                </Field>
                <Button className="w-full gap-2" disabled={!selected || !canWrite || createBackupM.isPending} onClick={() => createBackupM.mutate()}>
                  {createBackupM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                  立即备份
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">恢复备份</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="备份 ID">
                  <Input value={backup.restoreBackupId} onChange={(e) => setBackup({ ...backup, restoreBackupId: e.target.value })} />
                </Field>
                <Field label="目标 Schema">
                  <Input value={backup.targetSchema} onChange={(e) => setBackup({ ...backup, targetSchema: e.target.value })} />
                </Field>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!selected || !canWrite || !backup.restoreBackupId || restoreBackupM.isPending}
                  onClick={() => {
                    if (window.confirm("确认恢复该备份到目标 Schema？")) restoreBackupM.mutate();
                  }}
                >
                  恢复
                </Button>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">备份列表</CardTitle>
            </CardHeader>
            <CardContent>
              {backupsQ.isLoading ? <LoadingLine /> : backupsQ.isError ? <ErrorLine error={backupsQ.error} /> : (
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
                        <TableCell>{b.sizeBytes ?? 0}</TableCell>
                        <TableCell>{b.finishedAt ?? "-"}</TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={!canWrite || deleteBackupM.isPending}
                            onClick={() => {
                              if (window.confirm(`删除备份 ${b.backupName}？`)) deleteBackupM.mutate(b.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4" />
                新建模版
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                  <Input
                    value={template.defaultVersion}
                    onChange={(e) => setTemplate({ ...template, defaultVersion: e.target.value })}
                  />
                </Field>
                <Field label="容量">
                  <Input
                    value={template.defaultStorageSize}
                    onChange={(e) => setTemplate({ ...template, defaultStorageSize: e.target.value })}
                  />
                </Field>
              </div>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">模版列表</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                rows={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  mysqlImage: t.config.mysqlImage,
                  exporterImage: t.config.exporterImage ?? "-",
                  version: t.config.defaultVersion ?? "-",
                  size: t.config.defaultStorageSize ?? "-",
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
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

function InstanceSelect({
  instances,
  selectedId,
  onSelect,
}: {
  instances: MySQLInstance[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">目标实例</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {instances.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onSelect(i.id)}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              selectedId === i.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
            )}
          >
            <div className="font-medium text-slate-900">{i.name}</div>
            <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{endpointOf(i)}</div>
          </button>
        ))}
        {instances.length === 0 ? <p className="text-sm text-slate-500">暂无实例</p> : null}
      </CardContent>
    </Card>
  );
}

function LoadingLine() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      加载中
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
