import type { SessionDetail } from "./types";

export type TimelineEvent = SessionDetail["events"][number];
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

function prop(props: Record<string, unknown>, key: string, fallback = ""): string {
  const value = props[key];
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

export const GOAL_EVENTS = new Set(["resume", "contact_submit", "contact_copy", "social_click", "entry_cta"]);

export function tagColor(name: string): string {
  if (GOAL_EVENTS.has(name) || name === "project_action") return "var(--accent)";
  if (name.startsWith("project")) return "var(--accent-2)";
  if (name === "assistant" || name === "cmdk" || name === "stack_key") return "var(--warn)";
  return "var(--ink-faint)";
}

export function describeEvent(event: TimelineEvent, t: Translate): string {
  const props = event.props;
  switch (event.name) {
    case "pageview":
      return t("desc.pageview", { path: event.path || "/" });
    case "loader":
      return t(`desc.loader.${prop(props, "action", "complete")}`, {
        ms: prop(props, "elapsed_ms", "0"),
      });
    case "section":
      return t("desc.section", { id: prop(props, "id", prop(props, "section")) });
    case "scroll":
      return t("desc.scroll", { value: Math.round(Number(props.scroll ?? props.depth ?? props.max_scroll ?? 0)) });
    case "entry_cta":
      return t("desc.entry_cta", { card: t(`goals.card.${prop(props, "card", "hire")}`) });
    case "stack_key":
      return t("desc.stack_key", { tech: prop(props, "tech"), mode: prop(props, "mode", "3d") });
    case "project_select":
      return t("desc.project_select", {
        project: prop(props, "project"),
        via: prop(props, "via", "explorer"),
      });
    case "project_filter":
      return t("desc.project_filter", { filter: prop(props, "filter", "All") });
    case "project_details":
      return t("desc.project_details", { project: prop(props, "project") });
    case "project_action":
      return t("desc.project_action", {
        action: prop(props, "action"),
        project: prop(props, "project"),
      });
    case "resume":
      return t(`desc.resume.${prop(props, "action", "download_pdf")}`);
    case "contact_submit":
      return t("desc.contact_submit", { topic: t(`goals.topic.${prop(props, "topic", "other")}`) });
    case "contact_copy":
      return t("desc.contact_copy", { channel: prop(props, "channel", "email") });
    case "social_click":
      return t("desc.social_click", { network: prop(props, "network", "telegram") });
    case "assistant": {
      const action = prop(props, "action", "ask");
      if (action === "ask") return t("desc.assistant.ask", { query: prop(props, "query") });
      return t(`desc.assistant.${action}`);
    }
    case "cmdk":
      return prop(props, "action", "open") === "select"
        ? t("desc.cmdk.select", { command: prop(props, "command") })
        : t("desc.cmdk.open");
    case "theme_switch":
      return t("desc.theme_switch", { to: prop(props, "to") });
    case "lang_switch":
      return t("desc.lang_switch", { to: prop(props, "to") });
    case "click":
    case "ui":
      return t(`desc.${event.name}`, { text: prop(props, "text", prop(props, "target", "—")) });
    case "vitals":
      return t("desc.vitals", { lcp: prop(props, "lcp", "—"), inp: prop(props, "inp", "—") });
    case "exit":
      return t("desc.exit");
    case "ping":
      return t("desc.ping");
    default:
      return t("desc.unknown", { name: event.name });
  }
}
