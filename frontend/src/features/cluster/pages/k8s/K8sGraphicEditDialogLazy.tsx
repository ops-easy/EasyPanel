import React, { lazy, Suspense } from "react";
import type { K8sGraphicEditDialogProps } from "./K8sGraphicEditDialog.types";

const K8sGraphicEditDialogImpl = lazy(() =>
  import("./K8sGraphicEditDialog").then((m) => ({ default: m.K8sGraphicEditDialog }))
);

export function K8sGraphicEditDialogLazy(props: K8sGraphicEditDialogProps) {
  if (!props.open) return null;
  return (
    <Suspense fallback={null}>
      <K8sGraphicEditDialogImpl {...props} />
    </Suspense>
  );
}
