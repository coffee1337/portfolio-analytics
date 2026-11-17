import type { ReactNode } from "react";

export interface IconProps {
  size?: number;
  className?: string;
}

function Glyph({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.45}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ source */

export function SourceIcon({ kind, ...props }: IconProps & { kind: string }) {
  const value = (kind || "").toLowerCase();
  if (value.includes("telegram") || value.includes("t.me")) {
    return (
      <Glyph {...props}>
        <path d="M14 2.6 1.9 7.2l3.4 1.3M14 2.6 10 14l-2.2-4.2M14 2.6 5.3 8.5" />
      </Glyph>
    );
  }
  if (value.includes("github")) {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="4" r="1.6" />
        <circle cx="4" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <path d="M8 5.6v3.2M8 8.8 4.6 10.8M8 8.8l3.4 2" />
      </Glyph>
    );
  }
  if (value.includes("linkedin")) {
    return (
      <Glyph {...props}>
        <rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.4" />
        <path d="M5 7v4M5 4.9v.2M8 11V7m0 1.4c.4-1 2.6-1.4 2.6.5V11" />
      </Glyph>
    );
  }
  if (value.includes("google")) {
    return (
      <Glyph {...props}>
        <path d="M13.6 8A5.6 5.6 0 1 1 11.4 3.5" />
        <path d="M8 8h5.4" />
      </Glyph>
    );
  }
  if (value.includes("yandex") || value.includes("ya.ru")) {
    return (
      <Glyph {...props}>
        <path d="M9.6 14V2.6H8.2A2.6 2.6 0 0 0 5.6 5.2c0 1.3.6 2.1 1.8 3L5.6 14" />
        <path d="M7.4 8.2 9.6 14" />
      </Glyph>
    );
  }
  if (value === "direct" || value === "" || value.includes("прямой")) {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="5.6" />
        <path d="M8 4.4v4.4l2.6 2.6" />
      </Glyph>
    );
  }
  return (
    <Glyph {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2.4 3 2.4 9 0 12M8 2C5.6 5 5.6 11 8 14" />
    </Glyph>
  );
}

/* ------------------------------------------------------------------ device */

export function DeviceIcon({ kind, ...props }: IconProps & { kind: string }) {
  if (kind === "mobile") {
    return (
      <Glyph {...props}>
        <rect x="4.6" y="1.4" width="6.8" height="13.2" rx="1.6" />
        <path d="M7 12.6h2" />
      </Glyph>
    );
  }
  if (kind === "tablet") {
    return (
      <Glyph {...props}>
        <rect x="2.6" y="2" width="10.8" height="12" rx="1.6" />
        <path d="M7.2 12h1.6" />
      </Glyph>
    );
  }
  if (kind === "bot") {
    return (
      <Glyph {...props}>
        <rect x="2.4" y="5.4" width="11.2" height="8" rx="1.6" />
        <path d="M8 2.4v3M5.6 8.6v.2M10.4 8.6v.2M6.4 11h3.2" />
      </Glyph>
    );
  }
  return (
    <Glyph {...props}>
      <rect x="1.6" y="2.6" width="12.8" height="8.4" rx="1.2" />
      <path d="M5.6 13.4h4.8M8 11v2.4" />
    </Glyph>
  );
}

/* ---------------------------------------------------------------------- os */

