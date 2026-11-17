import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";

import { useI18n } from "../i18n";
import { mergeFilters, toParams } from "../lib/filters";
import { fmtNum, flag } from "../lib/format";
import { navigate } from "../lib/hooks";
import type { Filters, Overview } from "../lib/types";

const PERIODS = ["today", "yesterday", "7d", "30d", "90d", "all"] as const;

export function Header({
  meta,
  filters,
  onFilters,
  auto,
  onAuto,
  onRefresh,
  refreshing,
  onData,
  onMarkIp,
  onLogout,
  theme,
  onTheme,
}: {
  meta: Overview["meta"] | null;
  filters: Filters;
  onFilters: (patch: Partial<Filters>) => void;
  auto: number;
  onAuto: (value: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onData: () => void;
  onMarkIp: () => void;
  onLogout: () => void;
  theme: "dark" | "light";
  onTheme: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t, lang, setLang } = useI18n();
  const [openDates, setOpenDates] = useState(false);
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const onDetail = typeof window !== "undefined" && window.location.pathname !== "/";

  useEffect(() => {
    setFrom(filters.from ?? "");
    setTo(filters.to ?? "");
  }, [filters.from, filters.to]);

  useEffect(() => {
    if (!openDates) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 260;
      setCoords({
        top: Math.round(rect.bottom + 6),
        left: Math.round(Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)),
      });
    }
  }, [openDates]);

  useEffect(() => {
    if (!openDates) return;
    const onDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpenDates(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDates(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openDates]);

  /** On /session and /visitor every control must bring the user back to the overview. */
  const apply = (patch: Partial<Filters>) => {
    if (onDetail) {
      const next = mergeFilters(filters, patch);
      navigate(`/?${toParams(next).toString()}`);
      return;
    }
    onFilters(patch);
  };

  const goHome = () => {
    if (onDetail) navigate(`/${window.location.search}`);
  };

  const calendar =
    openDates && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className="fixed z-[80] w-[260px] border border-line bg-bg p-3 shadow-2xl"
            style={{ top: coords.top, left: coords.left }}
          >
            <label className="kicker mb-1 block">{t("period.from")}</label>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mono mb-2 w-full border border-line bg-bg-2 px-2 py-1.5 text-[12.5px]"
            />
            <label className="kicker mb-1 block">{t("period.to")}</label>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mono mb-3 w-full border border-line bg-bg-2 px-2 py-1.5 text-[12.5px]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn px-3 py-1.5" onClick={() => setOpenDates(false)}>
                {t("app.cancel")}
              </button>
              <button
                type="button"
                className="btn btn--accent px-3 py-1.5"
                onClick={() => {
                  if (!from || !to) return;
                  apply({ from, to, range: "custom" });
                  setOpenDates(false);
                }}
              >
                {t("period.apply")}
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <header
      className="sticky top-0 z-40 border-b border-line"
      style={{ background: "var(--header)", backdropFilter: "blur(14px)" }}
    >
      <div className="dot-grid">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-3 py-2 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={goHome}
              className="flex min-w-0 items-center gap-2 text-left"
              title={onDetail ? t("detail.back") : t("app.title")}
            >
              <span style={{ color: "var(--accent)" }}>●</span>
              <span className="font-mono text-[13px] tracking-tight">coffee1337</span>
              <span className="font-mono text-[13px] text-ink-faint">/ analytics</span>
            </button>

            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href="https://coffee1337.github.io"
                target="_blank"
                rel="noreferrer"
                className="mono hidden text-[12px] text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-accent sm:inline"
              >
                ↗ {t("app.site")}
              </a>
              <button
                type="button"
                className="btn px-2.5 py-1"
                onClick={() => setLang(lang === "ru" ? "en" : "ru")}
                aria-label="language"
              >
                {lang === "ru" ? "RU" : "EN"}
              </button>
              <button type="button" className="btn px-2.5 py-1" onClick={onTheme} aria-label={t("header.theme")}>
                {theme === "dark" ? "☼" : "☾"}
              </button>
              <button type="button" className="btn hidden px-2.5 py-1 md:inline-flex" onClick={onLogout}>
                {t("header.logout")}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="no-scrollbar flex shrink-0 flex-wrap items-center gap-1.5 md:flex-nowrap md:overflow-x-auto md:pb-0.5">
              <span className="flex items-center gap-1.5 pr-1">
                <span className={`status-dot${meta && meta.live > 0 ? "" : " status-dot--idle"}`} />
                <span className="mono text-[12px] text-ink-dim">
                  {meta ? meta.live : 0} {t("header.live")} · {fmtNum(meta?.events_5min ?? 0)} {t("header.events")}
                </span>
              </span>

              <span className="mx-1 hidden h-4 w-px md:block" style={{ background: "var(--line)" }} />

              {PERIODS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="pill pill--sm shrink-0"
                  data-active={filters.range === key && !openDates ? "true" : undefined}
                  onClick={() => {
                    setOpenDates(false);
                    apply({ range: key, from: undefined, to: undefined });
                  }}
                >
                  {t(`period.${key}`)}
                </button>
              ))}

              <div className="shrink-0">
                <button
                  ref={buttonRef}
                  type="button"
                  className="pill pill--sm"
                  data-active={openDates || filters.range === "custom" ? "true" : undefined}
                  onClick={() => setOpenDates((value) => !value)}
                >
                  📅 {t("period.custom")}
                </button>
              </div>
            </div>

            <div className="no-scrollbar flex shrink-0 flex-wrap items-center gap-1.5 md:flex-nowrap md:overflow-x-auto md:pb-0.5">
              <span className="mono hidden items-center gap-1 text-[12px] text-ink-faint md:flex">
                {t("header.auto")}:
              </span>
              {[0, 15, 30].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="pill pill--sm"
                  data-active={auto === value ? "true" : undefined}
                  onClick={() => onAuto(value)}
                >
                  {value === 0 ? t("header.off") : `${value}s`}
                </button>
              ))}
              <button
                type="button"
                className="pill pill--sm"
                onClick={onRefresh}
                title={t("header.refresh")}
                style={refreshing ? { color: "var(--accent)" } : undefined}
              >
                ↻
              </button>

              <span className="mx-1 hidden h-4 w-px md:block" style={{ background: "var(--line)" }} />

              <button
                type="button"
                className="pill pill--sm"
                data-active={filters.me ? "true" : undefined}
                onClick={() => apply({ me: !filters.me })}
                title={t("header.me.hidden")}
              >
                <span className="md:hidden">ME{meta?.me_hidden ? ` ${meta.me_hidden}` : ""}</span>
                <span className="hidden md:inline">
                  {filters.me ? t("header.me.shown") : t("header.me.hidden")}
                  {meta?.me_hidden ? ` (${meta.me_hidden})` : ""}
                </span>
              </button>
              <button
                type="button"
                className="pill pill--sm"
                data-active={filters.bots ? "true" : undefined}
                onClick={() => apply({ bots: !filters.bots })}
              >
                <span className="md:hidden">BOT{meta?.bots_hidden ? ` ${meta.bots_hidden}` : ""}</span>
                <span className="hidden md:inline">
                  {filters.bots ? t("header.bots.shown") : t("header.bots.hidden")}
                  {meta?.bots_hidden ? ` (${meta.bots_hidden})` : ""}
                </span>
              </button>
              <button
                type="button"
                className="pill pill--sm"
                data-active={filters.hide_dc ? "true" : undefined}
                onClick={() => apply({ hide_dc: !filters.hide_dc })}
                title={t("filters.hide_dc")}
              >
                <span className="md:hidden">DC{meta?.dc_hidden ? ` ${meta.dc_hidden}` : ""}</span>
                <span className="hidden md:inline">
                  {filters.hide_dc ? t("header.hide_dc") : t("header.show_dc")}
                  {meta?.dc_hidden ? ` (${meta.dc_hidden})` : ""}
                </span>
              </button>
              <button type="button" className="pill pill--sm" onClick={onMarkIp} title={t("data.markIp")}>
                ◎ <span className="hidden xl:inline">{t("data.markIp")}</span>
                <span className="xl:hidden">IP</span>
              </button>
              <button type="button" className="pill pill--sm" onClick={onData}>
                ⛁ <span className="hidden sm:inline">{t("header.data")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {calendar}
    </header>
  );
}

