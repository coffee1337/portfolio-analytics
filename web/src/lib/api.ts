import type {
  CleanupPreview,
  Filters,
  IgnoredItem,
  MeInfo,
  Overview,
  SessionDetail,
  VisitorDetail,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  if (response.status === 401) {
    const error = new Error("unauthorized") as Error & { code?: number };
    error.code = 401;
    throw error;
  }
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* non-json */
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function queryString(filters: Filters, extra: Record<string, string | number> = {}): string {
  const params = new URLSearchParams();
  params.set("range", filters.range);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.me) params.set("me", "1");
  if (filters.bots) params.set("bots", "1");
  if (filters.engaged) params.set("engaged", "1");
  if (filters.hide_dc) params.set("hide_dc", "1");
  if (filters.dow !== undefined && filters.dow !== null) params.set("dow", String(filters.dow));
  if (filters.hour !== undefined && filters.hour !== null) params.set("hour", String(filters.hour));
  if (filters.q) params.set("q", filters.q);
  if (filters.tab && filters.tab !== "all") params.set("tab", filters.tab);
  for (const key of [
    "source",
    "utm",
    "country",
    "city",
    "isp",
    "device",
    "os",
    "browser",
    "path",
    "entry",
    "screen",
    "lang",
    "project",
    "goal",
  ] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
  return params.toString();
}

export const api = {
  me: () => request<MeInfo>("/api/me"),
  login: (token: string) =>
    request<{ ok: boolean }>("/api/login", { method: "POST", body: JSON.stringify({ token }) }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
  overview: (filters: Filters, page = 1, perPage = 30) =>
    request<Overview>(`/api/overview?${queryString(filters, { page, per_page: perPage })}`),
  session: (sid: string) => request<SessionDetail>(`/api/session/${encodeURIComponent(sid)}`),
  deleteSession: (sid: string) =>
    request<{ deleted: number }>(`/api/session/${encodeURIComponent(sid)}`, { method: "DELETE" }),
  visitor: (vid: string) => request<VisitorDetail>(`/api/visitor/${encodeURIComponent(vid)}`),
  deleteVisitor: (vid: string) =>
    request<{ deleted: number }>(`/api/visitor/${encodeURIComponent(vid)}`, { method: "DELETE" }),
  ignoreSession: (sid: string, label: string) =>
    request<{ updated: number }>("/api/ignore", {
      method: "POST",
      body: JSON.stringify({ sid, label }),
    }),
  ignoreValue: (kind: string, value: string, label: string) =>
    request<{ updated: number }>("/api/ignore", {
      method: "POST",
      body: JSON.stringify({ kind, value, label }),
    }),
  ignored: () => request<{ items: IgnoredItem[] }>("/api/ignore"),
  removeIgnore: (id: number) => request<{ ok: boolean }>(`/api/ignore/${id}`, { method: "DELETE" }),
  cleanupPreview: () => request<CleanupPreview>("/api/cleanup/preview"),
  cleanup: (scope: string, confirm = "") =>
    request<{ deleted: number; preview: CleanupPreview }>("/api/cleanup", {
      method: "POST",
      body: JSON.stringify({ scope, confirm }),
    }),
  ignoreSelf: (visitor?: string) =>
    request<{ updated: number; ip_masked: string }>("/api/ignore/self", {
      method: "POST",
      body: JSON.stringify({ visitor: visitor || undefined }),
    }),
  exportUrl: (kind: "sessions.csv" | "events.json", filters: Filters) =>
    `/api/export/${kind}?${queryString(filters)}`,
};
