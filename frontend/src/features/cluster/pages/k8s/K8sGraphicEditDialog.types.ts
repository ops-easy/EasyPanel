export type K8sGraphicKind =
  | "Deployment"
  | "StatefulSet"
  | "DaemonSet"
  | "Service"
  | "ConfigMap"
  | "Secret";

export type K8sGraphicEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: K8sGraphicKind;
  namespace: string;
  name: string;
  onSuccess: () => void;
  serviceMode?: "edit" | "create";
};