export function ActiveFilters({
  filters,
  onPatch,
  onClear,
}: {
  filters: Filters;
  onPatch: (patch: Partial<Filters>) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const entries: { key: keyof Filters; label: string; value: string }[] = [];
  const push = (key: keyof Filters, value: string | undefined, render?: (value: string) => string) => {
    if (!value) return;
    entries.push({ key, label: t(`filters.${String(key)}`), value: render ? render(value) : value });
  };
  push("source", filters.source);
  push("utm", filters.utm);
  push("country", filters.country, (value) => `${flag(value)} ${value}`.trim());
  push("city", filters.city);
  push("isp", filters.isp);
  push("device", filters.device, (value) => t(`audience.device.${value}`));
  push("os", filters.os);
  push("browser", filters.browser);
  push("path", filters.path);
  push("entry", filters.entry);
  push("screen", filters.screen);
  push("lang", filters.lang);
  push("project", filters.project);
  push("goal", filters.goal, (value) => t(`goal.${value}`));
  push("q", filters.q);
  if (filters.engaged) entries.push({ key: "engaged", label: t("filters.engaged"), value: "" });
  if (filters.hide_dc) entries.push({ key: "hide_dc", label: t("filters.hide_dc"), value: "" });
  if (filters.dow !== undefined || filters.hour !== undefined) {
    const day = filters.dow !== undefined ? t(`chart.wd.${filters.dow}`) : "—";
    const hour = filters.hour !== undefined ? `${String(filters.hour).padStart(2, "0")}:00` : "—";
    entries.push({ key: "dow", label: t("filters.slot"), value: `${day} ${hour}` });
  }

  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="kicker">{t("filters.title")}:</span>
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className="pill pill--sm"
          data-tone="accent"
          onClick={() =>
            onPatch(
              entry.key === "dow"
                ? { dow: undefined, hour: undefined }
                : ({ [entry.key]: entry.key === "engaged" || entry.key === "hide_dc" ? false : undefined } as Partial<Filters>),
            )
          }
        >
          {entry.label}
          {entry.value ? `: ${entry.value}` : ""} ×
        </button>
      ))}
      <button type="button" className="pill pill--sm" onClick={onClear}>
        {t("filters.reset")}
      </button>
    </div>
  );
}
