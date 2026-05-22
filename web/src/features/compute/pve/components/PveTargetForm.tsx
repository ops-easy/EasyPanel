import type React from "react";
import { Loader2, PlugZap } from "lucide-react";
import { Button } from "@/shared/ui/button";
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
  title = "新增 PVE 目标",
  submitLabel = "保存目标",
}) => {
  return (
    <section className={embedded ? "rounded-lg border border-amber-100 bg-amber-50/40 p-4" : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label>显示名称</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>API 地址</Label>
          <Input className="font-mono text-sm" placeholder="https://pve.example.com:8006" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>用户名</Label>
          <Input className="font-mono text-sm" placeholder="root" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>密码</Label>
          <Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Prometheus job（可选）</Label>
          <Input value={form.prometheusJob} onChange={(e) => setForm({ ...form, prometheusJob: e.target.value })} />
        </div>
        <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span className="text-slate-700">跳过 TLS 校验</span>
          <Switch checked={form.skipTls} onCheckedChange={(v) => setForm({ ...form, skipTls: v })} />
        </label>
        <Button className="w-full gap-2 bg-amber-600 hover:bg-amber-700" disabled={!canWrite || pending} onClick={onSubmit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
    </section>
  );
};

export default PveTargetForm;
