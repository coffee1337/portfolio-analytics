import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { fmtClock, fmtDate, fmtDuration, fmtNum, flag } from "../lib/format";
import { navigate } from "../lib/hooks";
import type { VisitorDetail } from "../lib/types";
import { Badge, Stat } from "../components/ui";

export function VisitorPage({ vid }: { vid: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<VisitorDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await api.visitor(vid);
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setError(t("detail.notFound"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vid, t]);

  const back = () => navigate(`/${window.location.search}`);

  async function remove() {
    if (!data) return;
    if (!window.confirm(t("detail.deleteVisitorConfirm"))) return;
    try {
      await api.deleteVisitor(data.visitor.id);
      back();
    } catch {
      setError(t("app.error"));
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <button type="button" className="btn mb-6" onClick={back}>
          ← {t("detail.back")}
        </button>
        <div className="card p-8 text-center font-mono text-[12px] text-ink-dim">{error}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="mono px-4 py-16 text-center text-[11px] text-ink-faint">{t("app.loading")}</div>;
  }

  const v = data.visitor;

  return (
    <div className="mx-auto max-w-[1200px] px-3 py-5 md:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn" onClick={back}>
          ← {t("detail.back")}
        </button>
        <button type="button" className="btn btn--danger" onClick={remove}>
          {t("detail.deleteVisitor")}
        </button>
      </div>

      <div className="mb-4">
        <div className="kicker mb-1">§V / visitor</div>
        <h1 className="font-display text-[24px] leading-none tracking-tight md:text-[30px]">{v.id}</h1>
        <div className="mono mt-2 flex flex-wrap items-center gap-2 text-[10px] text-ink-faint">
          <span>
            {fmtDate(v.first_seen)} → {fmtDate(v.last_seen)}
          </span>
          {v.is_me ? <Badge>{t("sessions.me")}</Badge> : null}
          {v.is_bot ? <Badge tone="danger">{t("sessions.bot")}</Badge> : null}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="card space-y-3 p-4">
          <div className="kicker">{t("detail.metrics")}</div>
          <Stat label={t("detail.sessions")} value={fmtNum(v.sessions)} />
          <Stat label={t("detail.totalTime")} value={fmtDuration(v.active_sec)} />
          <Stat label={t("detail.firstSeen")} value={fmtDate(v.first_seen)} />
          <Stat label={t("detail.lastSeen")} value={fmtDate(v.last_seen)} />
        </div>

        <div className="card space-y-3 p-4">
          <div className="kicker">{t("detail.goals")}</div>
          {v.goals.length ? (
            v.goals.map((goal) => <Stat key={goal.key} label={t(`goal.${goal.key}`)} value={fmtNum(goal.count)} />)
          ) : (
            <div className="mono text-[11px] text-ink-faint">—</div>
          )}
        </div>

        <div className="card space-y-3 p-4">
          <div className="kicker">{t("detail.projects")}</div>
          {v.projects.length ? (
            v.projects.map((project) => (
              <Stat key={project.key} label={t(`projects.${project.key}`)} value={fmtNum(project.count)} />
            ))
          ) : (
            <div className="mono text-[11px] text-ink-faint">—</div>
          )}
        </div>

        <div className="card space-y-3 p-4">
          <div className="kicker">{t("detail.stack")}</div>
          {v.stack.length ? (
            v.stack.map((tech) => <Stat key={tech.key} label={tech.key} value={fmtNum(tech.count)} />)
          ) : (
            <div className="mono text-[11px] text-ink-faint">—</div>
          )}
          <Stat
            label={t("detail.geo")}
            value={v.countries.map((code) => `${flag(code)} ${code}`).join(" ") || "—"}
            hint={v.isp}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 border-b border-line pb-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim">{t("detail.sessions")}</h2>
        </div>
        <div className="card divide-y divide-line-2">
          {data.sessions.map((session) => (
            <button
              key={session.sid}
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-bg-3"
              onClick={() => navigate(`/session/${encodeURIComponent(session.sid)}${window.location.search}`)}
            >
              <span className="mono text-[11px]">
                {fmtDate(session.start)} {fmtClock(session.start)}
                <span className="ml-2 text-ink-faint">{t("sessions.visit", { n: session.visit_index })}</span>
              </span>
              <span className="mono flex flex-wrap items-center gap-2 text-[10px] text-ink-faint">
                <span>
                  {flag(session.country)} {session.city || session.country || "—"}
                </span>
                <span>{fmtDuration(session.duration)}</span>
                <span>{t("sessions.pages", { count: session.pageviews })}</span>
                <span>{Math.round(session.max_scroll)}%</span>
                {session.goals.length ? <Badge tone="ok">{session.goals.length}</Badge> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
