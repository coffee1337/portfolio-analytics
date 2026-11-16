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
        bg2: "var(--bg-2)",
        bg3: "var(--bg-3)",
        ink: "var(--ink)",
        dim: "var(--ink-dim)",
        faint: "var(--ink-faint)",
        line: "var(--line)",
        accent: "var(--accent)",
        accent2: "var(--accent-2)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        danger: "var(--danger)",
      },
    },
  },
  plugins: [],
};
