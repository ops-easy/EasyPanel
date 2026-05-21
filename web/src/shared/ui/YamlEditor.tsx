import React, { lazy, Suspense } from "react";
import type { YamlEditorProps } from "./YamlEditorPane";

const YamlEditorPane = lazy(() =>
  import("./YamlEditorPane").then((m) => ({ default: m.YamlEditorPane }))
);

export type { YamlEditorProps } from "./YamlEditorPane";

export function YamlEditor({ height = "min(65vh, 520px)", ...props }: YamlEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          className="rounded-lg border border-slate-200 bg-slate-50"
          style={{ height }}
          aria-label="正在加载 YAML 编辑器"
        />
      }
    >
      <YamlEditorPane {...props} height={height} />
    </Suspense>
  );
}
