import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { useI18n } from "../i18n";
import { fmtDuration, fmtNum, fmtPct } from "../lib/format";
import type { Metric, Point } from "../lib/types";
import { Empty } from "./ui";

const METRICS: Metric[] = ["visits", "visitors", "engaged", "pageviews", "goals", "avg_sec"];
const HEIGHT = 250;
const PAD_TOP = 14;
const PAD_BOTTOM = 8;
const GUTTER = 48;

type Mode = "area" | "bars" | "heatmap";

export function Chart({
  points,
  prevPoints,
  metric,
  onMetric,
  conversionRate,
  heatmap,
  heatmapMax,
}: {
  points: Point[];
  prevPoints: Point[];
  metric: Metric;
  onMetric: (metric: Metric) => void;
  conversionRate: number;
  heatmap: number[][];
  heatmapMax: number;
}) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<Mode>("area");
  const [compare, setCompare] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(960);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [cell, setCell] = useState<{ day: number; hour: number } | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next > 0) setWidth(Math.round(next));
    });
    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width) || 960);
    return () => observer.disconnect();
  }, []);

  const values = useMemo(() => points.map((point) => Number(point[metric] ?? 0)), [points, metric]);
  const prevValues = useMemo(
    () => prevPoints.map((point) => Number(point[metric] ?? 0)),
    [prevPoints, metric],
  );
  const rawMax = Math.max(1, compare ? Math.max(...prevValues, ...values, 1) : Math.max(...values, 1));
  const rawStep = rawMax / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
  const tickStep = Math.max(1, Math.ceil(rawStep / magnitude) * magnitude);
  const max = tickStep * 4;

  const plotWidth = Math.max(80, width - GUTTER - 8);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const barWidth = points.length ? Math.max(2, plotWidth / points.length - 3) : 0;
  const x = (index: number) => GUTTER + (points.length > 1 ? index * step : plotWidth / 2);
  const y = (value: number) => PAD_TOP + (1 - value / max) * plotHeight;

  const linePath = useMemo(
    () =>
      values
        .map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`)
        .join(" "),
    [values, points.length, max, width],
  );

  const areaPath = useMemo(() => {
    if (!points.length) return "";
    const base = PAD_TOP + plotHeight;
    return `${linePath} L${x(points.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
  }, [linePath, points.length, max, width]);

  const prevPath = useMemo(() => {
    if (!compare || prevValues.length === 0) return "";
    const count = prevValues.length;
    const prevStep = count > 1 ? plotWidth / (count - 1) : 0;
    return prevValues
      .map((value, index) => {
        const px = GUTTER + (count > 1 ? index * prevStep : plotWidth / 2);
        return `${index === 0 ? "M" : "L"}${px.toFixed(1)},${y(value).toFixed(1)}`;
      })
      .join(" ");
  }, [compare, prevValues, max, width]);

  const ticks = useMemo(() => Array.from({ length: 5 }, (_, index) => tickStep * index), [tickStep]);

  const format = (value: number) => (metric === "avg_sec" ? fmtDuration(value, lang) : fmtNum(value, lang));
  const totalVisits = points.reduce((sum, point) => sum + point.visits, 0);
  const labelEvery = Math.max(1, Math.ceil(points.length / (width > 700 ? 12 : 6)));
  const active = hover !== null ? points[hover] : null;
  const single = points.length === 1;

  function handleMove(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = event.clientX - rect.left - GUTTER;
    if (points.length <= 1) {
      setHover(0);
      return;
    }
    const index = Math.round(relative / step);
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  const heatCells = heatmap.flat().reduce((sum, value) => sum + value, 0);

  return (
    <div className="card p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {METRICS.map((key) => (
            <button
              key={key}
              type="button"
              className="pill pill--sm shrink-0"
              data-active={metric === key ? "true" : undefined}
              onClick={() => onMetric(key)}
            >
              {t(`chart.${key}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode !== "heatmap" ? (
            <button
              type="button"
              className="pill pill--sm"
              data-active={compare ? "true" : undefined}
              onClick={() => setCompare((value) => !value)}
              title={t("chart.compare")}
            >
              ⤳ {t("chart.compare")}
            </button>
          ) : null}
          {(["area", "bars", "heatmap"] as Mode[]).map((key) => (
            <button
              key={key}
              type="button"
              className="pill pill--sm"
              data-active={mode === key ? "true" : undefined}
              onClick={() => setMode(key)}
            >
              {t(`chart.mode.${key}`)}
            </button>
          ))}
        </div>
      </div>

      {mode === "heatmap" ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[13px] text-ink-dim">{t("chart.heatmap.hint")}</span>
            <span className="mono text-[12px] text-ink-faint">
              {t("chart.total")}: {fmtNum(heatCells)}
            </span>
          </div>
          {heatCells === 0 ? (
            <Empty>{t("chart.heatmap.empty")}</Empty>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <div className="min-w-[620px]">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="w-8 shrink-0" />
                  <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <span key={hour} className="mono text-center text-[10.5px] text-ink-faint">
                        {hour % 6 === 0 ? String(hour).padStart(2, "0") : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {heatmap.map((row, day) => (
                    <div key={day} className="flex items-center gap-1.5">
                      <span className="mono w-8 shrink-0 text-[11px] text-ink-faint">{t(`chart.wd.${day}`)}</span>
                      <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                        {row.map((value, hour) => {
                          const ratio = heatmapMax ? value / heatmapMax : 0;
                          const isActive = cell?.day === day && cell?.hour === hour;
                          return (
                            <button
                              key={hour}
                              type="button"
                              onMouseEnter={() => setCell({ day, hour })}
                              onMouseLeave={() => setCell(null)}
                              className="h-6 border transition-transform"
                              style={{
                                background:
                                  ratio === 0
                                    ? "var(--bg-3)"
                                    : `color-mix(in srgb, var(--accent) ${Math.round(18 + ratio * 82)}%, var(--bg-3))`,
                                borderColor: isActive ? "var(--ink)" : "var(--line-2)",
                              }}
                              title={`${t(`chart.wd.${day}`)} ${String(hour).padStart(2, "0")}:00 — ${value}`}
                              aria-label={`${t(`chart.wd.${day}`)} ${hour}:00 ${value}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="mono text-[11px] text-ink-faint">0</span>
                  <div className="h-2 w-24" style={{ background: "linear-gradient(90deg, var(--bg-3), var(--accent))" }} />
                  <span className="mono text-[11px] text-ink-faint">{heatmapMax}</span>
                </div>
              </div>
            </div>
          )}
          {cell ? (
            <div className="mono mt-2 text-[12px] text-ink-dim">
              {t(`chart.wd.${cell.day}`)} {String(cell.hour).padStart(2, "0")}:00 — {heatmap[cell.day][cell.hour]}{" "}
              {t("chart.visits")}
            </div>
          ) : null}
        </div>
      ) : points.length === 0 || max === 0 ? (
        <Empty>{t("chart.empty")}</Empty>
      ) : (
        <>
          <div ref={wrapRef} className="relative w-full">
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={t(`chart.${metric}`)}
              onMouseMove={handleMove}
              onMouseLeave={() => setHover(null)}
              className="block max-w-full"
            >
              <defs>
                <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {ticks.map((tick, index) => (
                <g key={index}>
                  <line
                    x1={GUTTER}
                    x2={GUTTER + plotWidth}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke="var(--line-2)"
                    strokeWidth={1}
                  />
                  <text
                    x={GUTTER - 8}
                    y={y(tick) + 4}
                    textAnchor="end"
                    className="mono"
                    fontSize={11.5}
                    fill="var(--ink-dim)"
                  >
                    {format(tick)}
                  </text>
                </g>
              ))}

              {compare && prevPath ? (
                <path
                  d={prevPath}
                  fill="none"
                  stroke="var(--ink-faint)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  opacity={0.85}
                />
              ) : null}

              {single ? (
                <>
                  <line
                    x1={GUTTER}
                    x2={GUTTER + plotWidth}
                    y1={y(values[0])}
                    y2={y(values[0])}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    opacity={0.55}
                  />
                  <circle cx={x(0)} cy={y(values[0])} r={5} fill="var(--accent)" />
                  <text
                    x={x(0) + 12}
                    y={y(values[0]) - 10}
                    className="mono"
                    fontSize={12}
                    fill="var(--ink)"
                  >
                    {format(values[0])}
                  </text>
                </>
              ) : mode === "area" ? (
                <>
                  <path d={areaPath} fill="url(#chart-fill)" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </>
              ) : (
                values.map((value, index) => (
                  <rect
                    key={index}
                    x={x(index) - barWidth / 2}
                    y={y(value)}
                    width={barWidth}
                    height={Math.max(1, PAD_TOP + plotHeight - y(value))}
                    fill={hover === index ? "var(--accent)" : "var(--accent-2)"}
                    opacity={hover === null || hover === index ? 0.92 : 0.5}
                  />
                ))
              )}

              {hover !== null && points[hover] && !single ? (
                <>
                  <line
                    x1={x(hover)}
                    x2={x(hover)}
                    y1={PAD_TOP - 6}
                    y2={PAD_TOP + plotHeight}
                    stroke="var(--line-strong)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="var(--accent)" />
                </>
              ) : null}
            </svg>

            {active && !single ? (
              <div
                className="pointer-events-none absolute top-0 z-10 min-w-[160px] border border-line bg-bg px-3 py-2 shadow-lg"
                style={{
                  left: `${Math.min(84, Math.max(2, (hover! / Math.max(1, points.length - 1)) * 90))}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="mono mb-1 text-[11px] uppercase tracking-wider text-ink-faint">{active.label}</div>
                <div className="num text-[22px]">{format(Number(active[metric]))}</div>
                <div className="mono mt-2 space-y-0.5 text-[11.5px] text-ink-dim">
                  <div>
                    {t("chart.goals")}: {active.goals}
                  </div>
                  <div>
                    {t("chart.visitors")}: {active.visitors}
                  </div>
                  <div>
                    {t("chart.visits")}: {active.visits}
                  </div>
                </div>
              </div>
            ) : null}

            {single ? (
              <div className="mono mt-1 text-[12px] text-ink-faint">{t("chart.single")}</div>
            ) : (
              <div className="mono mt-1.5 flex justify-between text-[11.5px] text-ink-dim">
                {points
                  .filter((_, index) => index % labelEvery === 0)
                  .map((point) => (
                    <span key={point.t}>{point.label}</span>
                  ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line-2 pt-3 text-[12.5px] text-ink-dim">
        <span>
          {t("chart.visits")}: <span className="mono text-ink">{fmtNum(totalVisits)}</span>
        </span>
        <span>
          {t("chart.pageviews")}:{" "}
          <span className="mono text-ink">{fmtNum(points.reduce((sum, point) => sum + point.pageviews, 0))}</span>
        </span>
        <span>
          CR: <span className="mono text-ink">{fmtPct(conversionRate)}</span>
        </span>
        {compare ? <span className="text-ink-faint">⤳ {t("chart.compare")}</span> : null}
      </div>
    </div>
  );
}
