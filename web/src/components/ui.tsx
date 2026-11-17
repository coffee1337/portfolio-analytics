import type { ReactNode } from "react";

import { fmtDelta } from "../lib/format";

export function SectionHead({
  index,
  title,
  right,
}: {
  index: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="kicker kicker--accent">{index}</span>
        <h2 className="section-title">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <h3 className="card-title">{children}</h3>
      {right}
    </div>
  );
}

export function Delta({ value, invert }: { value: number | null | undefined; invert?: boolean }) {
  const { text, tone: raw } = fmtDelta(value);
  const tone = invert && raw !== "dim" ? (raw === "ok" ? "danger" : "ok") : raw;
  const color = tone === "ok" ? "var(--ok)" : tone === "danger" ? "var(--danger)" : "var(--ink-faint)";
  return (
    <span className="mono text-[12px] font-semibold" style={{ color }}>
      {text}
    </span>
  );
}

export function Pill({
  children,
  active,
  tone,
  onClick,
  title,
  small,
}: {
  children: ReactNode;
  active?: boolean;
  tone?: "accent" | "ok" | "warn" | "danger";
  onClick?: () => void;
  title?: string;
  small?: boolean;
}) {
  const className = `pill${small ? " pill--sm" : ""}`;
  if (!onClick) {
    return (
      <span className={className} data-active={active ? "true" : undefined} data-tone={tone} title={title}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      data-active={active ? "true" : undefined}
      data-tone={tone}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="pill pill--sm shrink-0"
          data-active={value === item.key ? "true" : undefined}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, muted }: { value: number; muted?: boolean }) {
  const width = Math.max(2, Math.min(100, value));
  return (
    <div className="bar-track w-full">
      <div className={`bar-fill${muted ? " bar-fill--muted" : ""}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Sparkline({
  values,
  height = 30,
  tone = "var(--accent)",
}: {
  values: number[];
  height?: number;
  tone?: string;
}) {
  if (values.length === 0) return <div style={{ height }} />;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? 100 / (values.length - 1) : 100;
  const points = values.map((value, index) => {
    const x = values.length > 1 ? index * step : 50;
    const y = 26 - (value / max) * 22;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L100,28 L0,28 Z`;
  const id = `spark-${Math.abs(values.reduce((acc, value, index) => acc + value * (index + 1), 0))}`;
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      width="100%"
      height={height}
      aria-hidden="true"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity={0.26} />
          <stop offset="100%" stopColor={tone} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={tone}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-[13px] text-ink-faint">{children}</div>;
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "accent" | "ok" | "warn" | "danger";
}) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="kicker mb-1">{label}</div>
      <div className="mono text-[13px] text-ink">{value}</div>
      {hint ? <div className="mono mt-0.5 text-[12px] text-ink-faint">{hint}</div> : null}
    </div>
  );
}
