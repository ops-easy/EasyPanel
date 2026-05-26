import React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { APP_CENTER_NAV_ITEMS, isAppCenterNavItemActive } from "./appCenterNavigation";

const AppCenterSubNav: React.FC = () => {
  const loc = useLocation();
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5">
      {APP_CENTER_NAV_ITEMS.map((item) => {
        const active = isAppCenterNavItemActive(loc.pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            to={item.to}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
};

export default AppCenterSubNav;
