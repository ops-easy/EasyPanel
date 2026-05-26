import { Route, Routes } from "react-router-dom";
import { accountRoutes } from "@/app/routes/account-routes";
import NotFound from "@/pages/NotFound";

export default function AccountRoutesIsland() {
  return (
    <Routes>
      {accountRoutes("")}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
