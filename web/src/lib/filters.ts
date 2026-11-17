import type { Filters } from "./types";

export const FILTER_KEYS = [
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
] as const;

const NUMBER_KEYS = ["dow", "hour"] as const;

export function readFilters(params: URLSearchParams): Filters {
  const filters: Filters = {
    range: params.get("range") || "7d",
    me: params.get("me") === "1",
    bots: params.get("bots") === "1",
    engaged: params.get("engaged") === "1",
    hide_dc: params.get("hide_dc") === "1",
  };
  const from = params.get("from");
  const to = params.get("to");
  if (from) filters.from = from;
  if (to) filters.to = to;
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  for (const key of NUMBER_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) filters[key] = parsed;
    }
  }
  const q = params.get("q");
  if (q) filters.q = q;
  const tab = params.get("tab");
  if (tab && tab !== "all") filters.tab = tab;
  return filters;
}

export function toParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range && filters.range !== "7d") params.set("range", filters.range);
  if (filters.me) params.set("me", "1");
  if (filters.bots) params.set("bots", "1");
  if (filters.engaged) params.set("engaged", "1");
  if (filters.hide_dc) params.set("hide_dc", "1");
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, String(value));
  }
  for (const key of NUMBER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  if (filters.q) params.set("q", filters.q);
  if (filters.tab && filters.tab !== "all") params.set("tab", filters.tab);
  return params;
}

export function mergeFilters(filters: Filters, patch: Partial<Filters>): Filters {
  const next: Filters = { ...filters, ...patch };
  for (const key of Object.keys(patch)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined || value === "" || value === false) {
      if (key === "me" || key === "bots" || key === "engaged" || key === "hide_dc") {
        (next as unknown as Record<string, unknown>)[key] = Boolean(value);
      } else {
        delete (next as unknown as Record<string, unknown>)[key];
      }
    }
  }
  return next;
}
