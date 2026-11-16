import type { KeyboardEvent } from "react";

import { useI18n } from "../i18n";
import { fmtDuration, fmtNum, fmtPct } from "../lib/format";
import type { Kpi } from "../lib/types";
import { Delta } from "./ui";

interface CardProps {
  label: string;
  value: string;
  unit?: string;
  delta: number | null | undefined;
  sub: string;
  invert?: boolean;
  onClick?: () => void;
  active?: boolean;
}

function KpiCard({ label, value, unit, delta, sub, invert, onClick, active }: CardProps) {
  return (
    <div
      className={`card flex min-h-[124px] flex-col justify-between p-4${onClick ? " card--click" : ""}`}
      data-active={active ? "true" : undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="kicker leading-tight">{label}</span>
        <Delta value={delta} invert={invert} />
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="num text-[34px] md:text-[38px]">{value}</span>
        {unit ? <span className="mono text-[12px] text-ink-faint">{unit}</span> : null}
      </div>
      <div className="mono mt-2 text-[10px] leading-snug text-ink-faint">{sub}</div>
    </div>
  );
}

export function KpiGrid({
  kpi,
  onEngaged,
  engagedActive,
}: {
  kpi: Kpi;
  onEngaged: () => void;
  engagedActive: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label={t("kpi.visitors")}
        value={fmtNum(kpi.visitors.value)}
        delta={kpi.visitors.delta}
        sub={t("kpi.visitors.sub", {
          visits: kpi.visitors.visits,
          returning: Math.round(kpi.visitors.returning_pct),
        })}
      />
      <KpiCard
        label={t("kpi.engaged")}
        value={fmtNum(kpi.engaged.value)}
        delta={kpi.engaged.delta}
        sub={t("kpi.engaged.sub", { rate: Math.round(kpi.engaged.rate) })}
        onClick={onEngaged}
        active={engagedActive}
      />
      <KpiCard
        label={t("kpi.bounce")}
        value={fmtPct(kpi.bounce.value)}
        delta={kpi.bounce.delta}
        invert
        sub={t("kpi.bounce.sub", { count: kpi.bounce.count })}
      />
      <KpiCard
        label={t("kpi.duration")}
        value={fmtDuration(kpi.duration.value)}
        delta={kpi.duration.delta}
        sub={t("kpi.duration.sub", { max: fmtDuration(kpi.duration.max) })}
      />
      <KpiCard
        label={t("kpi.pageviews")}
        value={fmtNum(kpi.pageviews.value)}
        delta={kpi.pageviews.delta}
        sub={t("kpi.pageviews.sub", { scroll: Math.round(kpi.pageviews.avg_scroll) })}
      />
      <KpiCard
        label={t("kpi.goals")}
        value={fmtNum(kpi.goals.value)}
        delta={kpi.goals.delta}
        sub={t("kpi.goals.sub", {
          rate: Math.round(kpi.goals.conversion_rate),
          sessions: kpi.goals.sessions,
        })}
      />
    </div>
  );
}
