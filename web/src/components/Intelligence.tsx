import { useState } from "react";

import { useI18n } from "../i18n";
import { fmtClock, fmtNum, fmtPct } from "../lib/format";
import type { Filters, Overview } from "../lib/types";
import { Badge, Bar, Empty, Pill, SectionHead, Tabs } from "./ui";

export function Funnel({ data }: { data: Overview["funnel"] }) {
  const { t } = useI18n();
  const steps = data.steps;
  return (
    <div className="card flex h-full flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">{t("funnel.title")}</h3>
        <span className="mono text-[10px] text-ink-faint">
          {fmtNum(data.home_sessions)} {t("funnel.home")}
        </span>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 border border-line-2 bg-bg px-2.5 py-2">
        <span className="mono text-[10px] text-ink-dim">{t("funnel.loader")}</span>
        <span className="mono text-[10px] text-ink-faint">
          {t("funnel.loader.sub", {
            complete: Math.round(data.loader.complete_pct),
            skip: Math.round(data.loader.skip_pct),
          })}
        </span>
      </div>

      <div className="space-y-1.5">
        {steps.map((step, index) => {
          const label =
            step.key === "loader" ? t("funnel.loader") : t(`funnel.section.${step.key}`);
          return (
            <div key={step.key} className="group">
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[10px] text-ink-dim">
                  {label}
                  <span className="ml-2 text-ink-faint">
                    {fmtNum(step.sessions)} {t("funnel.sessions")}
                  </span>
                </span>
                <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  {Math.round(step.share)}%
                  {index > 0 && step.drop < 0 ? (
                    <span className="ml-2" style={{ color: "var(--danger)" }}>
                      {Math.round(step.drop)}%
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-1">
                <Bar value={step.share} muted={index % 2 === 1} />
              </div>
            </div>
          );
        })}
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
  return (
    <div className="card flex h-full flex-col p-4">
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">{t("projects.title")}</h3>
      {!hasData ? (
        <Empty>{t("projects.empty")}</Empty>
      ) : (
        <div className="-mx-1 overflow-x-auto no-scrollbar">
          <table className="grid-table">
            <thead>
              <tr>
                <th>{t("projects.title")}</th>
                <th>{t("projects.select")}</th>
                <th>{t("projects.details")}</th>
                <th>{t("projects.case_page")}</th>
                <th>{t("projects.github")}</th>
                <th>{t("projects.demo")}</th>
                <th>{t("projects.clone")}</th>
                <th className="w-[110px]">{t("projects.score")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-active={filters.project === row.id ? "true" : undefined}
                  onClick={() => onPatch({ project: filters.project === row.id ? undefined : row.id })}
                >
                  <td className="mono whitespace-nowrap text-[11px]">{t(`projects.${row.id}`)}</td>
                  <td className="mono">{row.select || "·"}</td>
                  <td className="mono">{row.details || "·"}</td>
                  <td className="mono">{row.case_page || "·"}</td>
                  <td className="mono">{row.github || "·"}</td>
                  <td className="mono">{row.demo || "·"}</td>
                  <td className="mono">{row.clone_copy || "·"}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Bar value={row.weight} />
                      <span className="mono w-8 text-right text-[10px] text-ink-faint">{row.score}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">{t("goals.title")}</h3>
        <span className="mono text-[10px] text-ink-faint">{fmtNum(total)}</span>
      </div>
      {total === 0 ? (
        <Empty>{t("goals.empty")}</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const detail = Object.entries(row.topics ?? {}).concat(
              Object.entries(row.networks ?? {}).concat(Object.entries(row.cards ?? {})),
            );
            return (
              <button
                key={row.key}
                type="button"
                className="w-full border border-transparent px-1 py-1 text-left transition-colors hover:border-line-2 hover:bg-bg3"
                data-active={filters.goal === row.key ? "true" : undefined}
                onClick={() => onPatch({ goal: filters.goal === row.key ? undefined : row.key })}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-[11px]">{t(`goals.${row.key}`)}</span>
                  <span className="mono text-[10px] text-ink-faint">
                    {row.sessions} · {fmtPct(row.share)}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={row.share} muted={row.key === "project"} />
                </div>
                {detail.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {detail.map(([key, count]) => (
                      <span key={`${row.key}-${key}`} className="pill pill--sm">
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

export function Interactive({ data }: { data: Overview }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<InteractiveTab>("stack");
  const stackMax = Math.max(1, ...data.stack.map((row) => row.count));

  return (
    <div className="card flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">{t("interactive.title")}</h3>
        <span className="mono text-[9px] text-ink-faint">
          {data.stack_modes["3d"] ? `${t("interactive.mode3d")} ${data.stack_modes["3d"]}` : ""}
          {data.stack_modes["2d"] ? ` · ${t("interactive.mode2d")} ${data.stack_modes["2d"]}` : ""}
        </span>
      </div>
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
            <div className="space-y-1.5">
              {data.stack.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <span className="mono w-[92px] shrink-0 truncate text-[11px]">{row.key}</span>
                  <Bar value={(row.count / stackMax) * 100} muted={row.count < stackMax} />
                  <span className="mono w-6 text-right text-[10px] text-ink-faint">{row.count}</span>
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === "assistant" ? (
          <div>
            <div className="mono mb-2 flex gap-3 text-[10px] text-ink-faint">
              <span>
                {t("interactive.opens")}: {data.assistant.opens}
              </span>
              <span>
                {t("interactive.asks")}: {data.assistant.asks}
              </span>
            </div>
            {data.assistant.questions.length === 0 ? (
              <Empty>{t("interactive.questions.empty")}</Empty>
            ) : (
              <ul className="scroll-thin max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                {data.assistant.questions.map((question, index) => (
                  <li key={`${question.ts}-${index}`} className="border border-line-2 bg-bg px-2 py-1.5">
                    <div className="mono flex items-center justify-between gap-2 text-[9px] text-ink-faint">
                      <span>{fmtClock(question.ts)}</span>
                      <span className="flex items-center gap-1">
                        <Badge>{question.lang || "—"}</Badge>
                        <Badge tone="warn">{t(`interactive.via.${question.via}`) === `interactive.via.${question.via}` ? question.via : t(`interactive.via.${question.via}`)}</Badge>
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-snug text-ink-dim">{question.query}</div>
                    <a
                      href={`/session/${encodeURIComponent(question.session)}`}
                      className="mono mt-1 inline-block text-[9px] text-accent hover:underline"
                    >
                      → {question.session.slice(0, 12)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "cmdk" ? (
          <div>
            <div className="mono mb-2 text-[10px] text-ink-faint">
              {t("interactive.opens")}: {data.cmdk.opens}
            </div>
            {data.cmdk.commands.length === 0 ? (
              <Empty>{t("interactive.commands.empty")}</Empty>
            ) : (
              <div className="space-y-1">
                {data.cmdk.commands.map((row) => (
                  <div key={row.command} className="flex items-center justify-between gap-2 border-b border-line-2 pb-1">
                    <span className="mono truncate text-[11px]">{row.command}</span>
                    <span className="flex items-center gap-2">
                      {row.group ? <span className="pill pill--sm">{row.group}</span> : null}
                      <span className="mono text-[10px] text-ink-faint">{row.count}</span>
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

export function IntelligenceSection({
  data,
  filters,
  onPatch,
}: {
  data: Overview;
  filters: Filters;
  onPatch: (patch: Partial<Filters>) => void;
}) {
  const { t } = useI18n();
  return (
    <section>
      <SectionHead
        index="§03"
        title={t("section.03")}
        right={<Pill small>{t("funnel.home")}: {data.funnel.home_sessions}</Pill>}
      />
      <div className="grid gap-2 lg:grid-cols-2">
        <Funnel data={data.funnel} />
        <Interactive data={data} />
        <ProjectsMatrix rows={data.projects} filters={filters} onPatch={onPatch} />
        <Goals rows={data.goals} filters={filters} onPatch={onPatch} />
      </div>
    </section>
  );
}
