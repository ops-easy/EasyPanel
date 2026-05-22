import React from "react";
import { Outlet } from "react-router-dom";

/** Bastion workspace shell: the home page keeps its dark console canvas. */
const BastionLayout: React.FC = () => {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0c0f14]">
      <Outlet />
    </div>
  );
};

export default BastionLayout;
