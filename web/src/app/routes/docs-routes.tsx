import { lazy, type ReactNode } from "react";
import { Navigate, Route, useParams } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import DocsMedia from "@/features/docs/pages/DocsMedia";

const MdEditorPage = lazy(() => import("@/md-editor/EditorContainer"));

function DocsLegacyEditRedirect() {
  const { docId } = useParams();
  const id = docId?.trim();
  if (!id || !/^\d+$/.test(id)) return <Navigate to="/docs" replace />;
  return <Navigate to={`/docs/doc/${id}`} replace />;
}

function DocsEditorLazy() {
  return (
    <RouteSuspense>
      <MdEditorPage />
    </RouteSuspense>
  );
}

export function docsRoutes(): ReactNode {
  return (
    <>
      <Route path="docs/media" element={<DocsMedia />} />
      <Route path="docs/new" element={<Navigate to="/docs" replace />} />
      <Route path="docs/:docId/edit" element={<DocsLegacyEditRedirect />} />
      <Route path="docs/doc/:docId" element={<DocsEditorLazy />} />
      <Route path="docs" element={<DocsEditorLazy />} />
    </>
  );
}
