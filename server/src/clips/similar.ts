// 비슷한 클립 — 버모아 분류(주제·순간·카테고리) + 제목·요약 글자 2-gram 유사도.
// 별도 모델 없이 서버 안에서 계산한다 (로컬). 후보는 같은 버튜버·같은 태그·같은 주제의 최근 클립.
import type { ClipRepo, ClipRow } from "./store";
import { isGenericTopic } from "./topics";

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

export function bigrams(s: string): Set<string> {
  const t = norm(s);
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 대괄호 머리말("[유즈하 리코]")·해시태그는 버튜버 이름이라 글자 유사도에서 뺀다 */
export function textOf(c: ClipRow): string {
  return `${c.summary ?? ""} ${c.title.replace(/\[[^\]]*\]|【[^】]*】|#\S+/g, " ")}`;
}

export function similarity(a: ClipRow, b: ClipRow, aGrams = bigrams(textOf(a))): number {
  let s = 0;
  // 같은 원본 방송 · 같은 사건이 가장 강한 연결
  if (a.sourceKey && a.sourceKey === b.sourceKey) s += 6;
  if (a.event && a.event === b.event) s += 5;
  // 같은 게임·콘텐츠. '저챗'·'노래 방송' 같은 일반 주제는 같아도 약하게
  if (a.topic && b.topic && norm(a.topic) === norm(b.topic)) s += isGenericTopic(a.topic) ? 0.5 : 3;
  if (a.category && a.category === b.category) s += 1;
  // 대표 순간이 같으면 결이 비슷하다. 웃음은 대부분 클립에 붙어 있어 거의 구별이 안 되므로 약하게
  if (a.primaryMoment && a.primaryMoment === b.primaryMoment) s += a.primaryMoment === "funny" ? 0.3 : 1.5;
  for (const m of a.moments) if (b.moments.includes(m)) s += m === "funny" ? 0.3 : 1.2;
  s += 4 * jaccard(aGrams, bigrams(textOf(b)));
  return s;
}

const sharesVtuber = (a: ClipRow, b: ClipRow) =>
  a.vtubers.some((x) => b.vtubers.some((y) => x.platform === y.platform && x.channelId === y.channelId));

/** 같은 버튜버의 비슷한 클립 / 다른 버튜버의 비슷한 클립 */
export function findSimilar(repo: ClipRepo, clip: ClipRow, limit = 8): { same: ClipRow[]; other: ClipRow[] } {
  const pool = repo.similarPool(clip, 800);
  const grams = bigrams(textOf(clip));
  const scored = pool.map((c) => ({ c, s: similarity(clip, c, grams) }));
  const pick = (list: typeof scored, min: number) =>
    list
      .filter((x) => x.s >= min)
      .sort((x, y) => y.s - x.s || y.c.publishedAt.localeCompare(x.c.publishedAt))
      .slice(0, limit)
      .map((x) => x.c);
  return {
    same: pick(scored.filter((x) => sharesVtuber(clip, x.c)), 0.5),
    // 다른 버튜버는 주제나 순간이 실제로 겹칠 때만
    other: pick(scored.filter((x) => !sharesVtuber(clip, x.c) && x.c.vtubers.length > 0), 2),
  };
}
