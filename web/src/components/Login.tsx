import { useState } from "react";
import type { FormEvent, MouseEvent } from "react";

import { useI18n } from "../i18n";

export function Login({
  onLogin,
  theme,
  onTheme,
}: {
  onLogin: (token: string) => Promise<void>;
  theme: "dark" | "light";
  onTheme: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t, lang, setLang } = useI18n();
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(false);
    try {
      await onLogin(token.trim());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative w-full max-w-[380px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--accent)" }}>●</span>
            <span className="font-mono text-[12px] text-ink-dim">coffee1337 / analytics</span>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className="btn px-2.5 py-1" onClick={() => setLang(lang === "ru" ? "en" : "ru")}>
              {lang === "ru" ? "RU" : "EN"}
            </button>
            <button type="button" className="btn px-2.5 py-1" onClick={onTheme} aria-label={t("header.theme")}>
              {theme === "dark" ? "☼" : "☾"}
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="card p-6">
          <div className="kicker mb-3">{t("login.kicker")}</div>
          <h1 className="font-display text-[26px] leading-none tracking-tight">{t("login.title")}</h1>
          <p className="mono mt-2 text-[12px] text-ink-faint">{t("login.subtitle")}</p>

          <label className="mt-6 flex items-center gap-2 border border-line bg-bg px-3 py-2 focus-within:border-accent">
            <span className="mono text-[12px]" style={{ color: "var(--accent)" }}>
              &gt;
            </span>
            <input
              type="password"
              value={token}
              autoFocus
              onChange={(event) => setToken(event.target.value)}
              placeholder={t("login.placeholder")}
              className="mono w-full bg-transparent text-[12px] outline-none placeholder:text-ink-faint"
            />
          </label>
          {error ? (
            <div className="mono mt-2 text-[12px]" style={{ color: "var(--danger)" }}>
              {t("login.error")}
            </div>
          ) : null}
          <button type="submit" className="btn btn--accent mt-4 w-full" disabled={busy || !token.trim()}>
            {t("login.submit")} →
          </button>
          <p className="mono mt-4 border-t border-line-2 pt-3 text-[12px] leading-relaxed text-ink-faint">{t("login.hint")}</p>
        </form>
      </div>
    </div>
  );
}
