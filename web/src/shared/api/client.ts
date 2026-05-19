import { ApiHttpError, type ApiHttpErrorCheck } from "./errors";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export type ApiFetchOptions = {
  signal?: AbortSignal;
};

function apiFetchCredentials(): RequestCredentials {
  const base = API_BASE.trim();
  if (base === "") return "same-origin";
  if (typeof window === "undefined") return "include";
  try {
    if (new URL(base, window.location.href).origin === window.location.origin) {
      return "same-origin";
    }
  } catch {
    /* ignore */
  }
  return "include";
}

function loginPageUrlPreservingReturn(): string {
  if (typeof window === "undefined") return "/login";
  const path = window.location.pathname + window.location.search + window.location.hash;
  if (path.startsWith("/login")) return "/login";
  return `/login?redirect=${encodeURIComponent(path)}`;
}

function maybeRedirectLogin(res: Response, path: string) {
  if (res.status !== 401) return;
  if (path.includes("/api/auth/login")) return;
  if (path.includes("/api/auth/status")) return;
  if (path.includes("/api/setup")) return;
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign(loginPageUrlPreservingReturn());
  }
}

function withSignal(init: RequestInit, opt?: ApiFetchOptions): RequestInit {
  if (!opt?.signal) return init;
  return { ...init, signal: opt.signal };
}

async function readErrorBody(
  res: Response
): Promise<{ msg: string; code?: string; hint?: string; checks?: ApiHttpErrorCheck[] }> {
  let msg = res.statusText;
  let code: string | undefined;
  let hint: string | undefined;
  let checks: ApiHttpErrorCheck[] | undefined;
  try {
    const j = (await res.json()) as {
      error?: string;
      code?: string;
      hint?: string;
      checks?: unknown;
    };
    if (j?.error) msg = j.error;
    code = j?.code;
    if (typeof j?.hint === "string" && j.hint.trim() !== "") hint = j.hint.trim();
    if (Array.isArray(j?.checks)) {
      checks = j.checks.filter(
        (x): x is ApiHttpErrorCheck =>
          x != null && typeof x === "object" && typeof (x as ApiHttpErrorCheck).message === "string"
      );
    }
  } catch {
    /* ignore */
  }
  if (res.status === 403) {
    return { msg: "权限错误", code, hint: undefined, checks: undefined };
  }
  return { msg, code, hint, checks };
}

export async function apiGetJson<T>(path: string, opt?: ApiFetchOptions): Promise<T> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal({ credentials: apiFetchCredentials() }, opt)
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  return res.json() as Promise<T>;
}

export async function apiGetText(path: string, opt?: ApiFetchOptions): Promise<string> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal({ credentials: apiFetchCredentials() }, opt)
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    if (res.status === 403) msg = "权限错误";
    throw new Error(msg);
  }
  return res.text();
}

export async function apiDelete(path: string, opt?: ApiFetchOptions): Promise<void> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "DELETE",
        credentials: apiFetchCredentials(),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
}

export async function apiDeleteJson<T = Record<string, unknown>>(
  path: string,
  opt?: ApiFetchOptions
): Promise<T> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "DELETE",
        credentials: apiFetchCredentials(),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return {} as T;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return {} as T;
  }
}

export async function apiPostJson<TRes = unknown>(
  path: string,
  body: object,
  opt?: ApiFetchOptions
): Promise<TRes> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: apiFetchCredentials(),
        body: JSON.stringify(body),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  return res.json() as Promise<TRes>;
}

export async function prometheusQueryApi(
  scope: string,
  q: string,
  opt?: ApiFetchOptions
): Promise<unknown> {
  return apiPostJson<unknown>("/api/prometheus/query", { scope, q }, opt);
}

export async function prometheusQueryRangeApi(
  scope: string,
  q: string,
  start: number | string,
  end: number | string,
  step: string,
  opt?: ApiFetchOptions
): Promise<unknown> {
  return apiPostJson<unknown>(
    "/api/prometheus/query_range",
    {
      scope,
      q,
      start: String(start),
      end: String(end),
      step,
    },
    opt
  );
}

export async function apiPutJson<TRes = unknown>(
  path: string,
  body: object,
  opt?: ApiFetchOptions
): Promise<TRes> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: apiFetchCredentials(),
        body: JSON.stringify(body),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  return res.json() as Promise<TRes>;
}

export async function apiPatchJson<TRes = unknown>(
  path: string,
  body: object,
  opt?: ApiFetchOptions
): Promise<TRes> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: apiFetchCredentials(),
        body: JSON.stringify(body),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  return res.json() as Promise<TRes>;
}

export async function apiPutRaw(
  path: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType = "application/octet-stream",
  opt?: ApiFetchOptions
): Promise<void> {
  const blob = body instanceof Blob ? body : new Blob([body as BlobPart]);
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "PUT",
        headers: { "Content-Type": contentType },
        credentials: apiFetchCredentials(),
        body: blob,
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
}

export async function apiPostNoBody(path: string, opt?: ApiFetchOptions): Promise<void> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "POST",
        credentials: apiFetchCredentials(),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
}
