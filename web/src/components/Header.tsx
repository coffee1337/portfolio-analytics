import { useState } from "react";
import type { MouseEvent } from "react";

import { useI18n } from "../i18n";
import { fmtNum, flag } from "../lib/format";
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

  const applyDates = () => {
    if (!from || !to) return;
    onFilters({ from, to, range: "custom" });
    setOpenDates(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line" style={{ background: "var(--header)", backdropFilter: "blur(14px)" }}>
      <div className="dot-grid">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-3 py-2 md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span style={{ color: "var(--accent)" }}>●</span>
              <span className="font-mono text-[12px] tracking-tight">coffee1337</span>
              <span className="font-mono text-[12px] text-ink-faint">/ analytics</span>
              <a
                href="https://coffee1337.github.io"
                target="_blank"
                rel="noreferrer"
                className="mono hidden text-[11px] text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-accent sm:inline"
              >
                ↗ {t("app.site")}
              </a>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" className="btn px-2.5 py-1" onClick={() => setLang(lang === "ru" ? "en" : "ru")} aria-label="language">
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

          <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-2">
            <div className="no-scrollbar flex shrink-0 flex-wrap items-center gap-1.5 md:flex-nowrap md:overflow-x-auto md:pb-0.5">
              <span className="flex items-center gap-1.5 pr-1">
                <span className={`status-dot${meta && meta.live > 0 ? "" : " status-dot--idle"}`} />
                <span className="mono text-[11.5px] text-ink-dim">
                  {meta ? meta.live : 0} {t("header.live")} · {fmtNum(meta?.events_5min ?? 0)} {t("header.events")}
                </span>
              </span>

              <span className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} />

              {PERIODS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="pill pill--sm shrink-0"
                  data-active={filters.range === key && !openDates ? "true" : undefined}
                  onClick={() => {
                    setOpenDates(false);
                    onFilters({ range: key, from: undefined, to: undefined });
                  }}
                >
                  {t(`period.${key}`)}
                </button>
              ))}

              <div className="relative shrink-0">
                <button
                  type="button"
                  className="pill pill--sm"
                  data-active={openDates || filters.range === "custom" ? "true" : undefined}
                  onClick={() => setOpenDates((value) => !value)}
                >
                  📅 {t("period.custom")}
                </button>
                {openDates ? (
                  <div className="absolute left-0 top-8 z-50 w-[240px] border border-line bg-bg p-3 shadow-xl">
                    <label className="kicker mb-1 block">{t("period.from")}</label>
                    <input
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      className="mono mb-2 w-full border border-line bg-bg-2 px-2 py-1 text-[11px]"
                    />
                    <label className="kicker mb-1 block">{t("period.to")}</label>
                    <input
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      className="mono mb-3 w-full border border-line bg-bg-2 px-2 py-1 text-[11px]"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn px-2 py-1" onClick={() => setOpenDates(false)}>
                        {t("app.cancel")}
                      </button>
                      <button type="button" className="btn btn--accent px-2 py-1" onClick={applyDates}>
                        {t("period.apply")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="no-scrollbar flex shrink-0 flex-wrap items-center gap-1.5 md:flex-nowrap md:overflow-x-auto md:pb-0.5">
              <span className="mono hidden items-center gap-1 text-[11.5px] text-ink-faint md:flex">
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

              <span className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} />

              <button
                type="button"
                className="pill pill--sm"
                data-active={filters.me ? "true" : undefined}
                onClick={() => onFilters({ me: !filters.me })}
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
                onClick={() => onFilters({ bots: !filters.bots })}
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
                onClick={onMarkIp}
                title={t("data.markIp")}
              >
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
    </header>
  );
}

export function ActiveFilters({ filters, onPatch, onClear }: { filters: Filters; onPatch: (patch: Partial<Filters>) => void; onClear: () => void }) {
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
  push("project", filters.project);
  push("goal", filters.goal, (value) => t(`goal.${value}`));
  if (filters.engaged) entries.push({ key: "engaged", label: t("filters.engaged"), value: "" });

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
          onClick={() => onPatch({ [entry.key]: entry.key === "engaged" ? false : undefined } as Partial<Filters>)}
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
