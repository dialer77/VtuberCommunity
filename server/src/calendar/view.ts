// 기념일 캘린더 — 생일·데뷔 n주년·데뷔 n일·데뷔(예정)·오리지널곡 공개를 날짜별 일정으로 만든다 (날짜는 모두 KST).
// 재료: vtuber_facts(웹 수집·운영자) + debut_reports(데뷔 소식) + yt_songs(공식 채널 오리지널곡).
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { FactSource } from "./store";

export type CalendarEventType = "birthday" | "anniversary" | "days" | "debut" | "debut_upcoming" | "song";

export interface CalendarEvent {
  /** YYYY-MM-DD (KST) */
  date: string;
  type: CalendarEventType;
  /** "생일" · "데뷔 2주년" · "데뷔 100일" · "데뷔" · "데뷔 예정" · "오리지널곡 공개" */
  label: string;
  /** 표시 이름 */
  name: string;
  /** 버모아 프로필 (데뷔 예정이라 채널을 모르면 null) */
  vtuber: { platform: Platform; channelId: string } | null;
  years?: number;
  days?: number;
  song?: { videoId: string; title: string };
  /** 데뷔 예정의 소속 */
  agency?: string | null;
}

const DAY_MS = 86_400_000;
/** 데뷔 n일 기념 (데뷔한 날이 1일) */
const DAY_MILESTONES = [100, 500, 1000, 2000, 3000];
const TYPE_ORDER: Record<CalendarEventType, number> = { birthday: 0, anniversary: 1, days: 2, debut: 3, debut_upcoming: 4, song: 5 };

