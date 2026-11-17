import Link from "next/link";
import type { CalendarEvent, CalendarEventType } from "@/types";

export const EVENT_EMOJI: Record<CalendarEventType, string> = {
  birthday: "🎂",
  anniversary: "🎉",
  days: "✨",
  debut: "🌱",
  debut_upcoming: "🐣",
  song: "🎵",
};

/** 일정이 가리키는 곳: 프로필(노래면 노래 탭) · 채널을 모르는 데뷔 예정은 신규 데뷔 페이지 */
export function eventHref(e: CalendarEvent): string {
  if (!e.vtuber) return "/debut";
  const base = `/vtuber/${e.vtuber.platform}/${encodeURIComponent(e.vtuber.channelId)}`;
  return e.type === "song" ? `${base}?tab=songs` : base;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "11월 17일 (월)" */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAY[d.getUTCDay()]})`;
}

/** 오늘·내일·D-n */
export function dDayLabel(date: string, today: string): string {
  const n = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n > 0 ? `D-${n}` : `${-n}일 전`;
}

/** 일정 한 줄 (이모지 · 이름 · 무슨 날) */
export function EventLink({ e, compact }: { e: CalendarEvent; compact?: boolean }) {
  const title = `${e.name} ${e.label}${e.song ? ` — ${e.song.title}` : ""}${e.agency ? ` (${e.agency})` : ""}`;
  return (
    <Link
      href={eventHref(e)}
      prefetch={false}
      title={title}
      className={`group flex min-w-0 items-center gap-1 ${compact ? "text-[11px] leading-4" : "text-sm"}`}
    >
      <span aria-hidden className="shrink-0">
        {EVENT_EMOJI[e.type]}
      </span>
      <span className="min-w-0 truncate">
        <span className="font-semibold group-hover:text-accent transition-colors">{e.name}</span>{" "}
        <span className="text-muted">{e.label}</span>
        {!compact && e.song ? <span className="text-muted-2"> · {e.song.title}</span> : null}
        {!compact && e.agency ? <span className="text-muted-2"> · {e.agency}</span> : null}
      </span>
    </Link>
  );
}

/** 날짜별로 묶기 */
export function groupByDate(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const m = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = m.get(e.date);
    if (list) list.push(e);
    else m.set(e.date, [e]);
  }
  return [...m.entries()];
}

/** 홈 '다가오는 기념일' — 날짜별 카드 가로 줄 */
export function UpcomingEvents({ events, today }: { events: CalendarEvent[]; today: string }) {
  const days = groupByDate(events).slice(0, 7);
  if (days.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="다가오는 기념일">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">다가오는 기념일</h2>
        <Link href="/calendar" className="text-sm text-accent hover:underline">
          캘린더 보기 →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {days.map(([date, list]) => (
          <div
            key={date}
            className={`flex w-56 shrink-0 flex-col gap-1.5 rounded-xl border p-3 ${
              date === today ? "border-accent/60 bg-accent/5" : "border-border bg-surface"
            }`}
          >
            <p className="text-xs">
              <span className={`font-bold ${date === today ? "text-accent" : ""}`}>{dDayLabel(date, today)}</span>{" "}
              <span className="text-muted-2">{dayLabel(date)}</span>
            </p>
            {list.slice(0, 4).map((e, i) => (
              <EventLink key={`${e.name}-${e.type}-${i}`} e={e} />
            ))}
            {list.length > 4 ? (
              <Link href={`/calendar?month=${date.slice(0, 7)}#d-${date}`} className="text-xs text-muted-2 hover:text-accent">
                +{list.length - 4}개 더
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CalendarNotice() {
  return (
    <p className="text-xs text-muted-2">
      ※ 생일·데뷔일은 버모아가 공식 프로필·위키·기사에서 모은 정보라 틀릴 수 있어요. 틀린 내용은 문의로 알려 주세요. 오리지널곡은 공식 유튜브
      채널에 올라온 날 기준이에요.
    </p>
  );
}
