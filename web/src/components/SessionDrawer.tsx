import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { countryName, flag, fmtClock, fmtDate, fmtDuration, fmtNum } from "../lib/format";
import { navigate } from "../lib/hooks";
import type { SessionDetail } from "../lib/types";
import { SessionTimeline } from "./SessionTimeline";
import { Badge } from "./ui";

export function SessionDrawer({
  sid,
  onClose,
  onChanged,
}: {
  sid: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!sid) return;
    let cancelled = false;
    setData(null);
    setMessage("");
    void (async () => {
      try {
        const payload = await api.session(sid);
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setMessage(t("detail.notFound"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sid, t]);

  useEffect(() => {
    if (!sid) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previous;
    };
  }, [sid, onClose]);

  async function markMe() {
    if (!data || busy) return;
    setBusy(true);
    try {
      await api.ignoreSession(data.session.sid, t("sessions.me"));
      setMessage(t("detail.marked"));
      setData({ ...data, session: { ...data.session, is_me: true } });
      onChanged();
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
      onChanged();
      onClose();
    } catch {
      setMessage(t("app.error"));
    } finally {
      setBusy(false);
    }
  }

  const session = data?.session;

  return (
    <AnimatePresence>
      {sid ? (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label={t("sessions.drawer.close")}
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t("detail.passport")}
            className="relative flex h-full w-full flex-col border-l border-line bg-bg shadow-2xl"
            style={{ maxWidth: "min(560px, 100vw)" }}
            initial={{ x: 40, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <div className="kicker kicker--accent mb-1">§06 / session</div>
                <h2 className="font-display text-[19px] font-bold leading-tight text-ink">
                  {session ? `${fmtClock(session.start)} · ${fmtDuration(session.duration, lang)}` : t("app.loading")}
                </h2>
                {session ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="mono text-[12px] text-ink-faint">{fmtDate(session.start, lang)}</span>
                    <Badge tone={session.engaged ? "ok" : "danger"}>
                      {session.engaged ? t("detail.engaged") : t("detail.bounce")}
                    </Badge>
                    {session.live ? <Badge tone="ok">{t("sessions.live")}</Badge> : null}
                    {session.is_bot ? <Badge tone="danger">{t("sessions.bot")}</Badge> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" className="btn px-3 py-1.5" onClick={onClose}>
                  ×
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4">
              {message ? (
                <div className="mb-3 border border-line bg-bg-2 px-3 py-2 text-[13px]">{message}</div>
              ) : null}

              {!session ? (
                <div className="py-16 text-center text-[13px] text-ink-faint">{t("app.loading")}</div>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="kicker mb-1">{t("detail.location")}</div>
                      <div className="name">
                        {flag(session.country)} {session.city || countryName(session.country, lang)}
                      </div>
                      <div className="mono mt-0.5 text-[12px] text-ink-faint">
                        {session.isp || "—"} · {session.ip_masked || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="kicker mb-1">{t("detail.device")}</div>
                      <div className="name">
                        {t(`audience.device.${session.device}`)} · {session.os || "—"}
                      </div>
                      <div className="mono mt-0.5 text-[12px] text-ink-faint">
                        {[session.browser, session.screen].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="kicker mb-1">{t("detail.source")}</div>
                      <div className="name truncate">
                        {session.source === "direct" ? t("audience.direct") : session.source}
                      </div>
                      <div className="mono mt-0.5 truncate text-[12px] text-ink-faint">{session.entry_path || "/"}</div>
                    </div>
                    <div>
                      <div className="kicker mb-1">{t("detail.metrics")}</div>
                      <div className="mono text-[13px] text-ink">
                        {fmtNum(session.pageviews)} {t("sessions.pages.short")} · {t("sessions.scroll", { value: Math.round(session.max_scroll) })}
                      </div>
                      <div className="mono mt-0.5 text-[12px] text-ink-faint">
                        {t("sessions.visit", { n: session.visit_index })}
                      </div>
                    </div>
                  </div>

                  {session.goals.length ? (
                    <div className="mb-4 flex flex-wrap items-center gap-1.5">
                      <span className="kicker mr-1">{t("detail.goals")}</span>
                      {session.goals.map((goal) => (
                        <span key={goal} className="badge" data-tone="accent">
                          {t(`goal.${goal}`)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mb-2 flex items-baseline justify-between border-b border-line pb-2">
                    <span className="kicker">{t("detail.timeline")}</span>
                    <span className="mono text-[12px] text-ink-faint">{data?.events.length ?? 0}</span>
                  </div>
                  <SessionTimeline events={data?.events ?? []} dense />
                </>
              )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
              <button
                type="button"
                className="btn btn--accent"
                onClick={() => {
                  const target = `/session/${encodeURIComponent(sid)}${window.location.search}`;
                  onClose();
                  navigate(target);
                }}
              >
                ↗ {t("sessions.drawer.full")}
              </button>
              <button type="button" className="btn" onClick={markMe} disabled={busy || session?.is_me}>
                ◉ {session?.is_me ? t("sessions.me") : t("detail.markMe")}
              </button>
              <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
                {t("detail.delete")}
              </button>
            </footer>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