export function kstToday(nowMs = Date.now()): string {
  return new Date(nowMs + 9 * 3_600_000).toISOString().slice(0, 10);
}
function kstDateOf(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** y년의 MM-DD (윤년이 아니면 02-29 → 02-28) */
function onYear(y: number, md: string): string {
  return md === "02-29" && !isLeap(y) ? `${y}-02-28` : `${y}-${md}`;
}

/** 기념일 재료 한 명분 */
interface Entry {
  vtuber: { platform: Platform; channelId: string };
  name: string;
  birthday: string | null;
  debutDate: string | null;
}

/** 프로필이 있는 버튜버만 이름을 붙여 돌려준다 (치지직·SOOP 은 수집 채널, 유튜브는 보이는 유튜브 전용 버튜버) */
function visibleNames(store: SqliteStore, vts: { platform: Platform; channelId: string }[]): Map<string, string> {
  const names = store.channelNames(vts.filter((v) => v.platform !== "youtube").map((v) => v.channelId));
  for (const v of vts) {
    if (v.platform !== "youtube") continue;
    const y = store.youtube.getVtuber(v.channelId);
    if (y?.active) names.set(v.channelId, y.name);
  }
  return names;
}

/** 생일·데뷔일 재료 (웹 수집 + 데뷔 소식의 데뷔일). platform·channelId 를 주면 그 버튜버만 */
function entries(store: SqliteStore, only?: { platform: Platform; channelId: string }): Entry[] {
  const map = new Map<string, Entry>();
  const key = (p: Platform, id: string) => `${p}:${id}`;
  for (const f of only ? [store.facts.get(only.platform, only.channelId)].filter((x) => !!x) : store.facts.listKnown()) {
    map.set(key(f!.platform, f!.channelId), {
      vtuber: { platform: f!.platform, channelId: f!.channelId },
      name: f!.name,
      birthday: f!.birthday,
      debutDate: f!.debutDate,
    });
  }
  // 데뷔 소식에서 확인된 데뷔일 (웹 수집으로 못 찾았을 때)
  for (const r of store.listDebutReports(false, 2000)) {
    if (r.status !== "debuted" || !r.platform || !r.channelId) continue;
    if (only && (only.platform !== r.platform || only.channelId !== r.channelId)) continue;
    const k = key(r.platform, r.channelId);
    const cur = map.get(k);
    if (cur?.debutDate) continue;
    if (cur) cur.debutDate = r.debutDate;
    else map.set(k, { vtuber: { platform: r.platform, channelId: r.channelId }, name: r.name, birthday: null, debutDate: r.debutDate });
  }
  const list = [...map.values()];
  const names = visibleNames(store, list.map((e) => e.vtuber));
  return list.flatMap((e) => {
    const n = names.get(e.vtuber.channelId);
    return n ? [{ ...e, name: n }] : [];
  });
}

/** 한 사람의 기념일 (from~to, 양끝 포함) */
function personEvents(e: Entry, from: string, to: string, today: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const inRange = (d: string) => d >= from && d <= to;
  const y0 = Number(from.slice(0, 4));
  const y1 = Number(to.slice(0, 4));
  const base = { name: e.name, vtuber: e.vtuber };
  if (e.birthday) {
    for (let y = y0; y <= y1; y++) {
      const d = onYear(y, e.birthday);
      if (inRange(d)) out.push({ ...base, date: d, type: "birthday", label: "생일" });
    }
  }
  if (e.debutDate) {
    const dy = Number(e.debutDate.slice(0, 4));
    if (inRange(e.debutDate) && e.debutDate <= today) out.push({ ...base, date: e.debutDate, type: "debut", label: "데뷔" });
    for (let y = Math.max(y0, dy + 1); y <= y1; y++) {
      const d = onYear(y, e.debutDate.slice(5));
      if (inRange(d)) out.push({ ...base, date: d, type: "anniversary", label: `데뷔 ${y - dy}주년`, years: y - dy });
    }
    for (const n of DAY_MILESTONES) {
      const d = addDays(e.debutDate, n - 1);
      if (inRange(d)) out.push({ ...base, date: d, type: "days", label: `데뷔 ${n.toLocaleString("ko-KR")}일`, days: n });
    }
  }
  return out;
}

function sortEvents(list: CalendarEvent[]): CalendarEvent[] {
  return list.sort((a, b) => a.date.localeCompare(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name, "ko"));
}

/** 기간의 모든 기념일 (from~to, 양끝 포함, 최대 70일) */
export function calendarEvents(store: SqliteStore, from: string, to: string, opts: { songs?: boolean } = {}): CalendarEvent[] {
  if (to < from || Date.parse(to) - Date.parse(from) > 70 * DAY_MS) return [];
  const today = kstToday();
  const out: CalendarEvent[] = [];
  for (const e of entries(store)) out.push(...personEvents(e, from, to, today));
  // 데뷔 예정 (데뷔 소식). 채널을 알고 프로필이 있으면 연결
  const upcoming = store.listDebutReports(false, 2000).filter((r) => r.status === "upcoming" && r.debutDate >= from && r.debutDate <= to && r.debutDate >= today);
  const names = visibleNames(
    store,
    upcoming.flatMap((r) => (r.platform && r.channelId ? [{ platform: r.platform, channelId: r.channelId }] : [])),
  );
  for (const r of upcoming) {
    const linked = r.platform && r.channelId && names.has(r.channelId) ? { platform: r.platform, channelId: r.channelId } : null;
    out.push({ date: r.debutDate, type: "debut_upcoming", label: "데뷔 예정", name: r.name, vtuber: linked, agency: r.agency });
  }
  // 오리지널곡 공개 (공식 채널, 올린 날)
  if (opts.songs !== false) {
    const owners = store.youtube.ownerMap();
    const { songs } = store.youtube.listSongs({ kind: "original", limit: 400, offset: 0 });
    const songNames = visibleNames(store, [...new Set(songs.map((s) => owners.get(s.ytChannelId)).filter((o) => !!o))].map((o) => ({ platform: o!.platform, channelId: o!.channelId })));
    for (const s of songs) {
      const d = kstDateOf(s.publishedAt);
      const o = owners.get(s.ytChannelId);
      if (d < from || d > to || !o || !songNames.has(o.channelId)) continue;
      out.push({
        date: d,
        type: "song",
        label: "오리지널곡 공개",
        name: songNames.get(o.channelId)!,
        vtuber: { platform: o.platform, channelId: o.channelId },
        song: { videoId: s.videoId, title: s.title },
      });
    }
  }
  return sortEvents(out);
}

/** 한 달 (YYYY-MM) */
export function calendarMonth(store: SqliteStore, month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const valid = m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  const ym = valid ? month : kstToday().slice(0, 7);
  const [y, mo] = ym.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const from = `${ym}-01`;
  const to = `${ym}-${String(last).padStart(2, "0")}`;
  return { month: ym, today: kstToday(), events: calendarEvents(store, from, to) };
}

/** 오늘부터 days 일 (홈 '다가오는 기념일') — 노래 공개는 빼고 사람 기념일만 */
export function upcomingEvents(store: SqliteStore, days: number) {
  const today = kstToday();
  const to = addDays(today, Math.min(Math.max(days, 1), 60) - 1);
  return { today, events: calendarEvents(store, today, to, { songs: false }) };
}

/** 프로필: 생일·데뷔일 + 다음 기념일 (1년 안) */
export function factsForProfile(store: SqliteStore, platform: Platform, channelId: string) {
  const e = entries(store, { platform, channelId })[0];
  if (!e || (!e.birthday && !e.debutDate)) return null;
  const today = kstToday();
  const next = sortEvents(personEvents(e, today, addDays(today, 366), today).filter((x) => x.type !== "debut"))[0] ?? null;
  const f = store.facts.get(platform, channelId);
  const sources: FactSource[] = f?.sources ?? [];
  return {
    birthday: e.birthday,
    debutDate: e.debutDate,
    sources,
    next: next ? { date: next.date, label: next.label, dDay: Math.round((Date.parse(next.date) - Date.parse(today)) / DAY_MS) } : null,
  };
}
