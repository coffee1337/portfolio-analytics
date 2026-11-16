import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { countryName, flag, fmtClock, fmtDateTime, fmtDuration, fmtGap } from "../lib/format";
import { navigate } from "../lib/hooks";
import type { SessionDetail } from "../lib/types";
import { Badge, Stat } from "../components/ui";

type EventRow = SessionDetail["events"][number];

function prop(props: Record<string, unknown>, key: string, fallback = ""): string {
  const value = props[key];
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function describe(event: EventRow, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const props = event.props;
  switch (event.name) {
    case "pageview":
      return t("desc.pageview", { path: event.path || "/" });
    case "loader":
      return t(`desc.loader.${prop(props, "action", "complete")}`, { ms: prop(props, "elapsed_ms", "0") });
    case "section":
      return t("desc.section", { id: prop(props, "id", prop(props, "section")) });
    case "scroll":
      return t("desc.scroll", { value: Math.round(Number(props.scroll ?? props.max_scroll ?? 0)) });
    case "entry_cta":
      return t("desc.entry_cta", { card: t(`goals.card.${prop(props, "card", "hire")}`) });
    case "stack_key":
      return t("desc.stack_key", { tech: prop(props, "tech"), mode: prop(props, "mode", "3d") });
    case "project_select":
      return t("desc.project_select", {
        project: prop(props, "project"),
        via: prop(props, "via", "explorer"),
      });
    case "project_filter":
      return t("desc.project_filter", { filter: prop(props, "filter", "All") });
    case "project_details":
      return t("desc.project_details", { project: prop(props, "project") });
    case "project_action":
      return t("desc.project_action", {
        action: prop(props, "action"),
        project: prop(props, "project"),
      });
    case "resume":
      return t(`desc.resume.${prop(props, "action", "download_pdf")}`);
    case "contact_submit":
      return t("desc.contact_submit", { topic: t(`goals.topic.${prop(props, "topic", "other")}`) });
    case "contact_copy":
      return t("desc.contact_copy", { channel: prop(props, "channel", "email") });
    case "social_click":
      return t("desc.social_click", { network: prop(props, "network", "telegram") });
    case "assistant": {
      const action = prop(props, "action", "ask");
      if (action === "ask") return t("desc.assistant.ask", { query: prop(props, "query") });
      return t(`desc.assistant.${action}`);
    }
    case "cmdk":
      return prop(props, "action", "open") === "select"
        ? t("desc.cmdk.select", { command: prop(props, "command") })
        : t("desc.cmdk.open");
    case "theme_switch":
      return t("desc.theme_switch", { to: prop(props, "to") });
    case "lang_switch":
      return t("desc.lang_switch", { to: prop(props, "to") });
    case "click":
    case "ui":
      return t(`desc.${event.name}`, { text: prop(props, "text", prop(props, "target", "—")) });
    case "exit":
      return t("desc.exit");
    case "ping":
      return t("desc.ping");
    default:
      return t("desc.unknown", { name: event.name });
  }
}

const GOAL_EVENTS = new Set(["resume", "contact_submit", "contact_copy", "social_click", "entry_cta"]);

function tagColor(name: string): string {
  if (GOAL_EVENTS.has(name) || name === "project_action") return "var(--accent)";
  if (name.startsWith("project")) return "var(--accent-2)";
  if (name === "assistant" || name === "cmdk" || name === "stack_key") return "var(--warn)";
  return "var(--ink-faint)";
}

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

  const back = () => navigate(`/${window.location.search}`);

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
      back();
    } catch {
      setMessage(t("app.error"));
    } finally {
      setBusy(false);
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

  const s = data.session;
  const events = data.events.filter((event) => event.name !== "ping");

  return (
    <div className="mx-auto max-w-[1200px] px-3 py-5 md:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn" onClick={back}>
          ← {t("detail.back")}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={markMe} disabled={busy || s.is_me}>
            ◉ {s.is_me ? t("sessions.me") : t("detail.markMe")}
          </button>
          <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
            {t("detail.delete")}
          </button>
        </div>
      </div>

      {message ? <div className="mono mb-3 border border-line bg-bg-2 px-3 py-2 text-[11px]">{message}</div> : null}

      <div className="mb-4">
        <div className="kicker mb-1">§S / session</div>
        <h1 className="font-display text-[26px] leading-none tracking-tight md:text-[32px]">
          {fmtDateTime(s.start)} · {fmtDuration(s.duration, lang)}
        </h1>
        <div className="mono mt-2 flex flex-wrap items-center gap-2 text-[10px] text-ink-faint">
          <span className="truncate">{s.sid}</span>
          <Badge tone={s.engaged ? "ok" : "danger"}>{s.engaged ? t("detail.engaged") : t("detail.bounce")}</Badge>
          {s.live ? <Badge tone="ok">{t("sessions.live")}</Badge> : null}
          {s.is_bot ? <Badge tone="danger">{t("sessions.bot")}</Badge> : null}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="card space-y-3 p-4">
          <div className="kicker">{t("detail.visitor")}</div>
          <a
            className="mono block truncate text-[12px] text-accent hover:underline"
            href={`/visitor/${encodeURIComponent(s.visitor)}${window.location.search}`}
            onClick={(event) => {
              event.preventDefault();
              navigate(`/visitor/${encodeURIComponent(s.visitor)}${window.location.search}`);
            }}
          >
            {s.visitor}
          </a>
          <Stat label={t("detail.sessions")} value={t("detail.visits", { count: s.visit_index })} />
          <Stat label={t("detail.ip")} value={s.ip_masked || "—"} />
          <Stat label={t("detail.isp")} value={s.isp || "—"} hint={s.asn} />
        </div>

        <div className="card space-y-3 p-4">
          <div className="kicker">{t("detail.geo")}</div>
          <Stat label={t("detail.country")} value={`${flag(s.country)} ${countryName(s.country, lang)}`.trim()} hint={s.country} />
          <Stat label={t("detail.city")} value={s.city || "—"} hint={s.region} />
          <Stat label={t("detail.tz")} value={s.tz || "—"} />
          <Stat
            label={t("detail.status")}
            value={s.is_datacenter ? t("detail.datacenter") : t("detail.residency")}
          />
        </div>

        <div className="card space-y-3 p-4">
          <div className="kicker">{t("detail.device")}</div>
          <Stat label={t("detail.type")} value={t(`audience.device.${s.device}`)} />
          <Stat label={t("detail.os")} value={s.os || "—"} hint={s.screen} />
          <Stat label={t("detail.browser")} value={s.browser || "—"} hint={s.viewport} />
          <Stat label={t("detail.lang")} value={s.lang || "—"} />
        </div>

        <div className="card space-y-3 p-4">
          <div className="kicker">{t("detail.source")}</div>
          <Stat label={t("detail.source")} value={s.source === "direct" ? t("audience.direct") : s.source} />
          <Stat label={t("detail.referrer")} value={<span className="break-all">{s.referrer || "—"}</span>} />
          <Stat
            label={t("detail.utm")}
            value={[s.utm.source, s.utm.medium, s.utm.campaign].filter(Boolean).join(" / ") || "—"}
          />
          <Stat label={t("detail.maxScroll")} value={`${Math.round(s.max_scroll)}%`} hint={s.entry_path} />
        </div>
      </div>

      <div className="card mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <Stat label={t("detail.start")} value={fmtClock(s.start)} />
        <Stat label={t("detail.duration")} value={fmtDuration(s.duration, lang)} />
        <Stat label={t("detail.events")} value={data.events.length} />
        <Stat label={t("sessions.pages")} value={s.pageviews} />
        <div className="flex flex-wrap items-center gap-1">
          <span className="kicker mr-1">{t("detail.goals")}</span>
          {s.goals.length ? (
            s.goals.map((goal) => (
              <span key={goal} className="pill pill--sm" data-tone="accent">
                {t(`goal.${goal}`)}
              </span>
            ))
          ) : (
            <span className="mono text-[10px] text-ink-faint">—</span>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-baseline justify-between border-b border-line pb-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim">{t("detail.timeline")}</h2>
          <span className="mono text-[10px] text-ink-faint">{events.length}</span>
        </div>
        {events.length === 0 ? (
          <div className="mono py-8 text-center text-[11px] text-ink-faint">{t("detail.noEvents")}</div>
        ) : (
          <ol className="relative ml-1 border-l border-line-2 pl-4">
            {events.map((event, index) => (
              <li key={event.id} className="relative pb-4">
                <span
                  className="absolute -left-[21px] top-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ background: tagColor(event.name) }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono text-[10px] text-ink-dim">{fmtClock(event.ts)}</span>
                  {event.gap ? <span className="mono text-[9px] text-ink-faint">{fmtGap(event.gap, lang)}</span> : null}
                  <span className="pill pill--sm" style={{ color: tagColor(event.name), borderColor: "currentColor" }}>
                    {t(`event.${event.name}`) === `event.${event.name}` ? event.name : t(`event.${event.name}`)}
                  </span>
                  {event.path ? (
                    <span className="mono max-w-[220px] truncate text-[9px] text-ink-faint">{event.path}</span>
                  ) : null}
                </div>
                <div className={`mt-1 text-[12px] leading-snug ${event.name === "ping" ? "text-ink-faint" : "text-ink-dim"}`}>
                  {describe(event, t)}
                </div>
                {index === events.length - 1 ? null : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