export function OsIcon({ name, ...props }: IconProps & { name: string }) {
  const value = (name || "").toLowerCase();
  if (value.includes("windows")) {
    return (
      <Glyph {...props}>
        <path d="M2.2 4.2 7 3.5v4.1H2.2zM8.6 3.3 13.8 2.6v5h-5.2zM2.2 8.8H7v4L2.2 12zM8.6 8.8h5.2v4.6l-5.2-.7z" />
      </Glyph>
    );
  }
  if (value.includes("ios") || value.includes("mac")) {
    return (
      <Glyph {...props}>
        <path d="M10.4 4.2c-.9 0-1.5.5-2.4.5s-1.6-.5-2.4-.5C3.8 4.2 2.6 5.8 2.6 8c0 2.8 1.8 5.4 3.2 5.4.7 0 1.2-.5 2.2-.5s1.4.5 2.1.5c1.4 0 3-2.4 3-4.4-1.4-.6-1.9-1.6-1.9-2.6 0-1 .5-1.7 1.2-2.1-.6-.7-1.4-.9-2-.9z" />
        <path d="M8.4 3.8c0-1 .8-2 1.8-2.2.1 1.1-.9 2.2-1.8 2.2z" />
      </Glyph>
    );
  }
  if (value.includes("android")) {
    return (
      <Glyph {...props}>
        <path d="M4 12.4h8V7.2a4 4 0 0 0-8 0z" />
        <path d="M4 9.4h8M5.6 3.6 4.4 2.2M10.4 3.6l1.2-1.4M6.4 6.4v.2M9.6 6.4v.2" />
      </Glyph>
    );
  }
  if (value.includes("chrome")) {
    return (
      <Glyph {...props}>
        <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.6" />
        <circle cx="8" cy="8" r="2.4" />
      </Glyph>
    );
  }
  return (
    <Glyph {...props}>
      <rect x="2" y="2.6" width="12" height="10.8" rx="1.4" />
      <path d="M4.6 6.4 6.4 8l-1.8 1.6M8.4 9.6h3" />
    </Glyph>
  );
}

/* ----------------------------------------------------------------- browser */

export function BrowserIcon({ name, ...props }: IconProps & { name: string }) {
  const value = (name || "").toLowerCase();
  if (value.includes("chrome")) {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="6" />
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 5.8h5.6M6.2 9.2 3.4 4.4M9.9 9.2l-2.7 4.6" />
      </Glyph>
    );
  }
  if (value.includes("safari")) {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="6" />
        <path d="M10.8 5.2 9 9 5.2 10.8 7 7z" />
      </Glyph>
    );
  }
  if (value.includes("firefox")) {
    return (
      <Glyph {...props}>
        <path d="M8 2.2c3.4 0 5.6 2.4 5.6 5.4 0 3.4-2.4 6.2-5.6 6.2S2.4 11 2.4 7.6c0-1.4.5-2.6 1.4-3.6-.2 1.4.4 2.2 1.2 2.4.6-2 1.8-3.4 3-4.2z" />
      </Glyph>
    );
  }
  if (value.includes("edge")) {
    return (
      <Glyph {...props}>
        <path d="M2.4 8.6c0-3 2.6-5.2 5.8-5.2 3 0 5.4 1.8 5.4 4.2 0 2-1.8 3.4-4 3.4H6.2c-2.2 0-3.8-1-3.8-2.4z" />
        <path d="M3 10.6c1 1.8 3 3 5.2 3 2.6 0 4.8-1.4 5.4-3.4" />
      </Glyph>
    );
  }
  if (value.includes("yandex")) {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="6" />
        <path d="M9.6 11.6V4.4H8.5A2.1 2.1 0 0 0 6.4 6.6c0 1 .5 1.7 1.5 2.4L6.4 11.6M8.2 6.9l1.4 4.7" />
      </Glyph>
    );
  }
  if (value.includes("opera")) {
    return (
      <Glyph {...props}>
        <ellipse cx="8" cy="8" rx="4.2" ry="6" />
      </Glyph>
    );
  }
  return <SourceIcon kind="external" {...props} />;
}

/* ------------------------------------------------------------------- goals */

export function GoalIcon({ goal, ...props }: IconProps & { goal: string }) {
  if (goal === "resume") {
    return (
      <Glyph {...props}>
        <path d="M4 1.8h5.2L12.4 5v9.2H4z" />
        <path d="M9 1.8V5h3.4M6 8h4M6 10.4h4" />
      </Glyph>
    );
  }
  if (goal === "contact") {
    return (
      <Glyph {...props}>
        <rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1.2" />
        <path d="m2.4 4.4 5.6 4 5.6-4" />
      </Glyph>
    );
  }
  if (goal === "contact_copy") {
    return (
      <Glyph {...props}>
        <rect x="5.4" y="5.4" width="8.2" height="8.2" rx="1.2" />
        <path d="M10.6 5.4V3.6a1.2 1.2 0 0 0-1.2-1.2H3.6A1.2 1.2 0 0 0 2.4 3.6v5.8a1.2 1.2 0 0 0 1.2 1.2h1.8" />
      </Glyph>
    );
  }
  if (goal === "social") {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="6" />
        <path d="M2.4 8h11.2M8 2.2c2.6 3.4 2.6 8.2 0 11.6M8 2.2c-2.6 3.4-2.6 8.2 0 11.6" />
      </Glyph>
    );
  }
  if (goal === "entry_cta") {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="5.6" />
        <circle cx="8" cy="8" r="2.2" />
        <circle cx="8" cy="8" r="0.4" fill="currentColor" />
      </Glyph>
    );
  }
  if (goal === "project") {
    return (
      <Glyph {...props}>
        <path d="M6 3.4h7.4v7.4M13.4 2.6 6.6 9.4" />
        <path d="M11.4 10v3.4H2.6V4.6H6" />
      </Glyph>
    );
  }
  return (
    <Glyph {...props}>
      <path d="M2.6 12.4V7.2M6.6 12.4V3.4M10.6 12.4V8.8M13.4 12.4V5.6" />
    </Glyph>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.6V8l2.6 1.8" />
    </Glyph>
  );
}

