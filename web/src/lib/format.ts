const MSK = "Europe/Moscow";

export function fmtNum(value: number | undefined | null, lang = "ru"): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US").format(n);
}

export function fmtPct(value: number | undefined | null, digits = 0): string {
  const n = Number(value ?? 0);
  return `${n.toFixed(digits)}%`;
}

export function fmtDelta(value: number | null | undefined): { text: string; tone: "ok" | "dim" | "danger" } {
  if (value === null || value === undefined || Number.isNaN(value)) return { text: "—", tone: "dim" };
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  const tone = rounded > 0 ? "ok" : rounded < 0 ? "danger" : "dim";
  return { text: `${sign}${rounded}%`, tone };
}

export function fmtDuration(seconds: number | undefined | null, lang = "ru"): string {
  const total = Math.max(0, Math.round(Number(seconds ?? 0)));
  const units = lang === "ru" ? { s: "с", m: "м", h: "ч" } : { s: "s", m: "m", h: "h" };
  if (total < 60) return `${total}${units.s}`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return rest ? `${minutes}${units.m} ${rest}${units.s}` : `${minutes}${units.m}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}${units.h} ${minutes % 60}${units.m}`;
}

export function fmtClock(iso: string): string {
  if (!iso) return "--:--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MSK,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function fmtDateTime(iso: string, lang = "ru"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    timeZone: MSK,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function fmtDate(iso: string, lang = "ru"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    timeZone: MSK,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function flag(code: string | undefined): string {
  const value = (code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return "";
  return String.fromCodePoint(...[...value].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function countryName(code: string | undefined, lang: string): string {
  const value = (code || "").toUpperCase();
  if (!value) return lang === "ru" ? "неизвестно" : "unknown";
  try {
    const names = new Intl.DisplayNames([lang === "ru" ? "ru" : "en"], { type: "region" });
    return names.of(value) || value;
  } catch {
    return value;
  }
}

export function fmtGap(seconds: number, lang = "ru"): string {
  if (!seconds) return "";
  const units = lang === "ru" ? { s: "с", m: "м", h: "ч" } : { s: "s", m: "m", h: "h" };
  if (seconds < 60) return `+${seconds}${units.s}`;
  if (seconds < 3600) return `+${Math.round(seconds / 60)}${units.m}`;
  return `+${(seconds / 3600).toFixed(1)}${units.h}`;
}

export function shortPath(path: string): string {
  if (!path) return "/";
  return path.length > 32 ? `${path.slice(0, 29)}…` : path;
}
