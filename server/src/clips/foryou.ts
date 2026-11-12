// 내 취향 추천 (R5) — 이 사람이 본·좋아한 클립에서 자주 본 버튜버·게임·순간을 뽑아, 아직 안 본 클립을 이유와 함께 추천한다.
// 본 기록·취향 설정은 요청마다 받아 계산에만 쓰고 저장하지 않는다 (로그인 사용자의 기록 저장은 사용자 DB 쪽).
// 순위 가산점은 버모아 자체 신호(좋아요)·최신만 (YouTube 조회수 미사용).
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { ClipRow } from "./store";
import { MOMENT_IDS, clipTagById } from "./vocab";
import { isGenericTopic, topicKey } from "./topics";
import { bigrams, jaccard } from "./similar";

export interface ForYouInput {
  /** 본 클립 (최근 것이 뒤) */
  watched: string[];
  liked: string[];
  /** 관심 없음 */
  disliked: string[];
  /** 숨긴 키리누키 채널 (UC…) */
  hiddenChannels: string[];
  /** 덜 볼 주제 */
  hiddenTopics: string[];
  /** 좋아하는 순간 (분류 어휘 id) */
  moments: string[];
  limit: number;
}

export interface ForYouItem {
  row: ClipRow;
  reason: string;
}

export interface ForYouBasis {
  vtubers: string[];
  topics: string[];
  moments: string[];
}

const DAY = 86_400_000;
const vkey = (v: { platform: Platform; channelId: string }) => `${v.platform}:${v.channelId}`;

function boost(c: ClipRow): number {
  const ageDays = (Date.now() - Date.parse(c.publishedAt)) / DAY;
  return 0.6 * Math.log1p(c.likes) + 0.8 * Math.max(0, 1 - ageDays / 45);
}

function top<K>(m: Map<K, number>, n: number): K[] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function norm(m: Map<string, number>): Map<string, number> {
  const max = Math.max(1, ...m.values());
  return new Map([...m.entries()].map(([k, v]) => [k, v / max]));
}

