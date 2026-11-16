import { useState } from "react";
import type { ReactNode } from "react";

import { useI18n } from "../i18n";
import { countryName, flag, fmtNum, fmtPct, shortPath } from "../lib/format";
import type { Filters, Overview, Row } from "../lib/types";
import { Badge, Bar, Empty, SectionHead, Tabs } from "./ui";

function RowLine({
  label,
  meta,
  value,
  share,
  active,
  onClick,
  badge,
  muted,
}: {
  label: string;
  meta?: string;
  value: number;
  share: number;
  active?: boolean;
  onClick?: () => void;
  badge?: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className="group w-full border border-transparent px-1 py-1 text-left transition-colors enabled:hover:border-line-2 enabled:hover:bg-bg3 disabled:cursor-default"
      data-active={active ? "true" : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono flex min-w-0 items-center gap-1.5 truncate text-[11px]" title={label}>
          <span className="truncate">{label}</span>
          {badge ? <Badge tone="warn">{badge}</Badge> : null}
        </span>
        <span className="mono shrink-0 text-[10px] text-ink-faint">
          {fmtNum(value)}
          {meta ? <span className="ml-1 opacity-70">{meta}</span> : null}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Bar value={share} muted={muted} />
        <span className="mono w-9 shrink-0 text-right text-[9px] text-ink-faint">{fmtPct(share)}</span>
      </div>
    </button>
  );
}

type AcqTab = "sources" | "utm";
type GeoTab = "countries" | "cities" | "isps";
type DevTab = "types" | "os" | "browsers" | "screens";
type PageTab = "entry" | "all" | "prefs";

function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="card flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export function AudienceSection({
  data,
  filters,
  onPatch,
}: {
  data: Overview;
  filters: Filters;
  onPatch: (patch: Partial<Filters>) => void;
}) {
  const { t, lang } = useI18n();
  const [acq, setAcq] = useState<AcqTab>("sources");
  const [geo, setGeo] = useState<GeoTab>("countries");
  const [dev, setDev] = useState<DevTab>("types");
  const [pages, setPages] = useState<PageTab>("entry");

  const toggle = (key: keyof Filters, value: string) =>
    onPatch({ [key]: filters[key] === value ? undefined : value } as Partial<Filters>);

  const list = (rows: Row[], render: (row: Row) => ReactNode) =>
    rows.length === 0 ? <Empty>{t("audience.empty")}</Empty> : <div>{rows.map(render)}</div>;

  return (
    <section>
      <SectionHead index="§04" title={t("section.04")} />
      <div className="grid gap-2 lg:grid-cols-2">
        <Panel title={t("audience.acquisition")}>
          <Tabs
            value={acq}
            onChange={setAcq}
            items={[
              { key: "sources", label: t("audience.sources") },
              { key: "utm", label: t("audience.utm") },
            ]}
          />
          <div className="mt-2">
            {acq === "sources"
              ? list(data.acquisition.sources, (row) => (
                  <RowLine
                    key={row.key}
                    label={row.key === "direct" ? t("audience.direct") : row.key}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.source === row.key}
                    onClick={() => toggle("source", row.key)}
                    muted={row.key === "direct"}
                  />
                ))
              : list(data.acquisition.utm, (row) => (
                  <RowLine
                    key={row.key}
                    label={row.key}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.utm === row.key}
                    onClick={() => toggle("utm", row.key)}
                  />
                ))}
          </div>
        </Panel>

        <Panel title={t("audience.geo")}>
          <Tabs
            value={geo}
            onChange={setGeo}
            items={[
              { key: "countries", label: t("audience.countries") },
              { key: "cities", label: t("audience.cities") },
              { key: "isps", label: t("audience.isps") },
            ]}
          />
          <div className="mt-2">
            {geo === "countries"
              ? list(data.geo.countries, (row) => (
                  <RowLine
                    key={row.key}
                    label={row.key === "unknown" ? t("app.unknown") : `${flag(row.key)} ${countryName(row.key, lang)}`}
                    meta={row.key}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.country === row.key}
                    onClick={() => toggle("country", row.key)}
                  />
                ))
              : null}
            {geo === "cities"
              ? list(data.geo.cities, (row) => (
                  <RowLine
                    key={row.key}
                    label={`${flag(row.country)} ${row.key}`}
                    meta={row.country}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.city === row.key}
                    onClick={() => toggle("city", row.key)}
                  />
                ))
              : null}
            {geo === "isps"
              ? list(data.geo.isps, (row) => (
                  <RowLine
                    key={row.key}
                    label={row.key === "unknown" ? t("app.unknown") : row.key}
                    meta={row.asn}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.isp === row.key}
                    onClick={() => toggle("isp", row.key)}
                    badge={row.datacenter ? t("audience.dc") : undefined}
                  />
                ))
              : null}
          </div>
        </Panel>

        <Panel title={t("audience.devices")}>
          <Tabs
            value={dev}
            onChange={setDev}
            items={[
              { key: "types", label: t("audience.types") },
              { key: "os", label: t("audience.os") },
              { key: "browsers", label: t("audience.browsers") },
              { key: "screens", label: t("audience.screens") },
            ]}
          />
          <div className="mt-2">
            {dev === "types"
              ? list(data.devices.types, (row) => (
                  <RowLine
                    key={row.key}
                    label={t(`audience.device.${row.key}`) === `audience.device.${row.key}` ? row.key : t(`audience.device.${row.key}`)}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.device === row.key}
                    onClick={() => toggle("device", row.key)}
                  />
                ))
              : null}
            {dev === "os"
              ? list(data.devices.os, (row) => (
                  <RowLine
                    key={row.key}
                    label={row.key === "unknown" ? t("app.unknown") : row.key}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.os === row.key}
                    onClick={() => toggle("os", row.key)}
                  />
                ))
              : null}
            {dev === "browsers"
              ? list(data.devices.browsers, (row) => (
                  <RowLine
                    key={row.key}
                    label={row.key === "unknown" ? t("app.unknown") : row.key}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.browser === row.key}
                    onClick={() => toggle("browser", row.key)}
                  />
                ))
              : null}
            {dev === "screens" ? list(data.devices.screens, (row) => (
              <RowLine
                key={row.key}
                label={row.key === "unknown" ? t("app.unknown") : row.key}
                value={row.sessions ?? 0}
                share={row.share ?? 0}
                muted
              />
            )) : null}
          </div>
        </Panel>

        <Panel title={t("audience.pages")}>
          <Tabs
            value={pages}
            onChange={setPages}
            items={[
              { key: "entry", label: t("audience.entry") },
              { key: "all", label: t("audience.all_pages") },
              { key: "prefs", label: t("audience.prefs") },
            ]}
          />
          <div className="mt-2">
            {pages === "entry"
              ? list(data.paths.entry, (row) => (
                  <RowLine
                    key={row.key}
                    label={shortPath(row.key)}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.path === row.key}
                    onClick={() => toggle("path", row.key)}
                  />
                ))
              : null}
            {pages === "all"
              ? list(data.paths.all, (row) => (
                  <RowLine
                    key={row.key}
                    label={shortPath(row.key)}
                    value={row.sessions ?? 0}
                    share={row.share ?? 0}
                    active={filters.path === row.key}
                    onClick={() => toggle("path", row.key)}
                  />
                ))
              : null}
            {pages === "prefs" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="kicker mb-1">lang</div>
                  {data.preferences.languages.length === 0 ? (
                    <Empty>{t("audience.empty")}</Empty>
                  ) : (
                    data.preferences.languages.map((row) => (
                      <div key={row.key} className="mb-1">
                        <div className="mono flex justify-between text-[10px]">
                          <span>{row.key.toUpperCase()}</span>
                          <span className="text-ink-faint">{fmtPct(row.share ?? 0)}</span>
                        </div>
                        <Bar value={row.share ?? 0} muted={row.key !== "ru"} />
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <div className="kicker mb-1">theme</div>
                  {data.preferences.themes.length === 0 ? (
                    <Empty>{t("audience.empty")}</Empty>
                  ) : (
                    data.preferences.themes.map((row) => (
                      <div key={row.key} className="mb-1">
                        <div className="mono flex justify-between text-[10px]">
                          <span>{row.key}</span>
                          <span className="text-ink-faint">{fmtNum(row.count ?? 0)}</span>
                        </div>
                        <Bar value={row.share ?? 0} muted={row.key !== "dark"} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </section>
  );
}
