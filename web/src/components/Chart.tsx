import { useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { useI18n } from "../i18n";
import type { Metric, Point } from "../lib/types";
import { fmtDuration, fmtNum, fmtPct } from "../lib/format";
import { Empty } from "./ui";

const METRICS: Metric[] = ["visits", "visitors", "engaged", "pageviews", "goals", "avg_sec"];

const W = 1000;
const H = 240;
const PAD_X = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 22;

export function Chart({
  points,
  metric,
  onMetric,
  conversionRate,
}: {
  points: Point[];
  metric: Metric;
  onMetric: (metric: Metric) => void;
  conversionRate: number;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"area" | "bars">("area");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const values = useMemo(() => points.map((point) => Number(point[metric] ?? 0)), [points, metric]);
  const max = Math.max(1, ...values);
  const step = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 0;
  const barWidth = points.length > 0 ? Math.max(2, (W - PAD_X * 2) / points.length - 2) : 0;

  const y = (value: number) => PAD_TOP + (1 - value / max) * (H - PAD_TOP - PAD_BOTTOM);
  const x = (index: number) => PAD_X + index * step;

  const linePath = useMemo(() => {
    if (!points.length) return "";
    return values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  }, [values, points.length, max]);

  const areaPath = useMemo(() => {
    if (!points.length) return "";
    const base = H - PAD_BOTTOM;
    return `${linePath} L${x(points.length - 1).toFixed(2)},${base} L${x(0).toFixed(2)},${base} Z`;
  }, [linePath, points.length, max]);

  const ticks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, index) => (max / count) * index);
  }, [max]);


  const labelEvery = Math.max(1, Math.ceil(points.length / 12));
  const format = (value: number) => (metric === "avg_sec" ? fmtDuration(value) : fmtNum(value));

  function handleMove(event: MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !points.length) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (points.length - 1));
    setHover(index);
  }

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="card p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
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
        <div className="flex gap-1.5">
          <button
            type="button"
            className="pill pill--sm"
            data-active={mode === "area" ? "true" : undefined}
            onClick={() => setMode("area")}
            aria-label="area"
          >
            ∿
          </button>
          <button
            type="button"
            className="pill pill--sm"
            data-active={mode === "bars" ? "true" : undefined}
            onClick={() => setMode("bars")}
            aria-label="bars"
          >
            ▁▄█
          </button>
        </div>
      </div>

      {points.length === 0 || max === 0 ? (
        <Empty>{t("chart.empty")}</Empty>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-[220px] w-full md:h-[260px]"
            preserveAspectRatio="none"
            role="img"
            aria-label={t(`chart.${metric}`)}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((tick, index) => (
              <line
                key={index}
                x1={0}
                x2={W}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--line-2)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {mode === "area" ? (
              <>
                <path d={areaPath} fill="url(#chart-fill)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : (
              values.map((value, index) => (
                <rect
                  key={index}
                  x={x(index) - barWidth / 2}
                  y={y(value)}
                  width={barWidth}
                  height={Math.max(1, H - PAD_BOTTOM - y(value))}
                  fill={hover === index ? "var(--accent)" : "var(--accent-2)"}
                  opacity={hover === null || hover === index ? 0.9 : 0.55}
                />
              ))
            )}
            {hover !== null && points[hover] ? (
              <>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD_TOP - 6}
                  y2={H - PAD_BOTTOM}
                  stroke="var(--line-strong)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={x(hover)} cy={y(values[hover])} r={3.5} fill="var(--accent)" />
              </>
            ) : null}
          </svg>

          {active ? (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-[150px] border border-line bg-bg px-3 py-2"
              style={{
                left: `${Math.min(88, Math.max(0, (hover! / Math.max(1, points.length - 1)) * 100))}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="mono mb-1 text-[10px] uppercase tracking-wider text-ink-faint">{active.label}</div>
              <div className="font-display text-xl leading-none">{format(Number(active[metric]))}</div>
              <div className="mono mt-2 space-y-0.5 text-[10px] text-ink-dim">
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

          <div className="mono mt-1 flex justify-between text-[9px] text-ink-faint">
            {points
              .filter((_, index) => index % labelEvery === 0)
              .map((point) => (
                <span key={point.t}>{point.label}</span>
              ))}
          </div>
        </div>
      )}

      <div className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-2 pt-2 text-[10px] text-ink-faint">
        <span>
          {t("chart.visits")}: {fmtNum(points.reduce((sum, point) => sum + point.visits, 0))}
        </span>
        <span>
          {t("chart.pageviews")}: {fmtNum(points.reduce((sum, point) => sum + point.pageviews, 0))}
        </span>
        <span>
          {t("chart.goals")}: {fmtNum(points.reduce((sum, point) => sum + point.goals, 0))}
        </span>
        <span>CR: {fmtPct(conversionRate)}</span>
      </div>
    </div>
  );
}
