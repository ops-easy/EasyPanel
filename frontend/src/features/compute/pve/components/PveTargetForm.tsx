import type React from "react";
import { Loader2, Save } from "lucide-react";
import { ConfirmActionButton } from "@/shared/ui/confirm-action-button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";

export type PVETarget = {
  id: string;
  name: string;
  baseUrl: string;
  authMethod?: string;
  username?: string;
  realm?: string;
  passwordSet?: boolean;
  passwordPreview?: string;
  tokenId?: string;
  tokenSecretSet?: boolean;
  tokenSecretPreview?: string;
  skipTls?: boolean;
  prometheusJob?: string;
  updatedAt?: string;
};

export type PveTargetFormState = {
  name: string;
  baseUrl: string;
  authMethod: "password";
  username: string;
  password: string;
  prometheusJob: string;
  skipTls: boolean;
};

export const defaultPveTargetForm: PveTargetFormState = {
  name: "PVE",
  baseUrl: "",
  authMethod: "password",
  username: "root",
  password: "",
  prometheusJob: "",
  skipTls: true,
};

export function pveTargetFormFromTarget(target?: PVETarget): PveTargetFormState {
  if (!target) return { ...defaultPveTargetForm };
  return {
    name: target.name || "PVE",
    baseUrl: target.baseUrl || "",
    authMethod: "password",
    username: target.username || "root",
    password: target.passwordSet ? "***" : "",
    prometheusJob: target.prometheusJob || "",
    skipTls: target.skipTls !== false,
  };
}

type PveTargetFormProps = {
  form: PveTargetFormState;
  setForm: React.Dispatch<React.SetStateAction<PveTargetFormState>>;
  canWrite: boolean;
  pending: boolean;
  onSubmit: () => void;
  embedded?: boolean;
  title?: string;
  submitLabel?: string;
};

const PveTargetForm: React.FC<PveTargetFormProps> = ({
  form,
  setForm,
  canWrite,
  pending,
  onSubmit,
  embedded = false,
  title = "连接参数",
  submitLabel = "保存 PVE 目标",
}) => {
  return (
    <section className={embedded ? "rounded-xl border border-slate-200 bg-slate-50/60 p-4" : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">更新 Proxmox VE API 地址、账号凭据与监控 job。</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-2">
          <Label>显示名称</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5 lg:col-span-4">
          <Label>API 地址</Label>
          <Input className="font-mono text-sm" placeholder="https://pve.example.com:8006" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label>用户名</Label>
          <Input className="font-mono text-sm" placeholder="root" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label>密码</Label>
          <Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Prometheus job（可选）</Label>
          <Input value={form.prometheusJob} onChange={(e) => setForm({ ...form, prometheusJob: e.target.value })} />
        </div>
        <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm lg:col-span-9">
          <span className="text-slate-700">跳过 TLS 校验</span>
          <Switch checked={form.skipTls} onCheckedChange={(v) => setForm({ ...form, skipTls: v })} />
        </label>
        <ConfirmActionButton
          type="button"
          className="h-10 w-full gap-2 lg:col-span-3"
          disabled={!canWrite || pending}
          title="确认保存 PVE 目标？"
          description="将写入 Proxmox VE API 地址、账号凭据与监控 job 配置，后续算力资源会按此目标纳管。"
          confirmLabel="保存"
          onConfirm={onSubmit}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {submitLabel}
        </ConfirmActionButton>
      </div>
    </section>
  );
};

export default PveTargetForm;
