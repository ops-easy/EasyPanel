import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { ApiHttpError, apiGetJson, apiPostJson } from "@/lib/api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/lib/utils";

type SQLResult = {
  readOnly: boolean;
  columns?: string[];
  rows?: Record<string, unknown>[];
  truncated?: boolean;
  rowsAffected?: number;
  lastInsertId?: number;
};

export type MySQLSqlConsoleSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: number;
  instanceName?: string;
};

function errMsg(err: unknown): string {
  if (err instanceof ApiHttpError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function cellText(v: unknown): string {
  if (v == null) return "NULL";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function SQLResultTable({ result }: { result: SQLResult }) {
  const rows = useMemo(() => result.rows ?? [], [result.rows]);
  const columns = useMemo(() => {
    if (result.columns?.length) return result.columns;
    const s = new Set<string>();
    for (const row of rows) {
      Object.keys(row).forEach((k) => s.add(k));
    }
    return Array.from(s);
  }, [result.columns, rows]);

  if (!result.readOnly) {
    return (
      <div className="rounded border border-emerald-900/50 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100">
        影响行数 {result.rowsAffected ?? 0}，LastInsertId {result.lastInsertId ?? 0}
      </div>
    );
  }

  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className="rounded border border-slate-800 bg-[#111820] px-3 py-6 text-center text-sm text-slate-500">
        无结果
      </div>
    );
  }

  return (
    <div className="max-h-[min(42vh,420px)] overflow-auto rounded border border-slate-800 bg-[#0b1016]">
      <Table>
        <TableHeader className="sticky top-0 bg-[#111820]">
          <TableRow className="border-slate-800 hover:bg-[#111820]">
            {columns.map((col) => (
              <TableHead key={col} className="whitespace-nowrap font-mono text-xs text-slate-300">
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={idx} className="border-slate-800 hover:bg-[#151f2a]">
              {columns.map((col) => (
                <TableCell key={col} className="max-w-[280px] truncate font-mono text-xs text-slate-200">
                  {cellText(row[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const MySQLSqlConsoleSheet: React.FC<MySQLSqlConsoleSheetProps> = ({
  open,
  onOpenChange,
  instanceId,
  instanceName,
}) => {
  const [sql, setSql] = useState("show databases");
  const [schema, setSchema] = useState("");
  const [confirmMutation, setConfirmMutation] = useState(false);
  const [result, setResult] = useState<SQLResult | null>(null);

  const schemasQ = useQuery({
    queryKey: ["bastion-sidebar-mysql-schemas", instanceId],
    queryFn: ({ signal }) =>
      apiGetJson<{ schemas: string[] }>(`/api/app-center/mysql/instances/${instanceId}/schemas`, { signal }),
    enabled: open && instanceId > 0,
    retry: false,
  });

  const queryM = useMutation({
    mutationFn: () =>
      apiPostJson<SQLResult>(`/api/app-center/mysql/instances/${instanceId}/query`, {
        sql,
        schema,
        limit: 300,
        confirmMutation,
      }),
    onSuccess: (res) => setResult(res),
    onError: (err) => toast.error(errMsg(err)),
  });

  const schemas = schemasQ.data?.schemas ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="!flex !max-h-[min(92vh,880px)] w-[min(96vw,980px)] !max-w-[min(96vw,980px)] flex-col gap-0 overflow-hidden border-slate-800 bg-[#0f1419] p-0 text-slate-100 sm:!max-w-[min(96vw,980px)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-800 bg-[#111820] px-4 py-3 text-left">
          <DialogTitle className="text-base font-semibold text-slate-100">MySQL SQL 控制台</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {instanceName || `MySQL #${instanceId}`} · 实例 #{instanceId}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 overflow-auto px-4 py-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">SQL</Label>
              <Textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                className="min-h-[180px] resize-y border-slate-700 bg-[#080a0e] font-mono text-xs text-slate-100"
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Schema</Label>
                <Input
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                  className="border-slate-700 bg-[#080a0e] font-mono text-xs text-slate-100"
                />
              </div>
              <div className="max-h-[116px] overflow-auto rounded border border-slate-800 bg-[#0b1016] p-1">
                {schemasQ.isLoading ? (
                  <p className="px-2 py-1.5 text-xs text-slate-500">加载中...</p>
                ) : schemas.length > 0 ? (
                  schemas.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSchema(s)}
                      className={cn(
                        "block w-full truncate rounded px-2 py-1 text-left font-mono text-xs text-slate-300 hover:bg-slate-800",
                        schema === s && "bg-slate-800 text-sky-200",
                      )}
                    >
                      {s}
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-1.5 text-xs text-slate-500">暂无 Schema</p>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <Checkbox checked={confirmMutation} onCheckedChange={(v) => setConfirmMutation(v === true)} />
                允许写操作
              </label>
              <Button
                type="button"
                className="w-full gap-2 bg-sky-600 hover:bg-sky-700"
                disabled={instanceId <= 0 || queryM.isPending || !sql.trim()}
                onClick={() => queryM.mutate()}
              >
                {queryM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                执行
              </Button>
            </div>
          </div>

          {result ? <SQLResultTable result={result} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MySQLSqlConsoleSheet;
