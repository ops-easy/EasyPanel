import type React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ClusterRowAction = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  variant?: "default" | "destructive";
  onSelect: () => void;
};

export type ClusterRowActionsMenuProps = {
  actions: Array<ClusterRowAction | false | null | undefined>;
  label?: string;
  className?: string;
  contentClassName?: string;
};

export function ClusterRowActionsMenu({
  actions,
  label = "更多",
  className,
  contentClassName,
}: ClusterRowActionsMenuProps) {
  const items = actions.filter(Boolean) as ClusterRowAction[];

  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 shrink-0 gap-1 whitespace-nowrap border-slate-200 px-2.5 text-xs text-slate-800",
            className
          )}
          title="更多操作"
          aria-label="更多操作"
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn("w-36", contentClassName)}>
        {items.map((action) => (
          <DropdownMenuItem
            key={action.key}
            disabled={action.disabled}
            variant={action.variant}
            className={cn("text-xs", action.variant === "destructive" && "text-red-600")}
            onSelect={() => action.onSelect()}
          >
            {action.icon}
            <span>{action.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
