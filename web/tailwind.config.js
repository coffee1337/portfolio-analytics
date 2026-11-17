/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
        pixel: ["var(--font-pixel)"],
      },
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        bg2: "var(--bg-2)",
        "bg-3": "var(--bg-3)",
        bg3: "var(--bg-3)",
        ink: "var(--ink)",
        "ink-dim": "var(--ink-dim)",
        dim: "var(--ink-dim)",
        "ink-faint": "var(--ink-faint)",
        faint: "var(--ink-faint)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        "line-strong": "var(--line-strong)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        accent2: "var(--accent-2)",
        "accent-ink": "var(--accent-ink)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        danger: "var(--danger)",
        header: "var(--header)",
      },
    },
  },
  plugins: [],
};
