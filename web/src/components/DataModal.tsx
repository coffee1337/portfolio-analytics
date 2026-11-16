import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import type { CleanupPreview, Filters, IgnoredItem } from "../lib/types";
import { Empty } from "./ui";

export function DataModal({
  open,
  onClose,
  filters,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [ignored, setIgnored] = useState<IgnoredItem[]>([]);
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [nextPreview, nextIgnored] = await Promise.all([api.cleanupPreview(), api.ignored()]);
        if (cancelled) return;
        setPreview(nextPreview);
        setIgnored(nextIgnored.items);
      } catch {
        if (!cancelled) setMessage(t("app.error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open) return null;

  async function run(scope: string) {
    if (busy) return;
    if (scope === "all" && confirm.trim().toUpperCase() !== "DELETE") return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api.cleanup(scope, confirm);
      setPreview(result.preview);
      setConfirm("");
      setMessage(t("data.deleted", { count: result.preview.total }));
      if (scope === "ignored" || scope === "all") {
        const next = await api.ignored();
        setIgnored(next.items);
      }
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("app.error"));
    } finally {
      setBusy(false);
    }
  }

  async function removeIgnored(id: number) {
    try {
      await api.removeIgnore(id);
      const next = await api.ignored();
      setIgnored(next.items);
      onChanged();
    } catch {
      setMessage(t("app.error"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10 md:items-center md:pt-4">
      <div className="card w-full max-w-[680px] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="kicker mb-1">§DB / data</div>
            <h2 className="font-display text-[22px] leading-none">{t("data.title")}</h2>
          </div>
          <button type="button" className="btn px-2.5 py-1" onClick={onClose} aria-label={t("app.close")}>
            ×
          </button>
        </div>

        {preview ? (
          <div className="mono mb-4 border border-line-2 bg-bg px-3 py-2 text-[10px] text-ink-faint">
            {t("data.preview", {
              total: preview.total,
              bots: preview.bots,
              me: preview.me,
              ignored: preview.ignored,
            })}
          </div>
        ) : null}

        <div className="mb-5">
          <div className="kicker mb-2">{t("data.export")}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <a className="btn justify-start" href={api.exportUrl("sessions.csv", filters)} download>
              ↓ {t("data.csv")}
            </a>
            <a className="btn justify-start" href={api.exportUrl("events.json", filters)} download>
              ↓ {t("data.json")}
            </a>
          </div>
        </div>

        <div className="mb-5">
          <div className="kicker mb-2">{t("data.cleanup")}</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 border border-line-2 px-3 py-2">
              <span className="mono text-[11px]">{t("data.bots")}</span>
              <span className="flex items-center gap-2">
                <span className="mono text-[10px] text-ink-faint">{t("data.rows", { count: preview?.bots ?? 0 })}</span>
                <button type="button" className="btn px-2 py-1" onClick={() => run("bots")} disabled={busy || !preview?.bots}>
                  ×
                </button>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border border-line-2 px-3 py-2">
              <span className="mono text-[11px]">{t("data.me")}</span>
              <span className="flex items-center gap-2">
                <span className="mono text-[10px] text-ink-faint">{t("data.rows", { count: preview?.me ?? 0 })}</span>
                <button type="button" className="btn px-2 py-1" onClick={() => run("me")} disabled={busy || !preview?.me}>
                  ×
                </button>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border border-line-2 px-3 py-2">
              <span className="mono text-[11px]">{t("data.ignored")}</span>
              <span className="flex items-center gap-2">
                <span className="mono text-[10px] text-ink-faint">{t("data.rows", { count: preview?.ignored ?? 0 })}</span>
                <button type="button" className="btn px-2 py-1" onClick={() => run("ignored")} disabled={busy || !preview?.ignored}>
                  ×
                </button>
              </span>
            </div>
          </div>
        </div>

        {ignored.length ? (
          <div className="mb-5">
            <div className="kicker mb-2">{t("data.ignoredList")}</div>
            <div className="max-h-[140px] space-y-1 overflow-y-auto scroll-thin">
              {ignored.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 border-b border-line-2 pb-1">
                  <span className="mono truncate text-[10px] text-ink-dim">
                    {item.kind}: {item.value.slice(0, 16)} {item.label ? `· ${item.label}` : ""}
                  </span>
                  <button type="button" className="mono text-[10px] text-danger" onClick={() => removeIgnored(item.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border border-line px-3 py-3" style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)" }}>
          <div className="kicker mb-2" style={{ color: "var(--danger)" }}>
            {t("data.danger")}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={t("data.resetHint")}
              className="mono flex-1 border border-line bg-bg px-2 py-1 text-[11px] outline-none"
            />
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => run("all")}
              disabled={busy || confirm.trim().toUpperCase() !== "DELETE"}
            >
              {t("data.reset")}
            </button>
          </div>
        </div>

        {message ? <div className="mono mt-3 text-[10px] text-ink-dim">{message}</div> : null}
        {!preview && !message ? <Empty>{t("app.loading")}</Empty> : null}
      </div>
    </div>
  );
}
