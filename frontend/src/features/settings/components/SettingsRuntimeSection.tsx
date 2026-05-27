import React, { useEffect, useState } from "react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  Trash2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { YamlEditor } from "@/shared/ui/YamlEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { toast } from "sonner";
import { apiGetJson, apiPutJson, type K8sSidebarMenuItem, type RuntimeSettingsDTO } from "@/lib/api";
import { CollapsibleManual } from "@/shared/ui/CollapsibleManual";
import AccountPlatformSettingsBody from "@/features/account/components/AccountPlatformSettingsBody";
import OidcAuthentikHelp from "@/features/account/components/OidcAuthentikHelp";
import HarborRedisIndexSettingsPanel from "@/features/harbor/components/HarborRedisIndexSettingsPanel";
import BaotaSettingsWizard from "@/features/baota/components/BaotaSettingsWizard";

export type SettingsRuntimeVariant = "full" | "k8s" | "virtualMachine" | "account" | "baota";
export type SettingsRuntimeFocus = "all" | "vcenter" | "monitoring" | "idrac" | "vmlog";
export type SettingsRuntimeK8sFocus = "all" | "connection" | "ingress" | "harbor" | "menu";

type SettingsRuntimeSectionProps = {
  variant?: SettingsRuntimeVariant;
  focus?: SettingsRuntimeFocus;
  k8sFocus?: SettingsRuntimeK8sFocus;
};

type RuntimeIdracTargetForm = {
  id: string;
  name: string;
  host: string;
  user: string;
  password: string;
  insecure: boolean;
  default?: boolean;
};

const emptyIdracTarget = (index: number): RuntimeIdracTargetForm => ({
  id: `idrac-${index}`,
  name: "",
  host: "",
  user: "root",
  password: "",
  insecure: true,
  default: false,
});

function normalizeIdracTargetID(raw: string, index: number): string {
  const id = raw.trim().toLowerCase();
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(id)) return id;
  return `idrac-${index + 1}`;
}

function normalizeIdracTargetDefaults(rows: RuntimeIdracTargetForm[]): RuntimeIdracTargetForm[] {
  const normalized = rows.map((row, index) => ({
    ...row,
    id: normalizeIdracTargetID(row.id, index),
    name: row.name.trim(),
    host: row.host.trim(),
    user: row.user.trim(),
    password: row.password,
    insecure: row.insecure !== false,
    default: Boolean(row.default),
  }));
  if (normalized.length === 0) return normalized;
  let hasDefault = false;
  for (const row of normalized) {
    if (row.default && !hasDefault) {
      hasDefault = true;
      continue;
    }
    if (row.default && hasDefault) row.default = false;
  }
  if (!hasDefault) normalized[0].default = true;
  return normalized;
}

function runtimeIdracTargetsFromForm(form: RuntimeSettingsDTO | null): RuntimeIdracTargetForm[] {
  const rawTargets = Array.isArray(form?.idracTargets) ? form.idracTargets : [];
  if (rawTargets.length > 0) {
    return normalizeIdracTargetDefaults(
      rawTargets.map((row, index) => ({
        id: String(row.id ?? `idrac-${index + 1}`),
        name: String(row.name ?? ""),
        host: String(row.host ?? ""),
        user: String(row.user ?? ""),
        password: String(row.password ?? ""),
        insecure: row.insecure !== false,
        default: Boolean(row.default),
      }))
    );
  }
  const legacyHost = String(form?.idracHost ?? "").trim();
  if (legacyHost) {
    return [
      {
        id: "default",
        name: "默认 iDRAC",
        host: legacyHost,
        user: String(form?.idracUser ?? "").trim(),
        password: String(form?.idracPassword ?? ""),
        insecure: form?.idracInsecure !== false,
        default: true,
      },
    ];
  }
  return [emptyIdracTarget(1)];
}

function idracTargetsForPayload(rows: RuntimeIdracTargetForm[]): RuntimeIdracTargetForm[] {
  return normalizeIdracTargetDefaults(rows).filter((row) => row.host.trim() !== "");
}

function defaultIdracTarget(rows: RuntimeIdracTargetForm[]): RuntimeIdracTargetForm | undefined {
  return rows.find((row) => row.default) ?? rows[0];
}

const DEFAULT_K8S_SIDEBAR_MENU: K8sSidebarMenuItem[] = [
  { key: "pods", label: "Pods", order: 10 },
  { key: "namespaces", label: "NameSpace", order: 20 },
  { key: "nodes", label: "Nodes", order: 30 },
  { key: "etcd", label: "etcd", order: 35 },
  { key: "rbac", label: "RBAC", order: 40 },
  { key: "harbor", label: "Harbor 仓库", order: 50 },
  { key: "customResources", label: "自定义资源", order: 60 },
];

function normalizeK8sSidebarMenu(items?: K8sSidebarMenuItem[]): K8sSidebarMenuItem[] {
  const defaults = new Map(DEFAULT_K8S_SIDEBAR_MENU.map((item) => [item.key, item]));
  const custom = new Map<string, K8sSidebarMenuItem>();
  (items ?? []).forEach((item) => {
    const base = defaults.get(item.key);
    if (!base || custom.has(item.key)) return;
    custom.set(item.key, {
      key: item.key,
      label: item.label?.trim() || base.label,
      hidden: Boolean(item.hidden),
      order: Number(item.order) || base.order,
    });
  });
  const merged = DEFAULT_K8S_SIDEBAR_MENU.map((base) => custom.get(base.key) ?? { ...base });
  merged.sort((a, b) => (a.order || 0) - (b.order || 0));
  return merged.map((item, index) => ({
    ...item,
    label: item.label?.trim() || defaults.get(item.key)?.label || item.key,
    order: (index + 1) * 10,
  }));
}

