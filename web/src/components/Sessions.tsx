import type { MouseEvent } from "react";

import { useI18n } from "../i18n";
import { fmtClock, fmtDateTime, fmtDuration, flag, fmtNum } from "../lib/format";
import { navigate } from "../lib/hooks";
import type { SessionItem } from "../lib/types";
import { Badge, Empty, SectionHead } from "./ui";

const GOAL_ICON: Record<string, string> = {
  resume: "📄",
  contact: "✉️",
  contact_copy: "📋",
  social: "✈️",
  entry_cta: "🎯",
  project: "⤴",
};

function Badges({ item }: { item: SessionItem }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {item.live ? <Badge tone="ok">{t("sessions.live")}</Badge> : null}
      {item.is_me ? <Badge>{t("sessions.me")}</Badge> : null}
      {item.is_bot ? <Badge tone="danger">{t("sessions.bot")}</Badge> : null}
      {item.is_datacenter ? <Badge tone="warn">{t("sessions.dc")}</Badge> : null}
      {item.engaged ? <Badge tone="ok">{t("sessions.engaged")}</Badge> : null}
    </span>
  );
}

function GoalPills({ goals }: { goals: string[] }) {
  const { t } = useI18n();
  if (!goals.length) return <span className="mono text-[10px] text-ink-faint">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {goals.map((goal) => (
        <span key={goal} className="pill pill--sm" data-tone="accent">
          {GOAL_ICON[goal] ?? "•"} {t(`goal.${goal}`)}
        </span>
      ))}
    </span>
  );
}

function openSession(item: SessionItem) {
  navigate(`/session/${encodeURIComponent(item.sid)}${window.location.search}`);
}

function openVisitor(event: MouseEvent, item: SessionItem) {
  event.stopPropagation();
  navigate(`/visitor/${encodeURIComponent(item.visitor)}${window.location.search}`);
}

export function SessionsFeed({
  items,
  total,
  page,
  perPage,
  onMore,
  loadingMore,
}: {
  items: SessionItem[];
  total: number;
  page: number;
  perPage: number;
  onMore: () => void;
  loadingMore: boolean;
}) {
  const { t } = useI18n();
  const remaining = Math.max(0, total - items.length);

  return (
    <section>
      <SectionHead
        index="§05"
        title={t("section.05")}
        right={
          <span className="mono text-[10px] text-ink-faint">
            {fmtNum(items.length)} / {fmtNum(total)}
          </span>
        }
      />

      {items.length === 0 ? (
        <div className="card">
          <Empty>{t("sessions.empty")}</Empty>
        </div>
      ) : (
        <>
          {/* desktop table */}
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
                  <tr key={item.sid} onClick={() => openSession(item)} title={t("sessions.open")}>
                    <td className="whitespace-nowrap">
                      <div className="mono text-[11px]">{fmtClock(item.start)}</div>
                      <div className="mono text-[9px] text-ink-faint">{fmtDateTime(item.start).slice(0, 5)}</div>
                      <div className="mt-1">
                        <Badges item={item} />
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="mono text-[10px] text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-accent"
                        onClick={(event) => openVisitor(event, item)}
                      >
                        {item.visitor.slice(0, 10)}
                      </button>
                      <div className="mono text-[9px] text-ink-faint">{t("sessions.visit", { n: item.visit_index })}</div>
                    </td>
                    <td>
                      <div className="mono text-[11px] whitespace-nowrap">
                        {flag(item.country)} {item.city || "—"}
                      </div>
                      <div className="mono max-w-[170px] truncate text-[9px] text-ink-faint" title={`${item.isp} ${item.ip_masked}`}>
                        {item.isp || "—"} · {item.ip_masked || "—"}
                      </div>
                    </td>
                    <td>
                      <div className="mono max-w-[140px] truncate text-[11px]" title={item.referrer}>
                        {item.source === "direct" ? t("audience.direct") : item.source}
                      </div>
                      {item.utm.source || item.utm.campaign ? (
                        <div className="mono max-w-[140px] truncate text-[9px] text-ink-faint">
                          {[item.utm.source, item.utm.campaign].filter(Boolean).join(" / ")}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="mono text-[10px] whitespace-nowrap">
                        {t(`audience.device.${item.device}`) === `audience.device.${item.device}`
                          ? item.device || "—"
                          : t(`audience.device.${item.device}`)}
                      </div>
                      <div className="mono text-[9px] text-ink-faint">
                        {[item.os, item.browser, item.screen].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td>
                      <div className="mono text-[11px]">{item.entry_path || "/"}</div>
                      <div className="mono flex gap-2 text-[9px] text-ink-faint">
                        <span>{t("sessions.pages", { count: item.pageviews })}</span>
                        <span>{t("sessions.scroll", { value: Math.round(item.max_scroll) })}</span>
                        <span style={{ color: "var(--ink-dim)" }}>{fmtDuration(item.duration)}</span>
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

          {/* mobile cards */}
          <div className="space-y-2 md:hidden">
            {items.map((item) => (
              <button
                key={item.sid}
                type="button"
                className="card block w-full p-3 text-left"
                onClick={() => openSession(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="mono text-[11px]">
                    {fmtClock(item.start)}
                    <span className="ml-2 text-ink-faint">{fmtDateTime(item.start).slice(0, 5)}</span>
                    <div className="mt-1 text-[10px] text-ink-dim">
                      {flag(item.country)} {item.city || item.country || "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badges item={item} />
                    <div className="mono mt-1 text-[10px]" style={{ color: "var(--accent)" }}>
                      {fmtDuration(item.duration)}
                    </div>
                  </div>
                </div>
                <div className="mono mt-2 space-y-0.5 border-t border-line-2 pt-2 text-[10px] text-ink-faint">
                  <div>
                    {item.source === "direct" ? t("audience.direct") : item.source} → {item.entry_path || "/"}
                  </div>
                  <div className="truncate">
                    {[item.os, item.browser].filter(Boolean).join(" · ")} · {item.isp || item.ip_masked || "—"}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <GoalPills goals={item.goals} />
                  <span className="mono shrink-0 text-[9px] text-ink-faint">
                    {t("sessions.scroll", { value: Math.round(item.max_scroll) })}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {remaining > 0 ? (
            <div className="mt-2 flex justify-center">
              <button type="button" className="btn" onClick={onMore} disabled={loadingMore}>
                {t("sessions.showMore", { count: Math.min(perPage, remaining) })}
              </button>
            </div>
          ) : null}
          {page > 1 && remaining === 0 ? (
            <div className="mono mt-2 text-center text-[10px] text-ink-faint">— {fmtNum(total)} —</div>
          ) : null}
        </>
      )}
    </section>
  );
}
