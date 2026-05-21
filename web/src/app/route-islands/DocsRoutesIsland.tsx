import { Route, Routes } from "react-router-dom";
import { docsRoutes } from "@/app/routes/docs-routes";
import NotFound from "@/pages/NotFound";

export default function DocsRoutesIsland() {
  return (
    <Routes>
      {docsRoutes("")}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
