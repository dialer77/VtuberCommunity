// 입문 모음 "OO 처음이라면" — 그 버튜버를 처음 보는 사람에게 보여 줄 키리누키를 고른다.
// 기준: 주인공으로 나온 클립 · 버모아 좋아요 · 레전드·명곡·감동 같은 대표 장면 · 다양성(게임·순간·키리누키 채널이 한쪽에 몰리지 않게).
// YouTube 조회수는 쓰지 않는다 (버모아 자체 신호와 분류만).
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { ClipRow } from "./store";
import { toClipOuts, type ClipOut } from "./view";
import { clipTagById } from "./vocab";
import { isSpecificTopic, topicKey } from "./topics";

const POOL = 400;
/** 처음 보는 사람에게 특히 좋은 순간 */
const STRONG: Record<string, number> = { legend: 4, singing: 3, touching: 2.5, banter: 2, chaos: 1.5, cute: 1.5, funny: 0.5 };

export interface IntroClip extends ClipOut {
  reason: string;
}

function score(c: ClipRow, vt: { platform: Platform; channelId: string }): number {
  const main = c.vtubers[0]?.platform === vt.platform && c.vtubers[0]?.channelId === vt.channelId;
  let s = main ? 3 : c.vtubers.length <= 3 ? 1 : 0;
  s += Math.log2(1 + c.likes) * 2;
  for (const m of c.moments) s += (STRONG[m] ?? 0) * (m === c.primaryMoment ? 1 : 0.5);
  if (c.event) s += 0.5; // 화제가 된 일
  return s;
}

function reasonOf(c: ClipRow, topTopics: Set<string>, main: boolean): string {
  if (c.likes >= 3) return `좋아요 ${c.likes}`;
  const m = c.primaryMoment ? clipTagById(c.primaryMoment) : null;
  if (m && m.id !== "funny") return `대표 장면 · ${m.label}`;
  if (c.topic && topTopics.has(topicKey(c.topic))) return `자주 하는 것 · ${c.topic}`;
  if (c.event) return `화제 · ${c.event}`;
  if (m) return `대표 장면 · ${m.label}`;
  if (isSpecificTopic(c.topic)) return c.topic;
  return main ? "주인공 클립" : "함께 나온 클립";
}

/** 입문 모음 (클립이 6개 미만이면 null) */
export function introClips(store: SqliteStore, vt: { platform: Platform; channelId: string }, n = 10): IntroClip[] | null {
  const pool = store.clips.vtuberPool(vt, POOL);
  if (pool.length < 6) return null;
  // 그 버튜버가 자주 하는 게임 (일반 주제 제외) 상위 3
  const tc = new Map<string, number>();
  for (const c of pool) if (isSpecificTopic(c.topic)) tc.set(topicKey(c.topic), (tc.get(topicKey(c.topic)) ?? 0) + 1);
  const topTopics = new Set([...tc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k));

  const ranked = pool.map((c) => ({ c, s: score(c, vt) })).sort((a, b) => b.s - a.s);
  const perTopic = new Map<string, number>();
  const perMoment = new Map<string, number>();
  const perChannel = new Map<string, number>();
  const picked: ClipRow[] = [];
  const seenTitles: string[] = [];
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const { c } of ranked) {
    if (picked.length >= n) break;
    const t = c.topic ? topicKey(c.topic) : "";
    const mo = c.primaryMoment ?? "";
    if (t && (perTopic.get(t) ?? 0) >= 2) continue;
    if (mo && (perMoment.get(mo) ?? 0) >= 3) continue;
    if ((perChannel.get(c.ytChannelId) ?? 0) >= 2) continue;
    // 재업로드·거의 같은 제목은 하나만
    const key = c.title.replace(/[\s\p{P}\p{S}]/gu, "").slice(0, 18);
    if (seenTitles.includes(key)) continue;
    seenTitles.push(key);
    picked.push(c);
    if (t) bump(perTopic, t);
    if (mo) bump(perMoment, mo);
    bump(perChannel, c.ytChannelId);
  }
  const outs = toClipOuts(store, picked);
  return outs.map((o, i) => {
    const c = picked[i]!;
    const main = c.vtubers[0]?.platform === vt.platform && c.vtubers[0]?.channelId === vt.channelId;
    return { ...o, reason: reasonOf(c, topTopics, main) };
  });
}
