import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";
import { flag, fmtClock, fmtDate, fmtDuration, fmtNum, shortPath } from "../lib/format";
import type { Filters, SessionItem } from "../lib/types";
import { BrowserIcon, DeviceIcon, GoalIcon, OsIcon, SourceIcon } from "./Icons";
import { Badge, Empty, SectionHead } from "./ui";

type Tab = "all" | "engaged" | "goals" | "live" | "bounce";

function Badges({ item }: { item: SessionItem }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {item.live ? <Badge tone="ok">{t("sessions.live")}</Badge> : null}
      {item.is_me ? <Badge tone="accent">{t("sessions.me")}</Badge> : null}
      {item.is_bot ? <Badge tone="danger">{t("sessions.bot")}</Badge> : null}
      {item.is_datacenter ? <Badge tone="warn">{t("sessions.dc")}</Badge> : null}
      {item.engaged ? <Badge tone="ok">{t("sessions.engaged")}</Badge> : null}
    </span>
  );
}

function GoalPills({ goals }: { goals: string[] }) {
  const { t } = useI18n();
  if (!goals.length) return <span className="text-[12px] text-ink-faint">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {goals.map((goal) => (
        <span key={goal} className="badge" data-tone="accent">
          <GoalIcon goal={goal} size={12} /> {t(`goal.${goal}`)}
        </span>
      ))}
    </span>
  );
}

