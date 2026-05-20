import React from "react";
import { Outlet } from "react-router-dom";
import ComputeSubNav from "./ComputeSubNav";

const ComputeLayout: React.FC = () => (
  <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-4">
    <ComputeSubNav />
    <Outlet />
  </div>
);

export default ComputeLayout;
