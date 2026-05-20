import React from "react";
import { Outlet } from "react-router-dom";
import NetworkSubNav from "./NetworkSubNav";

const NetworkLayout: React.FC = () => (
  <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-4">
    <NetworkSubNav />
    <Outlet />
  </div>
);

export default NetworkLayout;