export function SessionsFeed({
  items,
  total,
  counts,
  perPage,
  onMore,
  loadingMore,
  onOpen,
  filters,
  onPatch,
}: {
  items: SessionItem[];
  total: number;
  counts: { all: number; engaged: number; goals: number; live: number; bounce: number };
  perPage: number;
  onMore: () => void;
  loadingMore: boolean;
  onOpen: (sid: string) => void;
  filters: Filters;
  onPatch: (patch: Partial<Filters>) => void;
}) {
  const { t, lang } = useI18n();
  const activeTab = (filters.tab as Tab) || "all";
  const [query, setQuery] = useState(filters.q ?? "");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setQuery(filters.q ?? "");
  }, [filters.q]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const onQuery = (value: string) => {
    setQuery(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      onPatch({ q: value.trim() || undefined });
    }, 250);
  };

  const remaining = Math.max(0, total - items.length);
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: t("sessions.tab.all"), count: counts.all },
    { key: "engaged", label: t("sessions.tab.engaged"), count: counts.engaged },
    { key: "goals", label: t("sessions.tab.goals"), count: counts.goals },
    { key: "live", label: t("sessions.tab.live"), count: counts.live },
    { key: "bounce", label: t("sessions.tab.bounce"), count: counts.bounce },
  ];

  return (
    <section>
      <SectionHead
        index="§05"
        title={t("section.05")}
        right={
          <span className="mono text-[12.5px] text-ink-faint">
            {t("sessions.found", { n: fmtNum(total), total: fmtNum(counts.all) })}
          </span>
        }
      />

      <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className="pill shrink-0"
              data-active={activeTab === item.key ? "true" : undefined}
              onClick={() => onPatch({ tab: item.key === "all" ? undefined : item.key })}
            >
              {item.label}
              <span className="mono text-[12px] opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 border border-line bg-bg-2 px-3 py-1.5 xl:w-[380px]">
          <span className="text-ink-faint">⌕</span>
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={t("sessions.search")}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
          />
          {query ? (
            <button type="button" className="text-[13px] text-ink-faint" onClick={() => onQuery("")}>
              ×
            </button>
          ) : null}
        </label>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <Empty>{counts.all === 0 ? t("sessions.empty") : t("sessions.nothing")}</Empty>
        </div>
      ) : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>{t("sessions.time")}</th>
                  <th>{t("sessions.visitor")}</th>
                  <th>{t("sessions.location")}</th>
                  <th>{t("sessions.source")}</th>
                  <th>{t("sessions.device")}</th>
                  <th>{t("sessions.activity")}</th>
                  <th>{t("sessions.goals")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.sid} onClick={() => onOpen(item.sid)} title={t("sessions.open")}>
                    <td className="whitespace-nowrap">
                      <div className="mono text-[13px] font-medium text-ink">{fmtClock(item.start)}</div>
                      <div className="text-[12px] text-ink-dim">{fmtDate(item.start, lang)}</div>
                      <div className="mt-1.5">
                        <Badges item={item} />
                      </div>
                    </td>
                    <td>
                      <div className="mono text-[12.5px] text-ink-dim">{item.visitor.slice(0, 12)}</div>
                      <div className="text-[12px] text-ink-faint">{t("sessions.visit", { n: item.visit_index })}</div>
                    </td>
                    <td>
                      <div className="name max-w-[210px] truncate">
                        <span className="mr-1">{flag(item.country) || "🌐"}</span>
                        {item.city || item.country || "—"}
                      </div>
                      <div className="mono max-w-[210px] truncate text-[12px] text-ink-faint" title={item.isp}>
                        {item.isp || "—"}
                      </div>
                      <div className="mono text-[12px] text-ink-faint">{item.ip_masked || "—"}</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink-dim">
                          <SourceIcon kind={item.source} />
                        </span>
                        <span className="name max-w-[130px] truncate">
                          {item.source === "direct" ? t("audience.direct") : item.source}
                        </span>
                      </div>
                      {item.utm.source || item.utm.campaign ? (
                        <div className="mono mt-0.5 max-w-[150px] truncate text-[12px] text-ink-faint">
                          {[item.utm.source, item.utm.campaign].filter(Boolean).join(" / ")}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-ink-dim">
                          <DeviceIcon kind={item.device} />
                        </span>
                        <span className="name">{t(`audience.device.${item.device}`)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-ink-faint">
                        {item.os ? <OsIcon name={item.os} size={13} /> : null}
                        {item.browser ? <BrowserIcon name={item.browser} size={13} /> : null}
                        <span className="mono text-[12px]">
                          {[item.os, item.browser, item.screen].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="mono text-[12.5px] text-ink">{shortPath(item.entry_path || "/")}</div>
                      <div className="mt-0.5 flex gap-2 text-[12px] text-ink-faint">
                        <span>{t("sessions.pages", { count: item.pageviews })}</span>
                        <span>{Math.round(item.max_scroll)}%</span>
                        <span className="mono text-ink-dim">{fmtDuration(item.duration, lang)}</span>
                      </div>
                    </td>
                    <td>
                      <GoalPills goals={item.goals} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {items.map((item) => (
              <button
                key={item.sid}
                type="button"
                className="card block w-full p-4 text-left"
                onClick={() => onOpen(item.sid)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="mono text-[13px] font-medium text-ink">
                      {fmtClock(item.start)}
                      <span className="ml-2 text-[12px] font-normal text-ink-dim">{fmtDate(item.start, lang)}</span>
                    </div>
                    <div className="name mt-1">
                      {flag(item.country)} {item.city || item.country || "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badges item={item} />
                    <div className="mono mt-1.5 text-[12.5px]" style={{ color: "var(--accent)" }}>
                      {fmtDuration(item.duration, lang)}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-ink-dim">
                  <SourceIcon kind={item.source} />
                  <span className="truncate">
                    {item.source === "direct" ? t("audience.direct") : item.source} → {item.entry_path || "/"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-faint">
                  <DeviceIcon kind={item.device} size={13} />
                  <span className="truncate">{[item.os, item.browser].filter(Boolean).join(" · ")}</span>
                  <span className="truncate">· {item.isp || item.ip_masked || "—"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <GoalPills goals={item.goals} />
                  <span className="mono shrink-0 text-[12px] text-ink-faint">
                    {t("sessions.scroll", { value: Math.round(item.max_scroll) })}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {remaining > 0 ? (
            <div className="mt-3 flex justify-center">
              <button type="button" className="btn" onClick={onMore} disabled={loadingMore}>
                {t("sessions.showMore", { count: Math.min(perPage, remaining) })}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
