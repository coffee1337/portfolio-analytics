import type { ReactNode } from "react";

import { fmtDelta } from "../lib/format";

export function SectionHead({ index, title, right }: { index: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b border-line pb-2">
      <div className="flex items-baseline gap-3">
        <span className="kicker">{index}</span>
        <span className="kicker opacity-40">/</span>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function Delta({ value, invert }: { value: number | null | undefined; invert?: boolean }) {
  const { text, tone: raw } = fmtDelta(value);
  const tone = invert && raw !== "dim" ? (raw === "ok" ? "danger" : "ok") : raw;
  const color = tone === "ok" ? "var(--ok)" : tone === "danger" ? "var(--danger)" : "var(--ink-faint)";
  return (
    <span className="mono text-[10px]" style={{ color }} title={text}>
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
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
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

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center font-mono text-[11px] text-ink-faint">{children}</div>;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: "accent" | "ok" | "warn" | "danger" }) {
  return (
    <span
      className="pixel inline-flex items-center border px-1 py-[1px] leading-none"
      style={{
        color:
          tone === "ok"
            ? "var(--ok)"
            : tone === "warn"
              ? "var(--warn)"
              : tone === "danger"
                ? "var(--danger)"
                : "var(--accent)",
        borderColor: "currentColor",
        opacity: 0.9,
      }}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="kicker mb-1">{label}</div>
      <div className="mono text-[12px] text-ink">{value}</div>
      {hint ? <div className="mono mt-0.5 text-[10px] text-ink-faint">{hint}</div> : null}
    </div>
  );
}
