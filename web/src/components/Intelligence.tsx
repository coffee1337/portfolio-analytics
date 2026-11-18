import { useState } from "react";

import { useI18n } from "../i18n";
import { fmtClock, fmtDuration, fmtNum, fmtPct } from "../lib/format";

const fmtClockDuration = (seconds: number) => fmtDuration(seconds);
import type { Filters, Overview } from "../lib/types";
import { ClockIcon, EventIcon, GoalIcon, SourceIcon } from "./Icons";
import { Badge, Bar, CardTitle, Empty, Pill, SectionHead, Tabs } from "./ui";

export function Funnel({ data }: { data: Overview["funnel"] }) {
  const { t } = useI18n();
  const loader = data.loader;
  const seen = loader.seen ?? loader.complete + loader.skip;
  // shares come from seen, so an empty loader shows 0% / 0% instead of 0% / 100%
  const completePct = seen > 0 ? Math.round((loader.complete / seen) * 100) : 0;
  const skipPct = seen > 0 ? Math.max(0, 100 - completePct) : 0;

  return (
    <div className="card flex h-full flex-col p-5 md:p-6">
      <CardTitle
        right={<span className="text-[12.5px] text-ink-faint">{fmtNum(data.home_sessions)} {t("funnel.home")}</span>}
      >
        {t("funnel.title")}
      </CardTitle>

      <div className="mb-4 border border-line-2 bg-bg p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="name">{t("funnel.loader")}</span>
          <span className="mono text-[12px] text-ink-faint">
            {t("funnel.sessions")}: {fmtNum(seen)}
          </span>
        </div>
        <div className="flex h-3 overflow-hidden" style={{ background: "var(--line-2)" }}>
          <div style={{ width: `${completePct}%`, background: "var(--ok)" }} />
          <div style={{ width: `${skipPct}%`, background: "var(--accent-2)" }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          <span className="text-ink-dim">
            <span style={{ color: "var(--ok)" }}>■</span> {t("funnel.complete")} {completePct}%
          </span>
          <span className="text-ink-dim">
            <span style={{ color: "var(--accent-2)" }}>■</span> {t("funnel.skip")} {skipPct}%
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {data.steps.map((step, index) => (
          <div key={step.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="name">{t(`funnel.section.${step.key}`)}</span>
              <span className="flex items-baseline gap-2 text-[12.5px] text-ink-faint">
                <span className="mono text-ink-dim">{fmtNum(step.sessions)}</span>
                <span className="mono">{Math.round(step.share)}%</span>
                {index > 0 && step.drop < 0 ? (
                  <span className="mono" style={{ color: "var(--danger)" }}>
                    {Math.round(step.drop)}%
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1">
              <Bar value={step.share} muted={index % 2 === 1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectsMatrix({
  rows,
  filters,
  onPatch,
}: {
  rows: Overview["projects"];
  filters: Filters;
  onPatch: (patch: Partial<Filters>) => void;
}) {
  const { t } = useI18n();
  const hasData = rows.some((row) => row.score > 0);
  const metrics = (row: Overview["projects"][number]) => [
    { key: "select", label: t("projects.select"), value: row.select, icon: <EventIcon name="project_select" size={13} /> },
    { key: "details", label: t("projects.details"), value: row.details, icon: <EventIcon name="section" size={13} /> },
    { key: "case", label: t("projects.case_page"), value: row.case_page, icon: <EventIcon name="pageview" size={13} /> },
    { key: "github", label: "GitHub / Demo", value: row.github + row.demo + (row.docs ?? 0), icon: <GoalIcon goal="project" size={13} /> },
    { key: "clone", label: t("projects.clone"), value: row.clone_copy, icon: <EventIcon name="cmdk" size={13} /> },
  ];

  return (
    <div className="card flex h-full flex-col p-5 md:p-6">
      <CardTitle right={<span className="text-[12.5px] text-ink-faint">{t("filters.project")}</span>}>
        {t("projects.title")}
      </CardTitle>
      {!hasData ? (
        <Empty>{t("projects.empty")}</Empty>
      ) : (
        <div className="flex flex-col divide-y divide-line-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onPatch({ project: filters.project === row.id ? undefined : row.id })}
              data-active={filters.project === row.id ? "true" : undefined}
              className="filter-row group w-full px-2.5 py-3 text-left"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="name truncate text-[15px]">{t(`projects.name.${row.id}`)}</div>
                  <div className="mono text-[12px] text-ink-faint">{row.id}</div>
                </div>
                <span className="badge shrink-0" data-tone="accent">
                  Score: {row.score}
                </span>
              </div>
              <div className="mt-2">
                <Bar value={row.weight} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {metrics(row).map((metric) => (
                  <span
                    key={metric.key}
                    className={`pill pill--sm ${metric.value ? "" : "opacity-50"}`}
                    style={{ color: metric.value ? "var(--ink)" : "var(--ink-faint)" }}
                  >
                    {metric.icon} {metric.label}: <span className="mono">{metric.value}</span>
                  </span>
                ))}
                {row.avg_sec > 0 ? (
                  <span className="pill pill--sm" style={{ color: "var(--ink)" }}>
                    <ClockIcon size={13} /> {t("projects.avg_sec")}:{" "}
                    <span className="mono">{fmtClockDuration(row.avg_sec)}</span>
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function prefixOf(goal: string): string {
  if (goal === "contact") return "goals.topic";
  if (goal === "social") return "goals.network";
  if (goal === "entry_cta") return "goals.card";
  return "goals.topic";
}

export function Goals({
  rows,
  filters,
  onPatch,
}: {
  rows: Overview["goals"];
  filters: Filters;
  onPatch: (patch: Partial<Filters>) => void;
}) {
  const { t } = useI18n();
  const total = rows.reduce((sum, row) => sum + row.sessions, 0);

  return (
    <div className="card flex h-full flex-col p-5 md:p-6">
      <CardTitle right={<span className="text-[12.5px] text-ink-faint">{fmtNum(total)}</span>}>
        {t("goals.title")}
      </CardTitle>
      {total === 0 ? (
        <Empty>{t("goals.empty")}</Empty>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => {
            const detail = Object.entries(row.topics ?? {}).concat(
              Object.entries(row.networks ?? {}).concat(Object.entries(row.cards ?? {})),
            );
            return (
              <button
                key={row.key}
                type="button"
                className="filter-row w-full px-2 py-1.5 text-left"
                data-active={filters.goal === row.key ? "true" : undefined}
                onClick={() => onPatch({ goal: filters.goal === row.key ? undefined : row.key })}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-ink">
                    <GoalIcon goal={row.key} />
                    <span className="name">{t(`goals.${row.key}`)}</span>
                  </span>
                  <span className="mono text-[12px] text-ink-faint">
                    {row.sessions} · {fmtPct(row.share)}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={row.share} muted={row.key === "project"} />
                </div>
                {detail.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {detail.map(([key, count]) => (
                      <span key={`${row.key}-${key}`} className="badge">
                        {t(`${prefixOf(row.key)}.${key}`)}: {count}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type InteractiveTab = "stack" | "assistant" | "cmdk";

export function Interactive({ data, onOpenSession }: { data: Overview; onOpenSession: (sid: string) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<InteractiveTab>("stack");
  const stackMax = Math.max(1, ...data.stack.map((row) => row.count));

  return (
    <div className="card flex h-full flex-col p-5 md:p-6">
      <CardTitle
        right={
          <span className="mono text-[12px] text-ink-faint">
            {data.stack_modes["3d"] ? `${t("interactive.mode3d")} ${data.stack_modes["3d"]}` : ""}
            {data.stack_modes["2d"] ? ` · ${t("interactive.mode2d")} ${data.stack_modes["2d"]}` : ""}
          </span>
        }
      >
        {t("interactive.title")}
      </CardTitle>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: "stack", label: t("interactive.stack") },
          { key: "assistant", label: t("interactive.assistant") },
          { key: "cmdk", label: t("interactive.cmdk") },
        ]}
      />

      <div className="mt-3 min-h-0 flex-1">
        {tab === "stack" ? (
          data.stack.length === 0 ? (
            <Empty>{t("interactive.stack.empty")}</Empty>
          ) : (
            <div className="space-y-2">
              {data.stack.map((row) => (
                <div key={row.key} className="flex items-center gap-3">
                  <span className="name w-[110px] shrink-0 truncate">{row.key}</span>
                  <Bar value={(row.count / stackMax) * 100} muted={row.count < stackMax} />
                  <span className="mono w-6 shrink-0 text-right text-[12px] text-ink-faint">{row.count}</span>
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === "assistant" ? (
          <div>
            <div className="mb-2 flex gap-4 text-[12.5px] text-ink-faint">
              <span>
                {t("interactive.opens")}: <span className="mono text-ink-dim">{data.assistant.opens}</span>
              </span>
              <span>
                {t("interactive.asks")}: <span className="mono text-ink-dim">{data.assistant.asks}</span>
              </span>
            </div>
            {data.assistant.questions.length === 0 ? (
              <Empty>{t("interactive.questions.empty")}</Empty>
            ) : (
              <ul className="scroll-thin max-h-[260px] space-y-2 overflow-y-auto pr-1">
                {data.assistant.questions.map((question, index) => (
                  <li key={`${question.ts}-${index}`} className="border border-line-2 bg-bg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[12px] text-ink-faint">{fmtClock(question.ts)}</span>
                      <span className="flex items-center gap-1.5">
                        <Badge>{question.lang || "—"}</Badge>
                        <Badge tone="warn">{t(`interactive.via.${question.via}`)}</Badge>
                      </span>
                    </div>
                    <div className="mt-1 text-[13.5px] leading-snug text-ink">{question.query}</div>
                    <button
                      type="button"
                      onClick={() => onOpenSession(question.session)}
                      className="mono mt-1 inline-block text-[12px] text-accent hover:underline"
                    >
                      → {question.session.slice(0, 12)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "cmdk" ? (
          <div>
            <div className="mb-2 text-[12.5px] text-ink-faint">
              {t("interactive.opens")}: <span className="mono text-ink-dim">{data.cmdk.opens}</span>
            </div>
            {data.cmdk.commands.length === 0 ? (
              <Empty>{t("interactive.commands.empty")}</Empty>
            ) : (
              <div className="space-y-1.5">
                {data.cmdk.commands.map((row) => (
                  <div key={row.command} className="flex items-center justify-between gap-2 border-b border-line-2 pb-1.5">
                    <span className="name truncate">{row.command}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {row.group ? <span className="badge">{row.group}</span> : null}
                      <span className="mono text-[12px] text-ink-faint">{row.count}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Clicks({ data }: { data: Overview }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"outbound" | "buttons">("outbound");
  const rows = tab === "outbound" ? data.clicks.outbound : data.clicks.buttons;
  const max = Math.max(1, ...rows.map((row) => row.clicks));

  return (
    <div className="card flex h-full flex-col p-5 md:p-6 lg:col-span-2">
      <CardTitle right={<span className="mono text-[12px] text-ink-faint">§03c</span>}>
        {t("clicks.title")}
      </CardTitle>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: "outbound", label: t("clicks.outbound") },
          { key: "buttons", label: t("clicks.buttons") },
        ]}
      />
      <div className="mt-3">
        {rows.length === 0 ? (
          <Empty>{t("clicks.empty")}</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.key} className="border-b border-line-2 pb-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="text-ink-dim">
                      <SourceIcon kind={row.key} />
                    </span>
                    <span className="name truncate" title={row.key}>
                      {row.key}
                    </span>
                  </span>
                  <span className="mono shrink-0 text-[12px] text-ink-faint">
                    {t("clicks.clicks", { n: row.clicks })}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={(row.clicks / max) * 100} muted={row.clicks < max} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function IntelligenceSection({
  data,
  filters,
  onPatch,
  onOpenSession,
}: {
  data: Overview;
  filters: Filters;
  onPatch: (patch: Partial<Filters>) => void;
  onOpenSession: (sid: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section>
      <SectionHead
        index="§03"
        title={t("section.03")}
        right={<Pill small>{fmtNum(data.funnel.home_sessions)} {t("funnel.home")}</Pill>}
      />
      <div className="grid gap-3.5 md:gap-4 lg:grid-cols-2">
        <Funnel data={data.funnel} />
        <Interactive data={data} onOpenSession={onOpenSession} />
        <ProjectsMatrix rows={data.projects} filters={filters} onPatch={onPatch} />
        <Goals rows={data.goals} filters={filters} onPatch={onPatch} />
        <Clicks data={data} />
      </div>
    </section>
  );
}
