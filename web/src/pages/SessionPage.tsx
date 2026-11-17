import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { countryName, flag, fmtClock, fmtDate, fmtDuration, pluralize } from "../lib/format";
import { navigate } from "../lib/hooks";
import type { SessionDetail } from "../lib/types";
import { SessionTimeline } from "../components/SessionTimeline";
import { Badge, Empty, Stat } from "../components/ui";

export function SessionPage({ sid }: { sid: string }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await api.session(sid);
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setError(t("detail.notFound"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sid, t]);

  async function markMe() {
    if (!data || busy) return;
    setBusy(true);
    try {
      await api.ignoreSession(data.session.sid, t("sessions.me"));
      setMessage(t("detail.marked"));
      setData({ ...data, session: { ...data.session, is_me: true } });
    } catch {
      setMessage(t("app.error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!data || busy) return;
    if (!window.confirm(t("detail.deleteConfirm"))) return;
    setBusy(true);
    try {
      await api.deleteSession(data.session.sid);
      navigate(`/${window.location.search}`);
    } catch {
      setMessage(t("app.error"));
    } finally {
      setBusy(false);
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

  const session = data.session;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn" onClick={() => navigate(`/${window.location.search}`)}>
          ← {t("detail.back")}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={markMe} disabled={busy || session.is_me}>
            ◉ {session.is_me ? t("sessions.me") : t("detail.markMe")}
          </button>
          <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
            {t("detail.delete")}
          </button>
        </div>
      </div>

      {message ? <div className="mb-4 border border-line bg-bg-2 px-4 py-2.5 text-[13px]">{message}</div> : null}

      <div className="mb-5">
        <div className="kicker kicker--accent mb-2">§06 / {t("detail.passport")}</div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight md:text-[34px]">
          {fmtDate(session.start, lang)} · {fmtClock(session.start)}
          <span className="ml-3 text-[20px] text-ink-dim md:text-[24px]">{fmtDuration(session.duration, lang)}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mono text-[12.5px] text-ink-faint">{session.sid}</span>
          <Badge tone={session.engaged ? "ok" : "danger"}>
            {session.engaged ? t("detail.engaged") : t("detail.bounce")}
          </Badge>
          {session.live ? <Badge tone="ok">{t("sessions.live")}</Badge> : null}
          {session.is_bot ? <Badge tone="danger">{t("sessions.bot")}</Badge> : null}
          <Badge tone="accent">{t("sessions.visit", { n: session.visit_index })}</Badge>
        </div>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <div className="card space-y-3.5 p-5">
          <h2 className="card-title">{t("detail.visitor")}</h2>
          <a
            className="mono block truncate text-[13px] text-accent hover:underline"
            href={`/visitor/${encodeURIComponent(session.visitor)}${window.location.search}`}
            onClick={(event) => {
              event.preventDefault();
              navigate(`/visitor/${encodeURIComponent(session.visitor)}${window.location.search}`);
            }}
          >
            {session.visitor}
          </a>
          <Stat
            label={t("detail.sessions")}
            value={`${data.visitor.sessions} ${pluralize(data.visitor.sessions, lang, {
              one: t("detail.visit.one"),
              few: t("detail.visit.few"),
              many: t("detail.visit.many"),
            })}`}
          />
          <Stat label={t("detail.ip")} value={session.ip_masked || "—"} />
          <Stat label={t("detail.isp")} value={session.isp || "—"} hint={session.asn} />
        </div>

        <div className="card space-y-3.5 p-5">
          <h2 className="card-title">{t("detail.geo")}</h2>
          <Stat
            label={t("detail.country")}
            value={`${flag(session.country)} ${countryName(session.country, lang)}`.trim()}
            hint={session.country}
          />
          <Stat label={t("detail.city")} value={session.city || "—"} hint={session.region} />
          <Stat label={t("detail.tz")} value={session.tz || "—"} />
          <Stat
            label={t("detail.status")}
            value={session.is_datacenter ? t("detail.datacenter") : t("detail.residency")}
          />
        </div>

        <div className="card space-y-3.5 p-5">
          <h2 className="card-title">{t("detail.device")}</h2>
          <Stat label={t("detail.type")} value={t(`audience.device.${session.device}`)} />
          <Stat label={t("detail.os")} value={session.os || "—"} hint={session.screen} />
          <Stat label={t("detail.browser")} value={session.browser || "—"} hint={session.viewport} />
          <Stat label={t("detail.lang")} value={session.lang || "—"} />
        </div>

        <div className="card space-y-3.5 p-5">
          <h2 className="card-title">{t("detail.source")}</h2>
          <Stat
            label={t("detail.source")}
            value={session.source === "direct" ? t("audience.direct") : session.source}
          />
          <Stat label={t("detail.referrer")} value={<span className="break-all">{session.referrer || "—"}</span>} />
          <Stat
            label={t("detail.utm")}
            value={[session.utm.source, session.utm.medium, session.utm.campaign].filter(Boolean).join(" / ") || "—"}
          />
          <Stat label={t("detail.maxScroll")} value={`${Math.round(session.max_scroll)}%`} hint={session.entry_path} />
        </div>
      </div>

      <div className="card mt-3.5 flex flex-wrap items-center gap-x-8 gap-y-3 p-5 md:mt-4">
        <Stat label={t("detail.duration")} value={fmtDuration(session.duration, lang)} />
        <Stat label={t("detail.events")} value={data.events.length} />
        <Stat label={t("sessions.pages.short")} value={session.pageviews} />
        <Stat label={t("detail.maxScroll")} value={`${Math.round(session.max_scroll)}%`} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1">{t("detail.goals")}</span>
          {session.goals.length ? (
            session.goals.map((goal) => (
              <span key={goal} className="badge" data-tone="accent">
                {t(`goal.${goal}`)}
              </span>
            ))
          ) : (
            <span className="text-[12.5px] text-ink-faint">—</span>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-baseline justify-between border-b border-line pb-2">
          <h2 className="section-title">{t("detail.timeline")}</h2>
          <span className="mono text-[12.5px] text-ink-faint">{data.events.length}</span>
        </div>
        {data.events.length === 0 ? <Empty>{t("detail.noEvents")}</Empty> : <SessionTimeline events={data.events} />}
      </div>
    </div>
  );
}
