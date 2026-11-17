import { useI18n } from "../i18n";
import { fmtClock, fmtGap } from "../lib/format";
import { describeEvent, tagColor, type TimelineEvent } from "../lib/describe";
import { EventIcon } from "./Icons";

export function SessionTimeline({ events, dense }: { events: TimelineEvent[]; dense?: boolean }) {
  const { t, lang } = useI18n();
  const exits = events.filter((event) => event.name === "exit");
  const lastExitId = exits.length ? exits[exits.length - 1].id : null;
  // Alt+Tab sends exit{reason:"hidden"}; only the closing exit belongs on the timeline.
  const visible = events.filter(
    (event) =>
      event.name !== "ping" &&
      !(event.name === "exit" && event.id !== lastExitId && String(event.props?.reason ?? "") === "hidden"),
  );

  if (visible.length === 0) {
    return <div className="py-8 text-center text-[13px] text-ink-faint">{t("detail.noEvents")}</div>;
  }

  return (
    <ol className={`relative ${dense ? "ml-0.5 pl-4" : "ml-1 pl-5"} border-l border-line-2`}>
      {visible.map((event) => (
        <li key={event.id} className="relative pb-4 last:pb-0">
          <span
            className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full"
            style={{ background: tagColor(event.name) }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-[12px] text-ink-dim">{fmtClock(event.ts)}</span>
            {event.gap ? <span className="mono text-[12px] text-ink-faint">{fmtGap(event.gap, lang)}</span> : null}
            <span className="badge" style={{ color: tagColor(event.name) }}>
              <EventIcon name={event.name} size={12} />
              {t(`event.${event.name}`) === `event.${event.name}` ? event.name : t(`event.${event.name}`)}
            </span>
            {event.path ? (
              <span className="mono max-w-[240px] truncate text-[12px] text-ink-faint">{event.path}</span>
            ) : null}
          </div>
          <div className="mt-1 text-[13.5px] leading-snug text-ink">{describeEvent(event, t)}</div>
        </li>
      ))}
    </ol>
  );
}