/* ------------------------------------------------------------------ events */

export function EventIcon({ name, ...props }: IconProps & { name: string }) {
  if (name === "pageview") {
    return (
      <Glyph {...props}>
        <path d="M2.2 3.4h11.6v9.2H2.2z" />
        <path d="M2.2 6h11.6M4.6 4.7h.2M6.4 4.7h.2" />
      </Glyph>
    );
  }
  if (name === "section") {
    return (
      <Glyph {...props}>
        <path d="M2.4 4h11.2M2.4 8h11.2M2.4 12h7.2" />
      </Glyph>
    );
  }
  if (name === "scroll") {
    return (
      <Glyph {...props}>
        <rect x="6" y="1.8" width="4" height="12.4" rx="2" />
        <path d="M8 4.6v2.4" />
      </Glyph>
    );
  }
  if (name === "stack_key") {
    return (
      <Glyph {...props}>
        <rect x="1.6" y="4.6" width="12.8" height="6.8" rx="1.2" />
        <path d="M4.4 8h.2M6.8 8h.2M9.2 8h.2M11.6 8h.2" />
      </Glyph>
    );
  }
  if (name === "assistant") {
    return (
      <Glyph {...props}>
        <rect x="2" y="4.4" width="12" height="8" rx="2.6" />
        <path d="M8 2v2.4M6 8h.2M10 8h.2M6.4 10.2h3.2" />
      </Glyph>
    );
  }
  if (name === "cmdk") {
    return (
      <Glyph {...props}>
        <rect x="2" y="2.6" width="12" height="10.8" rx="1.6" />
        <path d="M5.4 6.6 7.2 8l-1.8 1.4M8.6 9.4h2.6" />
      </Glyph>
    );
  }
  if (name === "theme_switch") {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="4" />
        <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1" />
      </Glyph>
    );
  }
  if (name === "lang_switch") {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="6" />
        <path d="M2.4 6h11.2M2.4 10h11.2M8 2.2c-2 2-2 9.6 0 11.6M8 2.2c2 2 2 9.6 0 11.6" />
      </Glyph>
    );
  }
  if (name === "loader") {
    return (
      <Glyph {...props}>
        <circle cx="8" cy="8" r="5.6" />
        <path d="M8 2.4A5.6 5.6 0 0 1 13.6 8" />
      </Glyph>
    );
  }
  if (name === "exit") {
    return (
      <Glyph {...props}>
        <path d="M9.4 2.6H4a1.4 1.4 0 0 0-1.4 1.4v8a1.4 1.4 0 0 0 1.4 1.4h5.4" />
        <path d="M10.6 5.4 13.2 8l-2.6 2.6M6.8 8h6.4" />
      </Glyph>
    );
  }
  if (name === "project_select") {
    return (
      <Glyph {...props}>
        <path d="M3.6 2.6h6.2a1 1 0 0 1 1 1v6.2" />
        <path d="M3.6 2.6v9.8h9.8" />
        <path d="M10.2 7.4 13.4 12l-2.2.5-1 2z" />
      </Glyph>
    );
  }
  if (name.startsWith("project")) {
    return <GoalIcon goal="project" {...props} />;
  }
  return (
    <Glyph {...props}>
      <path d="M3.4 2.6 8 8l-4.6 5.4M8.4 2.6 13 8l-4.6 5.4" />
    </Glyph>
  );
}
