import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";

import { ActiveFilters, Header } from "./components/Header";
import { AudienceSection } from "./components/Audience";
import { Chart } from "./components/Chart";
import type { ChartMode } from "./components/Chart";
import { DataModal } from "./components/DataModal";
import { IntelligenceSection } from "./components/Intelligence";
import { KpiSection } from "./components/Kpi";
import { Login } from "./components/Login";
import { SessionDrawer } from "./components/SessionDrawer";
import { SessionsFeed } from "./components/Sessions";
import { SectionHead } from "./components/ui";
import { I18nContext, translate } from "./i18n";
import type { Lang } from "./i18n";
import { api } from "./lib/api";
import { mergeFilters, readFilters, toParams } from "./lib/filters";
import { applyTheme, useInterval, usePath, useSearchParams } from "./lib/hooks";
import type { Filters, Metric, Overview } from "./lib/types";
import { SessionPage } from "./pages/SessionPage";
import { VisitorPage } from "./pages/VisitorPage";

function stored<T extends string | number>(key: string, fallback: T, allowed: T[]): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = (typeof fallback === "number" ? Number(raw) : raw) as T;
  return allowed.includes(value) ? value : fallback;
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
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [perPage, setPerPage] = useState(30);
  const [auto, setAutoState] = useState<number>(() => stored("pa-auto", 15, [0, 15, 30]));
  const [reloadKey, setReloadKey] = useState(0);
  const [metric, setMetric] = useState<Metric>("visitors");
  const [chartMode, setChartMode] = useState<ChartMode>(() =>
    stored<ChartMode>("pa-chart-mode", "area", ["area", "bars", "heatmap"]),
  );
  const [compare, setCompare] = useState<boolean>(() => localStorage.getItem("pa-chart-compare") === "1");
  const [dataOpen, setDataOpen] = useState(false);
  const [drawerSid, setDrawerSid] = useState<string | null>(null);
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
  const setAuto = useCallback((value: number) => {
    setAutoState(value);
    localStorage.setItem("pa-auto", String(value));
  }, []);
  const setMode = useCallback((value: ChartMode) => {
    setChartMode(value);
    localStorage.setItem("pa-chart-mode", value);
  }, []);
  const setComparePersisted = useCallback((value: boolean) => {
    setCompare(value);
    localStorage.setItem("pa-chart-compare", value ? "1" : "0");
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

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const patchFilters = useCallback(
    (patch: Partial<Filters>) => {
      setPerPage(30);
      setParams(toParams(mergeFilters(filters, patch)));
    },
    [filters, setParams],
  );

  /** Reset content slices but keep the period and the noise switches. */
  const clearFilters = useCallback(() => {
    setPerPage(30);
    const next: Filters = {
      range: filters.range,
      me: filters.me,
      bots: filters.bots,
      hide_dc: filters.hide_dc,
    };
    if (filters.range === "custom") {
      next.from = filters.from;
      next.to = filters.to;
    }
    setParams(toParams(next));
  }, [filters, setParams]);

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

  const markMyIp = useCallback(async () => {
    try {
      const result = await api.ignoreSelf();
      setToast(t("data.markedIp", { ip: result.ip_masked, n: result.updated }));
      setReloadKey((value) => value + 1);
    } catch {
      setToast(t("app.error"));
    }
  }, [t]);

  const i18n = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-ink-faint">
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
      <Header
        meta={data?.meta ?? null}
        filters={filters}
        onFilters={patchFilters}
        auto={auto}
        onAuto={setAuto}
        onRefresh={() => setReloadKey((value) => value + 1)}
        refreshing={loading}
        onData={() => setDataOpen(true)}
        onMarkIp={() => void markMyIp()}
        onLogout={() => void logout()}
        theme={theme}
        onTheme={toggleTheme}
      />

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 border border-line bg-bg-2 px-4 py-2 text-[13px] shadow-xl">
          {toast}
        </div>
      ) : null}

      {sessionMatch ? (
        <SessionPage sid={decodeURIComponent(sessionMatch[1])} />
      ) : visitorMatch ? (
        <VisitorPage vid={decodeURIComponent(visitorMatch[1])} />
      ) : (
        <main className="mx-auto max-w-[1600px] space-y-10 px-4 py-6 md:px-6">
          <ActiveFilters filters={filters} onPatch={patchFilters} onClear={clearFilters} />

          {error ? (
            <div className="card flex items-center justify-between gap-3 p-5">
              <span className="text-[13px]" style={{ color: "var(--danger)" }}>
                {error}
              </span>
              <button type="button" className="btn" onClick={() => setReloadKey((value) => value + 1)}>
                {t("app.retry")}
              </button>
            </div>
          ) : null}

          {!data ? (
            <div className="py-24 text-center text-[13px] text-ink-faint">{t("app.loading")}</div>
          ) : (
            <>
              <KpiSection
                kpi={data.kpi}
                points={data.timeseries.points}
                metric={metric}
                onMetric={setMetric}
                engagedActive={Boolean(filters.engaged)}
                onEngaged={() => patchFilters({ engaged: !filters.engaged })}
                insights={data.insights}
                onProject={(id) => patchFilters({ project: filters.project === id ? undefined : id })}
                onSource={(key) => patchFilters({ source: filters.source === key ? undefined : key })}
              />

              <section>
                <SectionHead
                  index="§02"
                  title={t("section.02")}
                  right={<span className="text-[12.5px] text-ink-faint">{t(`chart.${metric}`)}</span>}
                />
                <Chart
                  points={data.timeseries.points}
                  prevPoints={data.prev_timeseries?.points ?? []}
                  metric={metric}
                  onMetric={setMetric}
                  conversionRate={data.kpi.goals.conversion_rate}
                  heatmap={data.heatmap}
                  heatmapMax={data.heatmap_max}
                  mode={chartMode}
                  onMode={setMode}
                  compare={compare}
                  onCompare={setComparePersisted}
                  filters={filters}
                  onPatch={patchFilters}
                />
              </section>

              <IntelligenceSection
                data={data}
                filters={filters}
                onPatch={patchFilters}
                onOpenSession={setDrawerSid}
              />
              <AudienceSection data={data} filters={filters} onPatch={patchFilters} />

              <SessionsFeed
                items={data.sessions.items}
                total={data.sessions.total}
                counts={data.sessions.counts}
                perPage={perPage}
                loadingMore={loading}
                onMore={() => setPerPage((value) => value + 30)}
                onOpen={setDrawerSid}
                filters={filters}
                onPatch={patchFilters}
              />

              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 pb-8">
                <span className="mono text-[12px] text-ink-faint">
                  {new Date(data.meta.generated_at).toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-GB", {
                    timeZone: "Europe/Moscow",
                  })}{" "}
                  MSK · {t("footer.note")}
                </span>
                <span className="mono text-[12px] text-ink-faint">{t("footer.privacy")}</span>
              </footer>
            </>
          )}
        </main>
      )}

      <SessionDrawer
        sid={drawerSid}
        onClose={() => setDrawerSid(null)}
        onChanged={() => setReloadKey((value) => value + 1)}
      />

      <DataModal
        open={dataOpen}
        onClose={() => setDataOpen(false)}
        filters={filters}
        onChanged={() => setReloadKey((value) => value + 1)}
      />
    </I18nContext.Provider>
  );
}
