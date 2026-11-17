import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { fmtClock, fmtDate, fmtDuration, fmtNum, flag } from "../lib/format";
import { navigate } from "../lib/hooks";
import type { VisitorDetail } from "../lib/types";
import { Badge, Stat } from "../components/ui";

export function VisitorPage({ vid }: { vid: string }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<VisitorDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function markMe() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.ignoreValue("visitor", vid, t("sessions.me"));
      setMessage(t("data.markedIp", { ip: vid.slice(0, 12), n: result.updated }));
      setData((current) => (current ? { ...current, visitor: { ...current.visitor, is_me: true } } : current));
    } catch {
      setMessage(t("app.error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!data) return;
    if (!window.confirm(t("detail.deleteVisitorConfirm"))) return;
    try {
      await api.deleteVisitor(data.visitor.id);
      navigate(`/${window.location.search}`);
    } catch {
      setError(t("app.error"));
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <button type="button" className="btn mb-6" onClick={() => navigate(`/${window.location.search}`)}>
          ← {t("detail.back")}
        </button>
        <div className="card p-8 text-center text-[13.5px] text-ink-dim">{error}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="px-4 py-16 text-center text-[13px] text-ink-faint">{t("app.loading")}</div>;
  }

  const visitor = data.visitor;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn" onClick={() => navigate(`/${window.location.search}`)}>
          ← {t("detail.back")}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={markMe} disabled={busy || visitor.is_me}>
            ◉ {visitor.is_me ? t("sessions.me") : t("detail.markMe")}
          </button>
          <button type="button" className="btn btn--danger" onClick={remove}>
            {t("detail.deleteVisitor")}
          </button>
        </div>
      </div>

      {message ? <div className="mb-4 border border-line bg-bg-2 px-4 py-2.5 text-[13px]">{message}</div> : null}

      <div className="mb-5">
        <div className="kicker kicker--accent mb-2">§V / {t("detail.visitor")}</div>
        <h1 className="font-display break-all text-[26px] font-bold leading-tight tracking-tight md:text-[32px]">
          {visitor.id}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-faint">
          <span className="mono">
            {fmtDate(visitor.first_seen)} → {fmtDate(visitor.last_seen)}
          </span>
          {visitor.is_me ? <Badge tone="accent">{t("sessions.me")}</Badge> : null}
          {visitor.is_bot ? <Badge tone="danger">{t("sessions.bot")}</Badge> : null}
        </div>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <div className="card space-y-3.5 p-5">
          <h2 className="card-title">{t("detail.metrics")}</h2>
          <Stat label={t("detail.sessions")} value={fmtNum(visitor.sessions)} />
          <Stat label={t("detail.totalTime")} value={fmtDuration(visitor.active_sec, lang)} />
          <Stat label={t("detail.firstSeen")} value={fmtDate(visitor.first_seen)} />
          <Stat label={t("detail.lastSeen")} value={fmtDate(visitor.last_seen)} />
        </div>

        <div className="card space-y-3.5 p-5">
          <h2 className="card-title">{t("detail.goals")}</h2>
          {visitor.goals.length ? (
            visitor.goals.map((goal) => <Stat key={goal.key} label={t(`goal.${goal.key}`)} value={fmtNum(goal.count)} />)
          ) : (
            <div className="text-[13px] text-ink-faint">—</div>
          )}
        </div>

        <div className="card space-y-3.5 p-5">
          <h2 className="card-title">{t("detail.projects")}</h2>
          {visitor.projects.length ? (
            visitor.projects.map((project) => (
              <Stat key={project.key} label={t(`projects.name.${project.key}`)} value={fmtNum(project.count)} />
            ))
          ) : (
            <div className="text-[13px] text-ink-faint">—</div>
          )}
        </div>

        <div className="card space-y-3.5 p-5">
          <h2 className="card-title">{t("detail.stack")}</h2>
          {visitor.stack.length ? (
            visitor.stack.map((tech) => <Stat key={tech.key} label={tech.key} value={fmtNum(tech.count)} />)
          ) : (
            <div className="text-[13px] text-ink-faint">—</div>
          )}
          <Stat
            label={t("detail.geo")}
            value={visitor.countries.map((code) => `${flag(code)} ${code}`).join(" ") || "—"}
            hint={visitor.isp}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 border-b border-line pb-2">
          <h2 className="section-title">{t("detail.sessions")}</h2>
        </div>
        <div className="card divide-y divide-line-2">
          {data.sessions.map((session) => (
            <button
              key={session.sid}
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-3"
              onClick={() => navigate(`/session/${encodeURIComponent(session.sid)}${window.location.search}`)}
            >
              <span className="mono text-[13px] text-ink">
                {fmtDate(session.start)} {fmtClock(session.start)}
                <span className="ml-2 text-[12px] text-ink-faint">{t("sessions.visit", { n: session.visit_index })}</span>
              </span>
              <span className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-dim">
                <span>
                  {flag(session.country)} {session.city || session.country || "—"}
                </span>
                <span className="mono">{fmtDuration(session.duration, lang)}</span>
                <span className="mono">{t("sessions.pages", { count: session.pageviews })}</span>
                <span className="mono">{Math.round(session.max_scroll)}%</span>
                {session.goals.length ? <Badge tone="ok">{session.goals.length}</Badge> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