function moveK8sSidebarMenuItem(items: K8sSidebarMenuItem[], index: number, delta: -1 | 1): K8sSidebarMenuItem[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return items;
  const [picked] = next.splice(index, 1);
  next.splice(target, 0, picked);
  return next.map((item, idx) => ({ ...item, order: (idx + 1) * 10 }));
}

const SettingsRuntimeSection: React.FC<SettingsRuntimeSectionProps> = ({
  variant = "full",
  focus = "all",
  k8sFocus = "all",
}) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<RuntimeSettingsDTO | null>(null);
  const [menuDialogOpen, setMenuDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGetJson<RuntimeSettingsDTO>("/api/settings/runtime");
      setForm(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setField = (key: string, value: unknown) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const k8sSidebarMenu = normalizeK8sSidebarMenu(form?.k8sSidebarMenu);
  const idracTargets = React.useMemo(() => runtimeIdracTargetsFromForm(form), [form]);

  const setIdracTargets = (targets: RuntimeIdracTargetForm[]) => {
    setForm((prev) => {
      if (!prev) return prev;
      const normalized = normalizeIdracTargetDefaults(targets);
      const configuredTargets = idracTargetsForPayload(normalized);
      const picked = defaultIdracTarget(configuredTargets);
      return {
        ...prev,
        idracTargets: normalized,
        idracHost: picked?.host ?? "",
        idracUser: picked?.user ?? "",
        idracPassword: picked?.password ?? "",
        idracInsecure: picked ? picked.insecure !== false : true,
      };
    });
  };

  const updateIdracTarget = (index: number, patch: Partial<RuntimeIdracTargetForm>) => {
    setIdracTargets(idracTargets.map((target, i) => (i === index ? { ...target, ...patch } : target)));
  };

  const addIdracTarget = () => {
    setIdracTargets([...idracTargets, emptyIdracTarget(idracTargets.length + 1)]);
  };

  const removeIdracTarget = (index: number) => {
    const next = idracTargets.filter((_, i) => i !== index);
    setIdracTargets(next.length > 0 ? next : [emptyIdracTarget(1)]);
  };

  const markDefaultIdracTarget = (index: number) => {
    setIdracTargets(idracTargets.map((target, i) => ({ ...target, default: i === index })));
  };

  const updateK8sSidebarMenu = (updater: (items: K8sSidebarMenuItem[]) => K8sSidebarMenuItem[]) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        k8sSidebarMenu: normalizeK8sSidebarMenu(updater(normalizeK8sSidebarMenu(prev.k8sSidebarMenu))),
      };
    });
  };

  const onSave = async () => {
    if (!form) return;
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const payload = { ...form } as Record<string, unknown>;
      payload.k8sSidebarMenu = normalizeK8sSidebarMenu(form.k8sSidebarMenu);
      const mh = String(payload.mysqlHost ?? "").trim();
      const mp = Number(payload.mysqlPort ?? 0);
      const mdb = String(payload.mysqlDatabase ?? "").trim();
      const mu = String(payload.mysqlUser ?? "").trim();
      if (mh && mp > 0 && mdb && mu) {
        payload.mysqlDsn = "";
      }
      const rh = String(payload.redisHost ?? "").trim();
      const rport = Number(payload.redisPort ?? 0);
      if (rh && rport > 0) {
        payload.redisAddr = "";
      }
      payload.baotaSslCertName = String(payload.baotaSslCertName ?? "").trim();
      payload.baotaSslPemContent = String(payload.baotaSslPemContent ?? "").trim();
      payload.baotaSslKeyContent = String(payload.baotaSslKeyContent ?? "").trim();
      if ((payload.baotaSslPemContent === "") !== (payload.baotaSslKeyContent === "")) {
        throw new Error("baotaSslPemContent 与 baotaSslKeyContent 必须同时填写");
      }
      const normalizedIdracTargets = idracTargetsForPayload(runtimeIdracTargetsFromForm(form));
      const pickedIdracTarget = defaultIdracTarget(normalizedIdracTargets);
      payload.idracTargets = normalizedIdracTargets;
      payload.idracHost = pickedIdracTarget?.host ?? "";
      payload.idracUser = pickedIdracTarget?.user ?? "";
      payload.idracPassword = pickedIdracTarget?.password ?? "";
      payload.idracInsecure = pickedIdracTarget ? pickedIdracTarget.insecure !== false : true;
      await apiPutJson("/api/settings/runtime", payload);
      const msg = "已保存并重载配置";
      setOk(msg);
      toast.success("保存成功");
      await queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["runtime-status"] });
      await load();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m);
      toast.error(`保存失败：${m}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {variant === "k8s"
          ? "加载运行时配置…"
          : variant === "baota"
            ? "加载宝塔与 Ingress 配置…"
            : "加载运行时配置…"}
      </div>
    );
  }

  if (err && !form) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {err}
      </div>
    );
  }

  if (!form) return null;

  const v = variant;
  const showAccountFull = v === "full";
  const showK8s = v === "full" || v === "k8s";
  const k8sPanelFocus: SettingsRuntimeK8sFocus = v === "k8s" ? k8sFocus : "all";
  const showK8sConnection = showK8s && (k8sPanelFocus === "all" || k8sPanelFocus === "connection");
  const showK8sIngress = showK8s && (k8sPanelFocus === "all" || k8sPanelFocus === "ingress");
  const showK8sHarbor = showK8s && (k8sPanelFocus === "all" || k8sPanelFocus === "harbor");
  const showK8sMenu = showK8s && v === "k8s" && (k8sPanelFocus === "all" || k8sPanelFocus === "menu");
  const showVirtualMachine = v === "full" || v === "virtualMachine";
  const vmFocus: SettingsRuntimeFocus = v === "virtualMachine" ? focus : "all";
  const showVcenterSettings = showVirtualMachine && (vmFocus === "all" || vmFocus === "vcenter");
  const showMonitoringSettings = showVirtualMachine && (vmFocus === "all" || vmFocus === "monitoring");
  const showIdracSettings = showVirtualMachine && (vmFocus === "all" || vmFocus === "idrac");
  const showVmLogSettings = showVirtualMachine && (vmFocus === "all" || vmFocus === "vmlog");
  const k8sMode = (form.k8s as { mode?: string } | undefined)?.mode ?? "none";
  const k8sKube = (form.k8s as { kubeconfigYaml?: string } | undefined)?.kubeconfigYaml ?? "";
  const defaultSaveLabel = v === "k8s" ? "保存" : "保存运行时配置";
  const k8sRuntimeTitle: Record<SettingsRuntimeK8sFocus, string> = {
    all: "集群连接",
    connection: "集群连接",
    ingress: "入口控制器参数",
    harbor: "Harbor 镜像仓库",
    menu: "Kubernetes 菜单",
  };
  const k8sRuntimeDescription: Record<SettingsRuntimeK8sFocus, string> = {
    all: "使用集群内凭据或粘贴 kubeconfig，保存后生效。",
    connection: "使用集群内凭据、进程环境或粘贴 kubeconfig，保存后生效。",
    ingress: "维护 ingress-nginx hostNetwork 端口、固定节点与清单下载策略；安装动作在左侧卡片执行。",
    harbor: "维护 Harbor API 根地址、Robot 凭据与索引缓存配置，保存后 Harbor 工作区会重新读取。",
    menu: "维护 Kubernetes 工作区左侧菜单的显示名称、顺序与隐藏状态。",
  };
  const virtualMachineTitle: Record<SettingsRuntimeFocus, string> = {
    all: "配置",
    vcenter: "vCenter 连接",
    monitoring: "监控数据源",
    idrac: "iDRAC 配置",
    vmlog: "VMLog",
  };
  const virtualMachineDescription: Record<SettingsRuntimeFocus, string> = {
    all: "集中维护 vCenter 连接、监控数据源、iDRAC 带外目标与 VMLog；保存后热重载。",
    vcenter: "维护 vSphere API 入口、账号、密码与虚拟机列表缓存时间；保存后资源中心会重新读取连接状态。",
    monitoring: "维护 vCenter、PVE、公有云与 GPU 监控的 Prometheus 或 VictoriaMetrics vmselect 地址。",
    idrac: "维护宿主机带外 Redfish 目标；支持多台 iDRAC，并指定一个默认目标兼容旧接口。",
    vmlog: "维护 VictoriaLogs 查询地址、日志保留期与虚拟机 Vector 采集器下载源。",
  };

  if (v === "account") {
    return (
      <AccountPlatformSettingsBody
        form={form}
        setField={setField}
        err={err}
        ok={ok}
        saving={saving}
        onSave={onSave}
      />
    );
  }

  if (v === "baota") {
    return (
      <BaotaSettingsWizard
        form={form}
        setField={setField}
        err={err}
        ok={ok}
        saving={saving}
        onSave={onSave}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-base font-bold text-gray-900">
            {v === "k8s" && k8sRuntimeTitle[k8sPanelFocus]}
            {v === "virtualMachine" && virtualMachineTitle[vmFocus]}
            {v === "full" && "运行时配置（MySQL 动态配置）"}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {v === "full" &&
              "在此补充 K8s、虚拟机等；MySQL 连接来自静态 config.yaml 或环境变量，页面不写入这部分。Redis 仅需 IP、端口、密码；密钥类留空表示不修改原值。宝塔与 Ingress 请在「宝塔」工作区 → 宝塔设置中配置。"}
            {v === "k8s" && k8sRuntimeDescription[k8sPanelFocus]}
            {v === "virtualMachine" && virtualMachineDescription[vmFocus]}
          </p>
        </div>
        <div className="p-6 space-y-6 text-sm">
          {showAccountFull && (
            <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>platformPublicUrl</Label>
              <Input
                value={String(form.platformPublicUrl ?? "")}
                onChange={(e) => setField("platformPublicUrl", e.target.value)}
              />
            </div>
            {String(form.mysqlHost ?? "").trim() === "" &&
              String(form.mysqlDsn ?? "").trim() !== "" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-amber-800">当前 mysqlDsn（旧格式，请迁移到下方分字段后保存）</Label>
                  <Input
                    readOnly
                    className="font-mono text-xs bg-amber-50"
                    value={String(form.mysqlDsn ?? "")}
                  />
                </div>
              )}
            <div className="space-y-2 sm:col-span-2">
              <Label>MySQL 地址</Label>
              <Input
                readOnly
                className="bg-gray-50"
                value={String(form.mysqlHost ?? "")}
                onChange={(e) => setField("mysqlHost", e.target.value)}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-2">
              <Label>MySQL 端口</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                readOnly
                className="bg-gray-50"
                value={Number(form.mysqlPort ?? 3306)}
                onChange={(e) => setField("mysqlPort", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>库名</Label>
              <Input
                readOnly
                className="bg-gray-50"
                value={String(form.mysqlDatabase ?? "")}
                onChange={(e) => setField("mysqlDatabase", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>用户</Label>
              <Input
                readOnly
                className="bg-gray-50"
                value={String(form.mysqlUser ?? "")}
                onChange={(e) => setField("mysqlUser", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>MySQL 密码（静态配置）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                readOnly
                className="bg-gray-50"
                value={String(form.mysqlPassword ?? "")}
                onChange={(e) => setField("mysqlPassword", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Redis IP</Label>
              <Input
                value={String(form.redisHost ?? "")}
                onChange={(e) => setField("redisHost", e.target.value)}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-2">
              <Label>Redis 端口</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={Number(form.redisPort ?? 6379)}
                onChange={(e) => setField("redisPort", Number(e.target.value))}
              />
            </div>
            {String(form.redisHost ?? "").trim() === "" &&
              String(form.redisAddr ?? "").trim() !== "" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-amber-800">当前 redisAddr（旧格式，请迁移到 IP+端口）</Label>
                  <Input
                    readOnly
                    className="font-mono text-xs bg-amber-50"
                    value={String(form.redisAddr ?? "")}
                  />
                </div>
              )}
            <div className="space-y-2 sm:col-span-2">
              <Label>Redis 密码（留空保留原值）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.redisPassword ?? "")}
                onChange={(e) => setField("redisPassword", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>encryptionKey（留空保留原值）</Label>
              <Input
                value={String(form.encryptionKey ?? "")}
                onChange={(e) => setField("encryptionKey", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-6">
            <p className="text-sm font-semibold text-gray-900">控制台登录</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>dashboardUser</Label>
                <Input
                  value={String(form.dashboardUser ?? "")}
                  onChange={(e) => setField("dashboardUser", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>dashboardSessionDays</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={Number(form.dashboardSessionDays ?? 7)}
                  onChange={(e) => setField("dashboardSessionDays", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>dashboardPassword（留空或 *** 保留）</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={String(form.dashboardPassword ?? "")}
                  onChange={(e) => setField("dashboardPassword", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>dashboardSessionSecret（留空或 *** 保留）</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={String(form.dashboardSessionSecret ?? "")}
                  onChange={(e) => setField("dashboardSessionSecret", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>dashboardListenAddr（如 :8080）</Label>
                <Input
                  value={String(form.dashboardListenAddr ?? "")}
                  onChange={(e) => setField("dashboardListenAddr", e.target.value)}
                  placeholder=":8080"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 sm:col-span-2">
                <span className="text-gray-700">dashboardCookieSecure（HTTPS）</span>
                <Switch
                  checked={Boolean(form.dashboardCookieSecure)}
                  onCheckedChange={(x) => setField("dashboardCookieSecure", x)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-6">
            <p className="text-sm font-semibold text-gray-900">OIDC（四项须同时填写或留空）</p>
            <OidcAuthentikHelp />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcIssuerUrl</Label>
                <Input
                  value={String(form.oidcIssuerUrl ?? "")}
                  onChange={(e) => setField("oidcIssuerUrl", e.target.value)}
                  placeholder="https://idp.example.com/application/o/easypanel/"
                />
              </div>
              <div className="space-y-2">
                <Label>oidcClientId</Label>
                <Input
                  value={String(form.oidcClientId ?? "")}
                  onChange={(e) => setField("oidcClientId", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>oidcClientSecret（留空或 *** 保留）</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={String(form.oidcClientSecret ?? "")}
                  onChange={(e) => setField("oidcClientSecret", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcRedirectUrl</Label>
                <Input
                  value={String(form.oidcRedirectUrl ?? "")}
                  onChange={(e) => setField("oidcRedirectUrl", e.target.value)}
                  placeholder="https://dashboard.example.com/api/auth/oidc/callback"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcScopes（空格分隔，默认可留空使用服务端默认）</Label>
                <Input
                  value={String(form.oidcScopes ?? "")}
                  onChange={(e) => setField("oidcScopes", e.target.value)}
                  placeholder="openid profile email"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 sm:col-span-2">
                <span className="text-sm text-gray-800">
                  oidcSkipIssuerCheck（跳过 issuer 与发现文档比对；仅排查用）
                </span>
                <Switch
                  checked={form.oidcSkipIssuerCheck === true}
                  onCheckedChange={(x) => setField("oidcSkipIssuerCheck", x ? true : false)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 sm:col-span-2">
                <span className="text-sm text-gray-800">
                  oidcSkipClientIdCheck（跳过 aud 须含 Client ID；仅排查用）
                </span>
                <Switch
                  checked={form.oidcSkipClientIdCheck === true}
                  onCheckedChange={(x) => setField("oidcSkipClientIdCheck", x ? true : false)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcSupportedSigningAlgs（可选，逗号分隔，如 RS256,ES256）</Label>
                <Input
                  value={String(form.oidcSupportedSigningAlgs ?? "")}
                  onChange={(e) => setField("oidcSupportedSigningAlgs", e.target.value)}
                  placeholder="留空则由 IdP 发现文档 / 默认 RS256"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcClockSkewSec（可选，0–3600；本机时钟偏快时缓解 id_token 过期）</Label>
                <Input
                  type="number"
                  min={0}
                  max={3600}
                  value={form.oidcClockSkewSec != null ? String(form.oidcClockSkewSec) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setField("oidcClockSkewSec", null);
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    setField("oidcClockSkewSec", Math.min(3600, Math.max(0, Math.floor(n))));
                  }}
                  placeholder="留空表示沿用环境变量或未设置"
                />
              </div>
            </div>
          </div>
            </>
          )}
          {showK8s && (
          <>
          {showK8sConnection && (
          <>
          <div className="space-y-2">
            <Label>{v === "k8s" ? "Cluster mode" : "K8s 模式"}</Label>
            <Select
              value={k8sMode}
              onValueChange={(mode) =>
                setForm((prev) => ({
                  ...prev!,
                  k8s: {
                    ...(prev!.k8s as object),
                    mode,
                    kubeconfigYaml: mode === "kubeconfig" ? k8sKube : "",
                  },
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">none</SelectItem>
                <SelectItem value="incluster">incluster</SelectItem>
                <SelectItem value="kubeconfig">kubeconfig</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {k8sMode === "kubeconfig" && (
            <div className="space-y-2">
              <Label>
                {v === "k8s"
                  ? "Kubeconfig YAML (*** if set; leave blank to keep existing)"
                  : "kubeconfigYaml（*** 表示已配置，留空保留）"}
              </Label>
              <YamlEditor
                value={String((form.k8s as { kubeconfigYaml?: string })?.kubeconfigYaml ?? "")}
                onChange={(v) =>
                  setForm((prev) => ({
                    ...prev!,
                    k8s: { ...(prev!.k8s as object), mode: "kubeconfig", kubeconfigYaml: v },
                  }))
                }
                height="min(35vh, 280px)"
              />
            </div>
          )}
          </>
          )}
          {showK8sMenu && (
            <div className="space-y-4 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Kubernetes 左侧菜单</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">
                    配置桌面端 Kubernetes 工作区左侧菜单的顺序、显示名称与隐藏状态。保存后写入 MySQL 动态配置，并通过 Redis 镜像同步到多副本。
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => setMenuDialogOpen(true)}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  配置菜单
                </Button>
              </div>
              <div className="space-y-2">
                {k8sSidebarMenu.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-100 bg-white/80 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-gray-500">{item.key}</p>
                    </div>
                    <span className={item.hidden ? "text-amber-700" : "text-emerald-700"}>
                      {item.hidden ? "已隐藏" : `顺序 #${item.order / 10}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {showK8sMenu && (
            <Dialog open={menuDialogOpen} onOpenChange={setMenuDialogOpen}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>配置 Kubernetes 菜单</DialogTitle>
                  <DialogDescription>
                    仅影响桌面端 Kubernetes 左侧一级菜单。Dashboard 与集群设置不在本次可隐藏范围内。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  {k8sSidebarMenu.map((item, index) => (
                    <div
                      key={item.key}
                      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-center"
                    >
                      <div className="space-y-1.5">
                        <Label className="text-xs">显示名称</Label>
                        <Input
                          value={item.label}
                          onChange={(e) => {
                            const value = e.target.value;
                            updateK8sSidebarMenu((items) =>
                              items.map((it) => (it.key === item.key ? { ...it, label: value } : it))
                            );
                          }}
                        />
                        <p className="font-mono text-[11px] text-slate-500">key: {item.key}</p>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="text-xs text-slate-700">隐藏此菜单</span>
                        <Switch
                          checked={Boolean(item.hidden)}
                          onCheckedChange={(checked) => {
                            updateK8sSidebarMenu((items) =>
                              items.map((it) => (it.key === item.key ? { ...it, hidden: checked } : it))
                            );
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => updateK8sSidebarMenu((items) => moveK8sSidebarMenuItem(items, index, -1))}
                        >
                          <ArrowUp className="mr-1 h-4 w-4" />
                          上移
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === k8sSidebarMenu.length - 1}
                          onClick={() => updateK8sSidebarMenu((items) => moveK8sSidebarMenuItem(items, index, 1))}
                        >
                          <ArrowDown className="mr-1 h-4 w-4" />
                          下移
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const fallback = DEFAULT_K8S_SIDEBAR_MENU.find((it) => it.key === item.key);
                            if (!fallback) return;
                            updateK8sSidebarMenu((items) =>
                              items.map((it) =>
                                it.key === item.key ? { ...it, label: fallback.label, hidden: false } : it
                              )
                            );
                          }}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" />
                          恢复默认
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setMenuDialogOpen(false)}>
                    关闭
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {showK8sIngress && (
            <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
              <CollapsibleManual
                storageKey="settings.runtime.full-ingress-hostnetwork-hint"
                title="ingress-nginx hostNetwork（一键安装默认端口）"
                variant="skyInline"
                titleClassName="text-sm text-gray-900"
              >
                <p className="text-xs text-gray-600">
                  保存后在「集群设置」安装；控制器使用 hostNetwork，默认节点端口 80 / 443；Prometheus metrics 为清单默认 10254。VictoriaLogs
                  请在集群设置页的独立卡片中配置。
                </p>
              </CollapsibleManual>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">ingressNginxHostHttpPort（0 表示默认 80）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={65535}
                    placeholder="80"
                    value={
                      form.ingressNginxHostHttpPort != null && Number(form.ingressNginxHostHttpPort) > 0
                        ? String(form.ingressNginxHostHttpPort)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setField("ingressNginxHostHttpPort", 0);
                        return;
                      }
                      const n = Number(val);
                      if (!Number.isFinite(n)) return;
                      setField("ingressNginxHostHttpPort", Math.floor(n));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ingressNginxHostHttpsPort（0 表示默认 443）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={65535}
                    placeholder="443"
                    value={
                      form.ingressNginxHostHttpsPort != null && Number(form.ingressNginxHostHttpsPort) > 0
                        ? String(form.ingressNginxHostHttpsPort)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setField("ingressNginxHostHttpsPort", 0);
                        return;
                      }
                      const n = Number(val);
                      if (!Number.isFinite(n)) return;
                      setField("ingressNginxHostHttpsPort", Math.floor(n));
                    }}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ingressNginxControllerNodeName（可选，安装 ingress 时默认固定节点）</Label>
                  <Input
                    className="font-mono text-xs"
                    placeholder="例如 k8s-master-01"
                    value={String(form.ingressNginxControllerNodeName ?? "")}
                    onChange={(e) => setField("ingressNginxControllerNodeName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ingressNginxManifestUrl（可选）</Label>
                  <Input
                    className="font-mono text-xs"
                    value={String(form.ingressNginxManifestUrl ?? "")}
                    onChange={(e) => setField("ingressNginxManifestUrl", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">k8sAddonsManifestMirror（国内建议 ghproxy_preferred）</Label>
                  <Select
                    value={String(form.k8sAddonsManifestMirror ?? "").trim() || "auto"}
                    onValueChange={(x) => setField("k8sAddonsManifestMirror", x)}
                  >
                    <SelectTrigger className="font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动（直连失败再走 ghproxy）</SelectItem>
                      <SelectItem value="ghproxy_preferred">国内推荐（优先 ghproxy）</SelectItem>
                      <SelectItem value="direct">仅直连</SelectItem>
                      <SelectItem value="ghproxy_only">仅 ghproxy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          {v === "full" && (
            <div className="space-y-2">
              <Label>prometheusUrlK8s（Kubernetes 监控数据源）</Label>
              <Input
                className="font-mono text-xs"
                value={String(form.prometheusUrlK8s ?? "")}
                onChange={(e) => setField("prometheusUrlK8s", e.target.value)}
                placeholder="http://prometheus-k8s.monitoring.svc:9090 或 http://vmselect:8481"
              />
              <p className="text-xs text-gray-500">
                与「集群设置 → 监控」写入同一字段；Pod 列表 CPU/内存来自此地址的{" "}
                <code className="rounded bg-gray-100 px-0.5">/api/v1/query</code>（cAdvisor
                指标）。若单独填写下方 <code className="rounded bg-gray-100 px-0.5">vmSelectUrlK8s</code>，则查询优先走
                VictoriaMetrics。
              </p>
            </div>
          )}
          {v === "full" && (
            <div className="space-y-2">
              <Label>vmSelectUrlK8s（可选，VictoriaMetrics vmselect；填写则优先于 prometheusUrlK8s）</Label>
              <Input
                className="font-mono text-xs"
                value={String(form.vmSelectUrlK8s ?? "")}
                onChange={(e) => setField("vmSelectUrlK8s", e.target.value)}
                placeholder="http://vmselect.monitoring.svc:8481"
              />
            </div>
          )}
          {showK8sHarbor && (
            <div className="space-y-3 border-t border-gray-100 pt-6">
              <p className="text-sm font-semibold text-gray-900">Harbor 镜像仓库</p>
              <p className="text-xs text-gray-500">
                供侧栏「Harbor 仓库」调用 Harbor API v2.0。根地址与浏览器访问一致（如{" "}
                <code className="rounded bg-gray-100 px-0.5">https://harbor.example.com</code>
                ，无尾斜杠）。Robot 账号用户名为 <code className="rounded bg-gray-100 px-0.5">robot$项目+名称</code>
                ，密码为创建时生成的 Secret。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>
                    Harbor 根地址 <code className="text-[11px]">harborBaseUrl</code>
                  </Label>
                  <Input
                    className="font-mono text-xs"
                    placeholder="https://harbor.example.com"
                    value={String(form.harborBaseUrl ?? "")}
                    onChange={(e) => setField("harborBaseUrl", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Harbor 账号 <code className="text-[11px]">harborUsername</code>
                  </Label>
                  <Input
                    className="font-mono text-xs"
                    value={String(form.harborUsername ?? "")}
                    onChange={(e) => setField("harborUsername", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Harbor 密码 <code className="text-[11px]">harborPassword</code>（*** 表示已设置，留空保留）
                  </Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                    value={String(form.harborPassword ?? "")}
                    onChange={(e) => setField("harborPassword", e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 sm:col-span-2">
                  <span className="text-gray-700">
                    跳过 TLS 证书校验 <code className="text-[11px]">harborSkipTls</code>（自签证书）
                  </span>
                  <Switch
                    checked={Boolean(form.harborSkipTls)}
                    onCheckedChange={(x) => setField("harborSkipTls", x)}
                  />
                </div>
              </div>
              <HarborRedisIndexSettingsPanel />
            </div>
          )}
          {showK8sHarbor && (
          <div className="space-y-2 border-t border-gray-100 pt-6">
            <p className="text-sm font-semibold text-gray-900">应用中心 Redis 镜像</p>
            <p className="text-xs text-gray-500">
              Harbor 前缀与 imagePullSecret 已迁至控制台「应用中心 → Redis → 模版中心」。进程级环境变量{" "}
              <code className="rounded bg-gray-100 px-0.5 font-mono text-[11px]">REDIS_IMAGE_REGISTRY</code> 等仍可作兼容兜底，不再在运行时表单中编辑。
            </p>
          </div>
          )}
          </>
          )}
          {showVirtualMachine && (
          <>
          {showVcenterSettings && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_360px]">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700">
                    <Link2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">连接身份</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      维护 vSphere API 入口与账号凭据，保存后资源中心会重新读取连接状态。
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2 lg:col-span-2">
                    <Label htmlFor="vcenter-url">
                      访问地址 <code className="ml-1 rounded bg-slate-100 px-1 text-[11px]">vcenterUrl</code>
                    </Label>
                    <Input
                      id="vcenter-url"
                      className="font-mono text-xs"
                      value={String(form.vcenterUrl ?? "")}
                      onChange={(e) => setField("vcenterUrl", e.target.value)}
                      placeholder="https://vcenter.example.com/sdk"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vcenter-user">
                      账号 <code className="ml-1 rounded bg-slate-100 px-1 text-[11px]">vcenterUser</code>
                    </Label>
                    <Input
                      id="vcenter-user"
                      value={String(form.vcenterUser ?? "")}
                      onChange={(e) => setField("vcenterUser", e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vcenter-password">
                      密码 <span className="text-xs font-normal text-slate-500">留空或 *** 保留</span>
                    </Label>
                    <Input
                      id="vcenter-password"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={String(form.vcenterPassword ?? "")}
                      onChange={(e) => setField("vcenterPassword", e.target.value)}
                    />
                  </div>
                </div>
              </section>

              <aside id="vcenter-config-summary" className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">运行策略</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      控制 TLS 校验与列表缓存，日常刷新会按这里的策略执行。
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <TimerReset className="h-3.5 w-3.5" />
                      列表缓存
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        id="vcenter-cache-ttl"
                        type="number"
                        min={10}
                        className="h-9 max-w-28"
                        value={Number(form.vcenterCacheTtlSec ?? 120)}
                        onChange={(e) => setField("vcenterCacheTtlSec", Number(e.target.value))}
                      />
                      <span className="text-xs text-slate-500">秒</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">字段：vcenterCacheTtlSec</p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-slate-700">
                      <ShieldCheck className="h-4 w-4 text-slate-500" />
                      跳过 TLS 校验
                    </span>
                    <Switch
                      checked={form.vcenterInsecure !== false}
                      onCheckedChange={(v) => setField("vcenterInsecure", v)}
                    />
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <KeyRound className="h-3.5 w-3.5" />
                      凭据状态
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {String(form.vcenterPassword ?? "").trim()
                        ? String(form.vcenterPassword ?? "") === "***"
                          ? "已保存"
                          : "待保存新密码"
                        : "未填写"}
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                      {String(form.vcenterUrl ?? "").trim() || "https://vcenter.example.com/sdk"}
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </div>
          )}

          {showMonitoringSettings && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">Prometheus / VictoriaMetrics</p>
            <p className="text-xs text-gray-500">
              <code className="rounded bg-gray-100 px-1 text-[11px]">prometheusUrlVcenter</code>{" "}
              用于 vCenter 侧监控；<code className="rounded bg-gray-100 px-1 text-[11px]">prometheusUrlPve</code>{" "}
              用于 PVE / GPU / 主机 exporter；<code className="rounded bg-gray-100 px-1 text-[11px]">prometheusUrlCloud</code>{" "}
              用于公有云。若使用 VictoriaMetrics，请填写对应 vmselect 根地址。
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>prometheusUrlVcenter</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.prometheusUrlVcenter ?? "")}
                  onChange={(e) => setField("prometheusUrlVcenter", e.target.value)}
                  placeholder="https://prometheus.example.com:9090 或 http://vmselect-vc:8481"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>prometheusUrlPve（PVE GPU / 主机 exporter）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.prometheusUrlPve ?? "")}
                  onChange={(e) => setField("prometheusUrlPve", e.target.value)}
                  placeholder="留空则使用兜底 prometheusUrl"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>prometheusUrlCloud（公有云，可选）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.prometheusUrlCloud ?? "")}
                  onChange={(e) => setField("prometheusUrlCloud", e.target.value)}
                  placeholder="留空则使用 prometheusUrlVcenter 或兜底 prometheusUrl"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>vmSelectUrlVcenter（可选）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.vmSelectUrlVcenter ?? "")}
                  onChange={(e) => setField("vmSelectUrlVcenter", e.target.value)}
                  placeholder="http://vmselect-vc.example.com:8481"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>vmSelectUrlPve（可选）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.vmSelectUrlPve ?? "")}
                  onChange={(e) => setField("vmSelectUrlPve", e.target.value)}
                  placeholder="http://vmselect-pve.example.com:8481"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>vmSelectUrlCloud（可选）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.vmSelectUrlCloud ?? "")}
                  onChange={(e) => setField("vmSelectUrlCloud", e.target.value)}
                  placeholder="留空则按 vmSelectUrlVcenter / prometheusUrl 链"
                />
              </div>
            </div>
          </div>
          )}

          {showIdracSettings && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">iDRAC 目标</p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                  每行是一台宿主机带外 Redfish 入口。保存前会逐台校验账号；默认目标会同步到旧字段，兼容已有 iDRAC 功能。
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addIdracTarget}>
                <Plus className="h-4 w-4" />
                添加目标
              </Button>
            </div>
            <div className="space-y-3">
              {idracTargets.map((target, index) => (
                <div key={`${target.id}-${index}`} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        #{index + 1}
                      </span>
                      {target.default && (
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => markDefaultIdracTarget(index)}
                        disabled={target.default}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        设为默认
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => removeIdracTarget(index)}
                        disabled={idracTargets.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-12">
                    <div className="space-y-2 lg:col-span-2">
                      <Label>目标 ID</Label>
                      <Input
                        className="font-mono text-xs"
                        value={target.id}
                        onChange={(e) => updateIdracTarget(index, { id: e.target.value })}
                        placeholder="idrac-1"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-3">
                      <Label>显示名称</Label>
                      <Input
                        value={target.name}
                        onChange={(e) => updateIdracTarget(index, { name: e.target.value })}
                        placeholder="如 机柜 A / ESXi-01"
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-4">
                      <Label>iDRAC 地址</Label>
                      <Input
                        className="font-mono text-xs"
                        value={target.host}
                        onChange={(e) => updateIdracTarget(index, { host: e.target.value })}
                        placeholder="如 192.168.1.50 或 idrac-01.example.com"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-3">
                      <Label>用户名</Label>
                      <Input
                        value={target.user}
                        onChange={(e) => updateIdracTarget(index, { user: e.target.value })}
                        placeholder="如 root"
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-12">
                      <Label>密码（留空或 *** 表示保留已保存密码）</Label>
                      <Input
                        type="password"
                        value={target.password}
                        onChange={(e) => updateIdracTarget(index, { password: e.target.value })}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-slate-50 px-3 py-2 lg:col-span-12">
                      <span className="text-sm text-gray-700">跳过 TLS 证书校验（自签证书请开启）</span>
                      <Switch
                        checked={target.insecure !== false}
                        onCheckedChange={(v) => updateIdracTarget(index, { insecure: v })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              清空某行的 iDRAC 地址并保存不会写入该目标；删除最后一行会保留一个空白行，方便下次接入。
            </p>
          </div>
          )}

          {showVmLogSettings && (
          <div id="runtime-vmlog-vector-download" className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3 scroll-mt-24">
            <div>
              <p className="text-sm font-semibold text-gray-900">VMLog 与 VictoriaLogs</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                VictoriaLogs 根地址用于 VMLog 查询与诊断；Vector 下载源用于给虚拟机安装日志采集器。若下载源留空，则走内置镜像线与 GitHub。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>victoriaLogsUrl</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.victoriaLogsUrl ?? "")}
                  onChange={(e) => setField("victoriaLogsUrl", e.target.value)}
                  placeholder="如 http://victoria-logs.example.com:9428"
                />
              </div>
              <div className="space-y-2">
                <Label>victoriaLogsRetentionDays</Label>
                <Input
                  type="number"
                  min={7}
                  max={730}
                  value={Number(form.victoriaLogsRetentionDays ?? 180)}
                  onChange={(e) => setField("victoriaLogsRetentionDays", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>vmLogVectorDownloadBaseUrl（可选）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.vmLogVectorDownloadBaseUrl ?? "")}
                  onChange={(e) => setField("vmLogVectorDownloadBaseUrl", e.target.value)}
                  placeholder="如 http://10.0.0.8:8081/vector"
                />
                <p className="text-[11px] text-gray-500">
                  缓存目录中的文件名请保持官方格式，例如{" "}
                  <code className="rounded bg-white px-1">vector-0.36.1-x86_64-unknown-linux-gnu.tar.gz</code>。
                </p>
              </div>
            </div>
          </div>
          )}
          </>
          )}

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{err}</div>
          )}
          {ok && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              {ok}
            </div>
          )}

          <Button type="button" onClick={() => void onSave()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {v === "virtualMachine" ? "保存配置" : defaultSaveLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsRuntimeSection;
