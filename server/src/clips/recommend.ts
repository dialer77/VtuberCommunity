// 버모아 키리누키 추천 — "왜 이 클립인지" 말할 수 있는 묶음으로 추천한다 (유튜브식 블랙박스 추천과 다른 점).
//  ① 같은 방송의 다른 장면   원본 다시보기 링크가 같거나, 같은 버튜버의 같은 날 방송
//  ② 같은 사건의 다른 클립   사건·밈 이름이 같음 (올라온 순서대로)
//  ③ OO의 비슷한 순간         같은 버튜버 · 같은 게임 · 같은 대표 순간
//  ④ 다른 버튜버의 비슷한 장면 같은 게임 또는 같은 대표 순간(웃음 제외)
//  ⑤ 자주 함께 나오는 버튜버   클립에 같이 출연한 횟수로 만든 관계
// 한 클립은 한 묶음에만 나온다 (위 순서가 우선). 한 키리누키 채널이 묶음을 독차지하지 않게 하고, 같은 장면 재업로드는 거른다.
// 순위에는 YouTube 조회수가 아니라 버모아 자체 신호(좋아요)만 쓴다 (docs/youtube-api.md 정책).
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { ClipRow } from "./store";
import { clipTagById } from "./vocab";
import { bigrams, jaccard, similarity, textOf } from "./similar";
import { isGenericTopic } from "./topics";

export const BUNDLE_IDS = ["same_source", "same_event", "same_vtuber", "same_scene", "co_star"] as const;
export type BundleId = (typeof BUNDLE_IDS)[number];

export interface RecItem {
  row: ClipRow;
  /** 카드에 붙는 추천 이유 ("같은 방송", "봉누도2 · 레전드" 등) */
  reason: string;
}

export interface RecBundle {
  id: BundleId;
  title: string;
  items: RecItem[];
}

/** 묶음당 최대 개수 — 화면은 8개를 보여 주고, 나머지는 이미 본 클립을 뒤로 보낼 때 채우는 여유분 */
const PER_BUNDLE = 12;
const DAY = 86_400_000;

const sameVt = (a: { platform: Platform; channelId: string }, b: { platform: Platform; channelId: string }) =>
  a.platform === b.platform && a.channelId === b.channelId;
const sharesVtuber = (a: ClipRow, b: ClipRow) => a.vtubers.some((x) => b.vtubers.some((y) => sameVt(x, y)));
const momentLabel = (id: string | null) => (id ? clipTagById(id)?.label ?? id : null);
const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");

/** 이름 + 와/과 (마지막 글자 받침 기준) */
function wa(name: string): string {
  const c = name.trim().slice(-1).charCodeAt(0);
  const hasBatchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return `${name}${hasBatchim ? "과" : "와"}`;
}

