import type { Metadata } from "next";
import Link from "next/link";
import type { CalendarEvent, CalendarEventType } from "@/types";
import { getCalendar } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { CalendarNotice, EVENT_EMOJI, EventLink, dDayLabel, dayLabel, groupByDate } from "@/components/calendar-events";

export const dynamic = "force-dynamic";

type Search = Promise<{ month?: string; type?: string }>;

const FILTERS: { id: string; label: string; types: CalendarEventType[] }[] = [
  { id: "birthday", label: `${EVENT_EMOJI.birthday} 생일`, types: ["birthday"] },
  { id: "debut", label: `${EVENT_EMOJI.anniversary} 데뷔 기념일`, types: ["anniversary", "days", "debut"] },
  { id: "upcoming", label: `${EVENT_EMOJI.debut_upcoming} 데뷔 예정`, types: ["debut_upcoming"] },
  { id: "song", label: `${EVENT_EMOJI.song} 오리지널곡`, types: ["song"] },
];

function kstMonth(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
}
function validMonth(m: string | undefined): string | undefined {
  const x = m && /^(\d{4})-(\d{2})$/.exec(m);
  return x && Number(x[2]) >= 1 && Number(x[2]) <= 12 ? m : undefined;
}
function shiftMonth(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthTitle(m: string): string {
  return `${Number(m.slice(0, 4))}년 ${Number(m.slice(5))}월`;
}
function href(month: string, type?: string): string {
  const sp = new URLSearchParams();
  if (month !== kstMonth()) sp.set("month", month);
  if (type) sp.set("type", type);
  const s = sp.toString();
  return s ? `/calendar?${s}` : "/calendar";
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { month: raw, type } = await searchParams;
  const month = validMonth(raw) ?? kstMonth();
  const cal = await getCalendar(month);
  const births = [...new Set((cal?.events ?? []).filter((e) => e.type === "birthday").map((e) => e.name))].slice(0, 6);
  const mo = Number(month.slice(5));
  return {
    title: `버튜버 기념일 캘린더 — ${monthTitle(month)} 생일·데뷔 기념일`,
    description: `${mo}월 버튜버 생일·데뷔 n주년·데뷔 예정·새 오리지널곡을 날짜별로 모았어요.${births.length ? ` ${mo}월 생일: ${births.join(", ")} 등.` : ""}`,
    alternates: { canonical: href(month) },
    // 종류만 거른 화면은 같은 내용 — 검색엔진에는 달별 기본 화면만
    ...(type ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CalendarPage({ searchParams }: { searchParams: Search }) {
  const { month: raw, type } = await searchParams;
  const month = validMonth(raw) ?? kstMonth();
  const cal = await getCalendar(month);
  const filter = FILTERS.find((f) => f.id === type);
  const all = cal?.events ?? [];
  const events = filter ? all.filter((e) => filter.types.includes(e.type)) : all;
  const today = cal?.today ?? "";
  const byDate = new Map(groupByDate(events));
  const todays = month === today.slice(0, 7) ? (byDate.get(today) ?? []) : [];

  // 달력 칸: 1일의 요일만큼 비우고 1일 ~ 말일
  const [y, mo] = month.split("-").map(Number) as [number, number];
  const lead = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="기념일 캘린더"
        description="버튜버 생일, 데뷔 n주년·n일, 데뷔 예정, 새 오리지널곡을 날짜별로 모았어요. 이름을 누르면 프로필로 가요."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(shiftMonth(month, -1), type)} scroll={false} aria-label="이전 달" className="rounded-md border border-border px-2.5 py-1 text-sm hover:border-accent/60">
            ←
          </Link>
          <h2 className="min-w-28 text-center text-lg font-extrabold tabular-nums">{monthTitle(month)}</h2>
          <Link href={href(shiftMonth(month, 1), type)} scroll={false} aria-label="다음 달" className="rounded-md border border-border px-2.5 py-1 text-sm hover:border-accent/60">
            →
          </Link>
          {month !== kstMonth() ? (
            <Link href={href(kstMonth(), type)} scroll={false} className="text-sm text-accent hover:underline">
              이번 달
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={href(month)}
            scroll={false}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              !filter ? "border-accent bg-accent text-accent-fg font-semibold" : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
            }`}
          >
            전체 <span className="tabular-nums opacity-70">{all.length}</span>
          </Link>
          {FILTERS.map((f) => {
            const n = all.filter((e) => f.types.includes(e.type)).length;
            if (n === 0 && filter?.id !== f.id) return null;
            return (
              <Link
                key={f.id}
                href={href(month, filter?.id === f.id ? undefined : f.id)}
                scroll={false}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  filter?.id === f.id
                    ? "border-accent bg-accent text-accent-fg font-semibold"
                    : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
                }`}
              >
                {f.label} <span className="tabular-nums opacity-70">{n}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {todays.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-accent/50 bg-accent/5 p-4" aria-label="오늘의 기념일">
          <p className="text-sm font-bold text-accent">오늘 · {dayLabel(today)}</p>
          {todays.map((e, i) => (
            <EventLink key={`${e.name}-${e.type}-${i}`} e={e} />
          ))}
        </section>
      ) : null}

      {cal === null ? (
        <p className="py-12 text-center text-muted">캘린더를 불러오지 못했어요. 잠시 뒤에 다시 와 주세요.</p>
      ) : (
        <>
          {/* 넓은 화면: 달력 */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-xs font-semibold text-muted">
              {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                <div key={d} className={`py-2 ${i === 0 ? "text-live" : ""}`}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const list = date ? (byDate.get(date) ?? []) : [];
                return (
                  <div
                    key={date ?? `x${i}`}
                    id={date ? `d-${date}` : undefined}
                    className={`min-h-24 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0 ${
                      date === today ? "bg-accent/5" : date ? "bg-surface" : "bg-surface-2/40"
                    }`}
                  >
                    {date ? (
                      <>
                        <p className={`mb-1 text-xs tabular-nums ${date === today ? "font-bold text-accent" : i % 7 === 0 ? "text-live" : "text-muted-2"}`}>
                          {Number(date.slice(8))}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {list.map((e, k) => (
                            <EventLink key={`${e.name}-${e.type}-${k}`} e={e} compact />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 좁은 화면: 날짜별 목록 */}
          <ol className="flex flex-col gap-3 md:hidden">
            {[...byDate.entries()].map(([date, list]) => (
              <li
                key={date}
                id={`m-${date}`}
                className={`flex flex-col gap-1.5 rounded-xl border p-3 ${date === today ? "border-accent/60 bg-accent/5" : "border-border bg-surface"}`}
              >
                <p className="text-xs">
                  <span className={`font-bold ${date === today ? "text-accent" : ""}`}>{dayLabel(date)}</span>{" "}
                  {today && date >= today ? <span className="text-muted-2">{dDayLabel(date, today)}</span> : null}
                </p>
                {list.map((e: CalendarEvent, k) => (
                  <EventLink key={`${e.name}-${e.type}-${k}`} e={e} />
                ))}
              </li>
            ))}
          </ol>

          {events.length === 0 ? (
            <p className="py-8 text-center text-muted">
              {filter ? "이 달에는 해당하는 기념일이 없어요." : "이 달의 기념일을 모으는 중이에요. 생일·데뷔일은 매일 조금씩 늘어나요."}
            </p>
          ) : null}
        </>
      )}

      <CalendarNotice />
    </div>
  );
}
