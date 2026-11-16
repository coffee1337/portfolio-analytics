import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";

import { ActiveFilters, Header } from "./components/Header";
import { AudienceSection } from "./components/Audience";
import { Chart } from "./components/Chart";
import { DataModal } from "./components/DataModal";
import { IntelligenceSection } from "./components/Intelligence";
import { KpiGrid } from "./components/Kpi";
import { Login } from "./components/Login";
import { SessionsFeed } from "./components/Sessions";
import { SectionHead } from "./components/ui";
import { I18nContext, translate } from "./i18n";
import type { Lang } from "./i18n";
import { api } from "./lib/api";
import { applyTheme, useInterval, usePath, useSearchParams } from "./lib/hooks";
import type { Filters, Metric, Overview } from "./lib/types";
import { SessionPage } from "./pages/SessionPage";
import { VisitorPage } from "./pages/VisitorPage";

const FILTER_KEYS = [
  "source",
  "utm",
  "country",
  "city",
  "isp",
  "device",
  "os",
  "browser",
  "path",
  "project",
  "goal",
] as const;

function readFilters(params: URLSearchParams): Filters {
  const filters: Filters = {
    range: params.get("range") || "7d",
    me: params.get("me") === "1",
    bots: params.get("bots") === "1",
    engaged: params.get("engaged") === "1",
  };
  const from = params.get("from");
  const to = params.get("to");
  if (from) filters.from = from;
  if (to) filters.to = to;
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  return filters;
}

function toParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range && filters.range !== "7d") params.set("range", filters.range);
  if (filters.me) params.set("me", "1");
  if (filters.bots) params.set("bots", "1");
  if (filters.engaged) params.set("engaged", "1");
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, String(value));
  }
  return params;
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("pa-lang") === "en" ? "en" : "ru"));
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [perPage, setPerPage] = useState(30);
  const [auto, setAuto] = useState(15);
  const [reloadKey, setReloadKey] = useState(0);
  const [metric, setMetric] = useState<Metric>("visits");
  const [dataOpen, setDataOpen] = useState(false);
  const path = usePath();

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem("pa-lang", next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const info = await api.me();
        setAuthed(info.authenticated);
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const payload = await api.overview(filters, 1, perPage);
        if (cancelled) return;
        setData(payload);
        setError("");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.message === "unauthorized") {
          setAuthed(false);
          return;
        }
        setError(t("app.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, filters, perPage, reloadKey, t]);

  useInterval(() => setReloadKey((value) => value + 1), auto > 0 && authed ? auto * 1000 : null);

  const patchFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      for (const key of Object.keys(patch)) {
        const value = (patch as Record<string, unknown>)[key];
        if (value === undefined || value === "" || value === false) {
          if (key === "me" || key === "bots" || key === "engaged") {
            (next as Record<string, unknown>)[key] = Boolean(value);
          } else {
            delete (next as Record<string, unknown>)[key];
          }
        }
      }
      setPerPage(30);
      setParams(toParams(next));
    },
    [filters, setParams],
  );

  const clearFilters = useCallback(() => {
    setPerPage(30);
    setParams(new URLSearchParams({ range: filters.range, ...(filters.me ? { me: "1" } : {}) }));
  }, [filters.me, filters.range, setParams]);

  const toggleTheme = useCallback((event?: MouseEvent<HTMLButtonElement>) => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next, event ? { x: event.clientX, y: event.clientY } : undefined);
    setTheme(next);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAuthed(false);
      setData(null);
    }
  }, []);

  const i18n = useMemo(
    () => ({ lang, setLang, t }),
    [lang, setLang, t],
  );

  if (authed === null) {
    return (
      <div className="mono flex min-h-screen items-center justify-center text-[11px] text-ink-faint">
        {t("app.loading")}
      </div>
    );
  }

  if (!authed) {
    return (
      <I18nContext.Provider value={i18n}>
        <div className="grain" />
        <Login
          theme={theme}
          onTheme={toggleTheme}
          onLogin={async (token) => {
            await api.login(token);
            setAuthed(true);
            setReloadKey((value) => value + 1);
          }}
        />
      </I18nContext.Provider>
    );
  }

  const sessionMatch = path.match(/^\/session\/(.+)$/);
  const visitorMatch = path.match(/^\/visitor\/(.+)$/);

  return (
    <I18nContext.Provider value={i18n}>
      <div className="grain" />
      {sessionMatch ? (
        <SessionPage sid={decodeURIComponent(sessionMatch[1])} />
      ) : visitorMatch ? (
        <VisitorPage vid={decodeURIComponent(visitorMatch[1])} />
      ) : (
        <>
          <Header
            meta={data?.meta ?? null}
            filters={filters}
            onFilters={patchFilters}
            auto={auto}
            onAuto={setAuto}
            onRefresh={() => setReloadKey((value) => value + 1)}
            refreshing={loading}
            onData={() => setDataOpen(true)}
            onLogout={() => void logout()}
            theme={theme}
            onTheme={toggleTheme}
          />

          <main className="mx-auto max-w-[1600px] space-y-8 px-3 py-5 md:px-5">
            <ActiveFilters filters={filters} onPatch={patchFilters} onClear={clearFilters} />

            {error ? (
              <div className="card flex items-center justify-between gap-3 p-4">
                <span className="mono text-[11px]" style={{ color: "var(--danger)" }}>
                  {error}
                </span>
                <button type="button" className="btn" onClick={() => setReloadKey((value) => value + 1)}>
                  {t("app.retry")}
                </button>
              </div>
            ) : null}

            {!data ? (
              <div className="mono py-24 text-center text-[11px] text-ink-faint">{t("app.loading")}</div>
            ) : (
              <>
                <section>
                  <SectionHead
                    index="§01"
                    title={t("section.01")}
                    right={
                      <span className="mono text-[10px] text-ink-faint">
                        {data.meta.range} · {data.meta.bucket}
                      </span>
                    }
                  />
                  <KpiGrid
                    kpi={data.kpi}
                    engagedActive={Boolean(filters.engaged)}
                    onEngaged={() => patchFilters({ engaged: !filters.engaged })}
                  />
                </section>

                <section>
                  <SectionHead
                    index="§02"
                    title={t("section.02")}
                    right={<span className="mono text-[10px] text-ink-faint">{t("chart.hint")}</span>}
                  />
                  <Chart
                    points={data.timeseries.points}
                    metric={metric}
                    onMetric={setMetric}
                    conversionRate={data.kpi.goals.conversion_rate}
                  />
                </section>

                <IntelligenceSection data={data} filters={filters} onPatch={patchFilters} />
                <AudienceSection data={data} filters={filters} onPatch={patchFilters} />

                <SessionsFeed
                  items={data.sessions.items}
                  total={data.sessions.total}
                  page={1}
                  perPage={perPage}
                  loadingMore={loading}
                  onMore={() => setPerPage((value) => value + 30)}
                />

                <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 pb-6">
                  <span className="mono text-[9px] text-ink-faint">
                    {new Date(data.meta.generated_at).toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-GB", {
                      timeZone: "Europe/Moscow",
                    })}{" "}
                    MSK · {t("footer.note")}
                  </span>
                  <span className="mono text-[9px] text-ink-faint">
                    {t("footer.privacy")}
                  </span>
                </footer>
              </>
            )}
          </main>

          <DataModal
            open={dataOpen}
            onClose={() => setDataOpen(false)}
            filters={filters}
            onChanged={() => setReloadKey((value) => value + 1)}
          />
        </>
      )}
    </I18nContext.Provider>
  );
}