/** "11월 8일" */
function md(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** 버모아 자체 신호 가산점: 좋아요·최신 (조회수는 쓰지 않음) */
function boost(c: ClipRow): number {
  const ageDays = (Date.now() - Date.parse(c.publishedAt)) / DAY;
  return 0.5 * Math.log1p(c.likes) + 0.5 * Math.max(0, 1 - ageDays / 60);
}

/** 두 클립이 왜 비슷한지 짧게 */
function reasonOf(base: ClipRow, c: ClipRow, fallback: string): string {
  const parts: string[] = [];
  if (base.topic && !isGenericTopic(base.topic) && norm(base.topic) === norm(c.topic)) parts.push(c.topic!);
  if (c.primaryMoment && c.primaryMoment === base.primaryMoment && c.primaryMoment !== "funny") parts.push(momentLabel(c.primaryMoment)!);
  else {
    const shared = c.moments.find((m) => m !== "funny" && base.moments.includes(m));
    if (shared) parts.push(momentLabel(shared)!);
  }
  return parts.length ? parts.join(" · ") : fallback;
}

/**
 * 점수 순서대로 고르되: 이미 다른 묶음에 나온 클립 제외, 한 키리누키 채널은 perChannel 개까지,
 * 제목이 거의 같은 클립(재업로드)은 하나만.
 */
function pickDiverse(
  scored: { row: ClipRow; score: number; reason: string }[],
  used: Set<string>,
  perChannel: number,
  limit = PER_BUNDLE,
): RecItem[] {
  const out: RecItem[] = [];
  const perCh = new Map<string, number>();
  const grams: Set<string>[] = [];
  for (const s of scored) {
    if (out.length >= limit) break;
    if (used.has(s.row.videoId)) continue;
    const n = perCh.get(s.row.ytChannelId) ?? 0;
    if (n >= perChannel) continue;
    const g = bigrams(s.row.title.replace(/\[[^\]]*\]|【[^】]*】|#\S+/g, " "));
    if (grams.some((x) => jaccard(x, g) >= 0.75)) continue;
    grams.push(g);
    perCh.set(s.row.ytChannelId, n + 1);
    used.add(s.row.videoId);
    out.push({ row: s.row, reason: s.reason });
  }
  return out;
}

export function recommendFor(store: SqliteStore, clip: ClipRow): RecBundle[] {
  const repo = store.clips;
  const used = new Set<string>([clip.videoId]);
  const bundles: RecBundle[] = [];
  const main = clip.vtubers[0] ?? null;
  const names = store.channelNames(clip.vtubers.map((v) => v.channelId));
  const mainName = main ? names.get(main.channelId) ?? null : null;
  const grams = bigrams(textOf(clip));
  const push = (id: BundleId, title: string, items: RecItem[]) => {
    if (items.length) bundles.push({ id, title, items });
  };

  // ① 같은 방송의 다른 장면 — 방송 흐름대로 (올라온 순서)
  const src = repo.sameSourceClips(clip, 40).map((row) => ({
    row,
    score: 0,
    reason: row.sourceKey && row.sourceKey === clip.sourceKey ? "같은 방송" : `같은 날 방송${row.sourceDate ? ` · ${md(row.sourceDate)}` : ""}`,
  }));
  push("same_source", `같은 방송의 다른 장면${clip.sourceDate ? ` · ${md(clip.sourceDate)}` : ""}`, pickDiverse(src, used, 4));

  // ② 같은 사건의 다른 클립 — 올라온 순서대로
  if (clip.event) {
    const ev = repo.eventClips(clip.event, clip.videoId, 40).map((row) => ({ row, score: 0, reason: clip.event! }));
    push("same_event", `'${clip.event}' 다른 클립`, pickDiverse(ev, used, 3));
  }

  // ③ 같은 버튜버의 비슷한 순간 (비슷한 게 모자라면 인기·최신 클립으로 채움)
  if (main) {
    const pool = repo.vtuberClips([main], clip.videoId, 300);
    const scored = pool
      .map((row) => {
        const sim = similarity(clip, row, grams);
        return { row, sim, score: sim + boost(row), reason: reasonOf(clip, row, row.likes ? "인기 클립" : "최근 클립") };
      })
      .sort((a, b) => Number(b.sim >= 1) - Number(a.sim >= 1) || b.score - a.score);
    push("same_vtuber", `${mainName ?? "같은 버튜버"}의 비슷한 순간`, pickDiverse(scored, used, 2));
  }

  // ④ 다른 버튜버의 비슷한 장면 — 같은 게임이거나 같은 대표 순간(웃음은 너무 흔해 제외)
  {
    const pool = new Map<string, ClipRow>();
    // 일반 주제('저챗' 등)만 같은 건 비슷한 장면으로 보지 않는다
    if (clip.topic && !isGenericTopic(clip.topic)) for (const r of repo.topicClips(clip.topic, clip.videoId, 200)) pool.set(r.videoId, r);
    if (clip.primaryMoment && clip.primaryMoment !== "funny") {
      for (const r of repo.primaryMomentClips(clip.primaryMoment, clip.videoId, 200)) pool.set(r.videoId, r);
    }
    const scored = [...pool.values()]
      .filter((row) => row.vtubers.length > 0 && !sharesVtuber(clip, row))
      .map((row) => ({ row, score: similarity(clip, row, grams) + boost(row), reason: reasonOf(clip, row, "비슷한 장면") }))
      .filter((s) => s.score >= 2)
      .sort((a, b) => b.score - a.score);
    push("same_scene", "다른 버튜버의 비슷한 장면", pickDiverse(scored, used, 2));
  }

  // ⑤ 자주 함께 나오는 버튜버 — 같이 나온 클립을 먼저, 모자라면 그 버튜버의 클립
  if (main) {
    const partners = repo.coStars(main, 4).filter((p) => p.count >= 2);
    const pNames = store.channelNames(partners.map((p) => p.channelId));
    const scored: { row: ClipRow; score: number; reason: string }[] = [];
    partners.forEach((p, i) => {
      const name = pNames.get(p.channelId) ?? p.channelId;
      for (const row of repo.vtuberClips([p], clip.videoId, 60)) {
        const together = row.vtubers.some((v) => sameVt(v, main));
        scored.push({
          row,
          // 관계가 강한 버튜버 먼저, 같이 나온 클립 먼저
          score: (partners.length - i) * 2 + (together ? 3 : 0) + boost(row),
          reason: together ? `${wa(name)} 함께` : `${name} 클립`,
        });
      }
    });
    scored.sort((a, b) => b.score - a.score);
    push("co_star", `${mainName ? wa(mainName) : "이 버튜버와"} 자주 함께 나오는 버튜버`, pickDiverse(scored, used, 2));
  }

  return bundles;
}

/**
 * 이어보기 후보 (플레이어가 클립이 끝나면 이 순서로 안 본 클립을 고른다):
 * 같은 방송(이 클립 다음에 올라온 장면 먼저) → 같은 사건 → 같은 버튜버 → 다른 버튜버 → 자주 함께
 */
export function upNextFor(store: SqliteStore, clip: ClipRow, limit = 30): (RecItem & { bundle: BundleId })[] {
  const out: (RecItem & { bundle: BundleId })[] = [];
  for (const b of recommendFor(store, clip)) {
    let items = b.items;
    if (b.id === "same_source") {
      const after = items.filter((i) => i.row.publishedAt > clip.publishedAt);
      const before = items.filter((i) => i.row.publishedAt <= clip.publishedAt);
      items = [...after, ...before];
    }
    for (const i of items) out.push({ ...i, bundle: b.id });
  }
  return out.slice(0, limit);
}

/** 프로필용: 클립에 자주 같이 나오는 버튜버 (2번 이상) */
export function coStarsFor(store: SqliteStore, vtuber: { platform: Platform; channelId: string }, limit = 8) {
  const list = store.clips.coStars(vtuber, limit).filter((p) => p.count >= 2);
  const names = store.channelNames(list.map((p) => p.channelId));
  return list.map((p) => ({ ...p, name: names.get(p.channelId) ?? p.channelId }));
}
