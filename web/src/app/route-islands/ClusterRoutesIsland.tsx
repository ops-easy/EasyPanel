import { Route, Routes } from "react-router-dom";
import { clusterRoutes } from "@/app/routes/cluster-routes";
import NotFound from "@/pages/NotFound";

export default function ClusterRoutesIsland() {
  return (
    <Routes>
      {clusterRoutes("")}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
