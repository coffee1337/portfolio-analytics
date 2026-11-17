import type { KeyboardEvent, ReactNode } from "react";

import { useI18n } from "../i18n";
import { fmtDuration, fmtNum, fmtPct } from "../lib/format";
import type { Insights, Kpi, Metric, Point } from "../lib/types";
import { Delta, SectionHead, Sparkline } from "./ui";

interface CardProps {
  label: string;
  value: string;
  unit?: string;
  delta: number | null | undefined;
  sub: string;
  invert?: boolean;
  spark: number[];
  active?: boolean;
  onClick: () => void;
  hint: string;
  action?: ReactNode;
}

function KpiCard({ label, value, unit, delta, sub, invert, spark, active, onClick, hint, action }: CardProps) {
  return (
    <div
      className="card card--click flex min-h-[150px] flex-col justify-between p-5"
      data-active={active ? "true" : undefined}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={hint}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="kicker leading-tight">{label}</span>
        <Delta value={delta} invert={invert} />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="num text-[40px]">{value}</span>
        {unit ? <span className="mono text-[13px] text-ink-faint">{unit}</span> : null}
      </div>
      <div className="mt-3">
        <Sparkline values={spark} tone={active ? "var(--accent)" : "var(--accent-2)"} />
      </div>
      <div className="mt-1 text-[12.5px] leading-snug text-ink-dim">{sub}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function KpiGrid({
  kpi,
  points,
  metric,
  onMetric,
  engagedActive,
  onEngaged,
}: {
  kpi: Kpi;
  points: Point[];
  metric: Metric;
  onMetric: (metric: Metric) => void;
  engagedActive: boolean;
  onEngaged: () => void;
}) {
  const { t, lang } = useI18n();
  const spark = (key: keyof Point) => points.map((point) => Number(point[key] ?? 0));
  const hint = t("kpi.hint");

  return (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
      <KpiCard
        label={t("kpi.visitors")}
        value={fmtNum(kpi.visitors.value)}
        delta={kpi.visitors.delta}
        sub={t("kpi.visitors.sub", {
          visits: kpi.visitors.visits,
          returning: Math.round(kpi.visitors.returning_pct),
        })}
        spark={spark("visitors")}
        active={metric === "visitors"}
        onClick={() => onMetric("visitors")}
        hint={hint}
      />
      <KpiCard
        label={t("kpi.engaged")}
        value={fmtNum(kpi.engaged.value)}
        delta={kpi.engaged.delta}
        sub={t("kpi.engaged.sub", { rate: Math.round(kpi.engaged.rate) })}
        spark={spark("engaged")}
        active={metric === "engaged"}
        onClick={() => onMetric("engaged")}
        hint={hint}
        action={
          <button
            type="button"
            className="pill pill--sm"
            data-active={engagedActive ? "true" : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onEngaged();
            }}
            title={t("filters.engaged")}
          >
            {engagedActive ? "✓" : "+"} {t("filters.engaged")}
          </button>
        }
      />
      <KpiCard
        label={t("kpi.bounce")}
        value={fmtPct(kpi.bounce.value)}
        delta={kpi.bounce.delta}
        invert
        sub={t("kpi.bounce.sub", { count: kpi.bounce.count })}
        spark={spark("visits")}
        active={metric === "visits"}
        onClick={() => onMetric("visits")}
        hint={hint}
      />
      <KpiCard
        label={t("kpi.duration")}
        value={fmtDuration(kpi.duration.value, lang)}
        delta={kpi.duration.delta}
        sub={t("kpi.duration.sub", { max: fmtDuration(kpi.duration.max, lang) })}
        spark={spark("avg_sec")}
        active={metric === "avg_sec"}
        onClick={() => onMetric("avg_sec")}
        hint={hint}
      />
      <KpiCard
        label={t("kpi.pageviews")}
        value={fmtNum(kpi.pageviews.value)}
        delta={kpi.pageviews.delta}
        sub={t("kpi.pageviews.sub", { scroll: Math.round(kpi.pageviews.avg_scroll) })}
        spark={spark("pageviews")}
        active={metric === "pageviews"}
        onClick={() => onMetric("pageviews")}
        hint={hint}
      />
      <KpiCard
        label={t("kpi.goals")}
        value={fmtNum(kpi.goals.value)}
        delta={kpi.goals.delta}
        sub={t("kpi.goals.sub", {
          rate: Math.round(kpi.goals.conversion_rate),
          sessions: kpi.goals.sessions,
        })}
        spark={spark("goals")}
        active={metric === "goals"}
        onClick={() => onMetric("goals")}
        hint={hint}
      />
    </div>
  );
}

export function InsightsStrip({
  insights,
  onProject,
  onSource,
  onDeep,
}: {
  insights: Insights;
  onProject: (id: string) => void;
  onSource: (key: string) => void;
  onDeep: () => void;
}) {
  const { t } = useI18n();

  const items: {
    key: string;
    label: string;
    value: string;
    sub: string;
    onClick?: () => void;
  }[] = [
    {
      key: "project",
      label: t("insights.project"),
      value: insights.project ? t(`projects.name.${insights.project.id}`) : t("insights.none"),
      sub: insights.project ? t("insights.actions", { n: insights.project.actions }) : "",
      onClick: insights.project ? () => onProject(insights.project!.id) : undefined,
    },
    {
      key: "source",
      label: t("insights.source"),
      value: insights.source
        ? insights.source.key === "direct"
          ? t("insights.direct")
          : insights.source.key
        : t("insights.none"),
      sub: insights.source ? t("insights.sessions", { n: insights.source.sessions }) : "",
      onClick: insights.source ? () => onSource(insights.source!.key) : undefined,
    },
    {
      key: "deep",
      label: t("insights.deep"),
      value: `${Math.round(insights.deep.pct)}%`,
      sub: t(insights.deep.section === "resume" ? "insights.deep.resume" : "insights.deep.contact"),
      onClick: onDeep,
    },
    {
      key: "peak",
      label: t("insights.peak"),
      value: insights.peak ? insights.peak.label : t("insights.none"),
      sub: insights.peak ? t("insights.sessions", { n: insights.peak.visits }) : "",
    },
  ];

  return (
    <section className="mt-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="kicker kicker--accent">§01b / {t("insights.title")}</span>
        <span className="text-[12px] text-ink-faint">{t("insights.hint")}</span>
      </div>
      <div className="grid grid-cols-2 gap-3.5 md:gap-4 xl:grid-cols-4">
        {items.map((item) =>
          item.onClick ? (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="card card--click px-4 py-3 text-left"
            >
              <div className="kicker mb-1">{item.label}</div>
              <div className="font-display truncate text-[16px] font-semibold text-accent">{item.value}</div>
              <div className="mono mt-1 text-[12px] text-ink-faint">{item.sub}</div>
            </button>
          ) : (
            <div key={item.key} className="card px-4 py-3">
              <div className="kicker mb-1">{item.label}</div>
              <div className="font-display truncate text-[16px] font-semibold text-accent">{item.value}</div>
              <div className="mono mt-1 text-[12px] text-ink-faint">{item.sub}</div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

export function KpiSection({
  kpi,
  points,
  metric,
  onMetric,
  engagedActive,
  onEngaged,
  insights,
  onProject,
  onSource,
}: {
  kpi: Kpi;
  points: Point[];
  metric: Metric;
  onMetric: (metric: Metric) => void;
  engagedActive: boolean;
  onEngaged: () => void;
  insights: Insights;
  onProject: (id: string) => void;
  onSource: (key: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section>
      <SectionHead
        index="§01"
        title={t("section.01")}
        right={<span className="text-[12.5px] text-ink-faint">{t("kpi.hint")}</span>}
      />
      <KpiGrid
        kpi={kpi}
        points={points}
        metric={metric}
        onMetric={onMetric}
        engagedActive={engagedActive}
        onEngaged={onEngaged}
      />
      <InsightsStrip
        insights={insights}
        onProject={onProject}
        onSource={onSource}
        onDeep={() => onMetric("goals")}
      />
    </section>
  );
}

