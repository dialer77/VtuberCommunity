// 소속사 명단 계산. 소속사 태그는 "이 사람이 어디 소속인가"라서, 방송 하나의 자가 태그로 판단하면 안 된다
// (소속사 관련 콘텐츠·리액션·월드컵 방송에서도 그 소속사 태그를 단다). 그래서:
//   1) 관측된 방송 중 그 소속사 태그를 단 비율이 60% 이상 + 최소 2회  → 멤버로 인정
//   2) 웹 데뷔 소식에서 소속사가 확인된 채널                           → 바로 인정 (데뷔 직후 신입)
//   3) 수동 추가(MANUAL_TAGS) / 수동 제외(MANUAL_DENY)                → 최우선
import { readFileSync } from "node:fs";
import { agencyIdsInText } from "./catalog";

/** 7~8월 기록으로 미리 계산해 둔 명단 (roster-seed.json) — 기록이 짧은 새 서버에서도 기존 멤버를 바로 인정 */
export function loadRosterSeed(): { channelId: string; agencies: string[] }[] {
  try {
    const raw = JSON.parse(readFileSync(new URL("./roster-seed.json", import.meta.url), "utf8")) as {
      channels: Record<string, { agencies: string[] }>;
    };
    return Object.entries(raw.channels).map(([channelId, v]) => ({ channelId, agencies: v.agencies }));
  } catch {
    return [];
  }
}

export const MIN_SHARE = 0.6;
export const MIN_BROADCASTS = 2;

export interface BroadcastTagRow {
  channelId: string;
  tags: string[];
}

/** channelId → 소속사 태그 id 목록 */
export function buildAgencyRoster(
  broadcasts: BroadcastTagRow[],
  debutAgencies: { channelId: string; agency: string }[],
  seed: { channelId: string; agencies: string[] }[] = [],
): Map<string, string[]> {
  const stats = new Map<string, { total: number; with: Map<string, number> }>();
  for (const b of broadcasts) {
    const s = stats.get(b.channelId) ?? { total: 0, with: new Map<string, number>() };
    s.total++;
    for (const id of agencyIdsInText(b.tags)) s.with.set(id, (s.with.get(id) ?? 0) + 1);
    stats.set(b.channelId, s);
  }
  const roster = new Map<string, Set<string>>();
  const add = (ch: string, id: string) => {
    const set = roster.get(ch) ?? new Set<string>();
    set.add(id);
    roster.set(ch, set);
  };
  for (const [ch, s] of stats) {
    for (const [id, n] of s.with) {
      if (n >= MIN_BROADCASTS && n / s.total >= MIN_SHARE) add(ch, id);
    }
  }
  for (const d of debutAgencies) {
    for (const id of agencyIdsInText([d.agency])) add(d.channelId, id);
  }
  for (const s of seed) for (const id of s.agencies) add(s.channelId, id);
  return new Map([...roster].map(([k, v]) => [k, [...v]]));
}
