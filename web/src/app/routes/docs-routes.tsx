import { lazy, type ReactNode } from "react";
import { Navigate, Route, useParams } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";

const DocsMedia = lazy(() => import("@/features/docs/pages/DocsMedia"));
const MdEditorPage = lazy(() => import("@/md-editor/EditorContainer"));

function LazyRoute({ children }: { children: ReactNode }) {
  return <RouteSuspense>{children}</RouteSuspense>;
}

function DocsLegacyEditRedirect() {
  const { docId } = useParams();
  const id = docId?.trim();
  if (!id || !/^\d+$/.test(id)) return <Navigate to="/docs" replace />;
  return <Navigate to={`/docs/doc/${id}`} replace />;
}

function DocsEditorLazy() {
  return (
    <LazyRoute>
      <MdEditorPage />
    </LazyRoute>
  );
}

function withBase(basePath: string, path = ""): string {
  if (!basePath) return path;
  return path ? `${basePath}/${path}` : basePath;
}

export function docsRoutes(basePath = "docs"): ReactNode {
  return (
    <>
      <Route
        path={withBase(basePath, "media")}
        element={
          <LazyRoute>
            <DocsMedia />
          </LazyRoute>
        }
      />
      <Route path={withBase(basePath, "guides")} element={<DocsEditorLazy />} />
      <Route path={withBase(basePath, "guides/doc/:docId")} element={<DocsEditorLazy />} />
      <Route path={withBase(basePath, "new")} element={<Navigate to="/docs" replace />} />
      <Route path={withBase(basePath, ":docId/edit")} element={<DocsLegacyEditRedirect />} />
      <Route path={withBase(basePath, "doc/:docId")} element={<DocsEditorLazy />} />
      <Route path={withBase(basePath)} element={<DocsEditorLazy />} />
    </>
  );
}