export function forYou(store: SqliteStore, input: ForYouInput): { items: ForYouItem[]; basis: ForYouBasis } {
  const repo = store.clips;
  const seen = new Set([...input.watched, ...input.disliked]);
  const hiddenCh = new Set(input.hiddenChannels);
  const hiddenTp = new Set(input.hiddenTopics.map(topicKey));
  const prefMoments = input.moments.filter((m) => MOMENT_IDS.includes(m));

  // 1) 취향: 최근 본 것일수록·좋아한 것일수록 무겁게
  const recent = input.watched.slice(-300);
  const history = repo.clipsByIds([...new Set([...recent, ...input.liked])]);
  const liked = new Set(input.liked);
  const rank = new Map(recent.map((id, i) => [id, i]));
  const vt = new Map<string, number>();
  const tp = new Map<string, number>();
  const mo = new Map<string, number>();
  const topicName = new Map<string, string>();
  const vtRef = new Map<string, { platform: Platform; channelId: string }>();
  for (const c of history) {
    const w = (liked.has(c.videoId) ? 2 : 1) * (0.5 + 0.5 * ((rank.get(c.videoId) ?? recent.length) / Math.max(1, recent.length)));
    c.vtubers.forEach((v, i) => {
      vt.set(vkey(v), (vt.get(vkey(v)) ?? 0) + (i === 0 ? w : w * 0.5));
      vtRef.set(vkey(v), v);
    });
    if (c.topic && !isGenericTopic(c.topic)) {
      const k = topicKey(c.topic);
      tp.set(k, (tp.get(k) ?? 0) + w);
      topicName.set(k, c.topic);
    }
    const m = c.primaryMoment ?? c.moments[0];
    if (m && m !== "funny") mo.set(m, (mo.get(m) ?? 0) + w);
  }
  for (const m of prefMoments) mo.set(m, (mo.get(m) ?? 0) + Math.max(3, history.length / 4));
  const vtN = norm(vt);
  const tpN = norm(tp);
  const moN = norm(mo);

  const topVt = top(vt, 6);
  const topTp = top(tp, 3);
  const topMo = top(mo, 2);
  const names = store.channelNames(topVt.map((k) => vtRef.get(k)!.channelId));

  // 2) 후보: 자주 본 버튜버·게임·순간의 클립 + 요즘 인기 (새로운 것도 보이게)
  const pool = new Map<string, ClipRow>();
  const add = (rows: ClipRow[]) => rows.forEach((r) => pool.set(r.videoId, r));
  for (const k of topVt) add(repo.vtuberClips([vtRef.get(k)!], "", 120));
  for (const k of topTp) add(repo.topicClips(topicName.get(k)!, "", 100));
  for (const m of topMo) add(repo.primaryMomentClips(m, "", 100));
  add(repo.listClips({ sort: "likes", limit: 80, offset: 0 }).clips);
  add(repo.listClips({ limit: 80, offset: 0 }).clips);

  // 3) 점수와 이유
  const scored = [...pool.values()]
    .filter(
      (c) =>
        !seen.has(c.videoId) &&
        !hiddenCh.has(c.ytChannelId) &&
        !(c.topic && hiddenTp.has(topicKey(c.topic))) &&
        c.vtubers.length > 0,
    )
    .map((c) => {
      // 주인공이 자주 본 버튜버면 그대로, 조연으로만 나오면 약하게 (합방 클립이 한 사람으로 도배되지 않게)
      const main = c.vtubers[0]!;
      const vMain = vtN.get(vkey(main)) ?? 0;
      let vCo = 0;
      let coName = "";
      for (const v of c.vtubers.slice(1)) {
        const s = 0.4 * (vtN.get(vkey(v)) ?? 0);
        if (s > vCo) {
          vCo = s;
          coName = names.get(v.channelId) ?? "";
        }
      }
      const vBest = Math.max(vMain, vCo);
      const vName = vMain >= vCo ? (names.get(main.channelId) ?? "") : coName;
      const tKey = c.topic && !isGenericTopic(c.topic) ? topicKey(c.topic) : "";
      const tScore = tKey ? (tpN.get(tKey) ?? 0) : 0;
      const m = c.primaryMoment ?? c.moments.find((x) => x !== "funny") ?? null;
      const mScore = m ? (moN.get(m) ?? 0) : 0;
      const parts = [
        { s: 3 * vBest, reason: vName ? `자주 본 ${vName}` : "" },
        { s: 2 * tScore, reason: c.topic ? `자주 본 ${c.topic}` : "" },
        { s: 1.5 * mScore, reason: m ? `좋아하는 순간 · ${clipTagById(m)?.label ?? m}` : "" },
      ];
      const best = parts.reduce((a, b) => (b.s > a.s ? b : a));
      const score = parts.reduce((a, b) => a + b.s, 0) + boost(c);
      return { row: c, score, reason: best.s > 0.15 && best.reason ? best.reason : "요즘 인기" };
    })
    .sort((a, b) => b.score - a.score);

  // 4) 다양하게: 한 키리누키 채널 2개·한 버튜버 4개·같은 이유 5개까지, 같은 장면 재업로드는 하나만
  const out: ForYouItem[] = [];
  const perCh = new Map<string, number>();
  const perVt = new Map<string, number>();
  const perReason = new Map<string, number>();
  const grams: Set<string>[] = [];
  for (const s of scored) {
    if (out.length >= input.limit) break;
    const ch = perCh.get(s.row.ytChannelId) ?? 0;
    const mainV = s.row.vtubers[0] ? vkey(s.row.vtubers[0]) : "";
    const vc = perVt.get(mainV) ?? 0;
    const rc = perReason.get(s.reason) ?? 0;
    if (ch >= 2 || vc >= 4 || (rc >= 5 && s.reason !== "요즘 인기")) continue;
    const g = bigrams(s.row.title.replace(/\[[^\]]*\]|【[^】]*】|#\S+/g, " "));
    if (grams.some((x) => jaccard(x, g) >= 0.75)) continue;
    grams.push(g);
    perCh.set(s.row.ytChannelId, ch + 1);
    perVt.set(mainV, vc + 1);
    perReason.set(s.reason, rc + 1);
    out.push({ row: s.row, reason: s.reason });
  }

  return {
    items: out,
    basis: {
      vtubers: topVt.slice(0, 3).map((k) => names.get(vtRef.get(k)!.channelId) ?? "").filter(Boolean),
      topics: topTp.map((k) => topicName.get(k) ?? k),
      moments: topMo.map((m) => clipTagById(m)?.label ?? m),
    },
  };
}
