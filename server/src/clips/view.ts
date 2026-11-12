// 키리누키 → API 응답 모양
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { ClipRow } from "./store";
import { CLIP_TAGS, MOMENT_IDS, clipTagById, type ClipTagDef } from "./vocab";
import { VOTE_MARGIN } from "./store";
import { coStarsFor, recommendFor, type BundleId } from "./recommend";
import { ytChannelUrl, ytThumb } from "../youtube/view";

export interface ClipTagOut {
  id: string;
  label: string;
  emoji: string;
  kind: ClipTagDef["kind"];
}

export interface ClipOut {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  channelTitle: string | null;
  channelUrl: string;
  vtubers: { platform: Platform; channelId: string; name: string }[];
  category: ClipTagOut | null;
  moments: ClipTagOut[];
  topic: string | null;
  summary: string | null;
  /** 버모아 좋아요 수 */
  likes: number;
  /** 대표 순간 (moments[0]) */
  primaryMoment: ClipTagOut | null;
  /** 사건·밈 이름 */
  event: string | null;
  /** 원본 방송 다시보기 */
  source: { url: string; platform: "chzzk" | "soop" | "youtube" } | null;
  /** 원본 방송 날짜 (KST YYYY-MM-DD) */
  sourceDate: string | null;
}

const sourcePlatform = (key: string | null): "chzzk" | "soop" | "youtube" | null =>
  key?.startsWith("chzzk:") ? "chzzk" : key?.startsWith("soop:") ? "soop" : key?.startsWith("youtube:") ? "youtube" : null;

const tagOut = (id: string | null): ClipTagOut | null => {
  const t = id ? clipTagById(id) : undefined;
  return t ? { id: t.id, label: t.label, emoji: t.emoji, kind: t.kind } : null;
};

export function toClipOuts(store: SqliteStore, rows: ClipRow[]): ClipOut[] {
  const names = store.channelNames(rows.flatMap((r) => r.vtubers.map((v) => v.channelId)));
  return rows.map((r) => ({
    videoId: r.videoId,
    title: r.title,
    publishedAt: r.publishedAt,
    thumbnailUrl: ytThumb(r.videoId),
    channelTitle: r.channelTitle,
    channelUrl: ytChannelUrl(r.ytChannelId),
    vtubers: r.vtubers.map((v) => ({ ...v, name: names.get(v.channelId) ?? v.channelId })),
    category: tagOut(r.category),
    moments: r.moments.map(tagOut).filter((t): t is ClipTagOut => !!t),
    topic: r.topic,
    summary: r.summary,
    likes: r.likes,
    primaryMoment: tagOut(r.primaryMoment),
    event: r.event,
    source:
      r.sourceUrl && sourcePlatform(r.sourceKey)
        ? { url: r.sourceUrl, platform: sourcePlatform(r.sourceKey) as "chzzk" | "soop" | "youtube" }
        : null,
    sourceDate: r.sourceDate,
  }));
}

/** 태그 목록 + 클립 수 (모음 페이지 태그 바) */
export function clipTagsWithCounts(store: SqliteStore): (ClipTagOut & { count: number })[] {
  const counts = store.clips.tagCounts();
  return CLIP_TAGS.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, kind: t.kind, count: counts.get(t.id) ?? 0 }));
}

export interface RecBundleOut {
  id: BundleId;
  title: string;
  items: { clip: ClipOut; reason: string }[];
}

/** 클립 상세 + 추천 묶음 (recommend.ts) */
export function clipDetail(store: SqliteStore, videoId: string) {
  const row = store.clips.getClip(videoId);
  if (!row) return null;
  const recs = recommendFor(store, row);
  const flat = recs.flatMap((b) => b.items.map((i) => i.row));
  const [clip, ...outs] = toClipOuts(store, [row, ...flat]);
  let k = 0;
  const bundles: RecBundleOut[] = recs.map((b) => ({
    id: b.id,
    title: b.title,
    items: b.items.map((i) => ({ clip: outs[k++]!, reason: i.reason })),
  }));
  const of = (id: BundleId) => bundles.find((b) => b.id === id)?.items.map((i) => i.clip) ?? [];
  return {
    clip: clip!,
    bundles,
    // 예전 화면 호환
    sameVtuber: of("same_vtuber"),
    otherVtuber: of("same_scene"),
    tagVotes: clipTagVotes(store, videoId),
    voteMargin: VOTE_MARGIN,
  };
}

/** 프로필의 키리누키 요약: 개수 · 최근 클립 · 자주 나오는 순간/카테고리 · 자주 하는 것(주제) */
export function clipsForProfile(store: SqliteStore, platform: Platform, channelId: string) {
  const vtuber = { platform, channelId };
  const { total, clips } = store.clips.listClips({ vtuber, limit: 12, offset: 0 });
  if (total === 0) return null;
  const counts = store.clips.tagCounts(vtuber);
  const traits = CLIP_TAGS.filter((t) => (counts.get(t.id) ?? 0) >= 2 && t.id !== "etc")
    .map((t) => ({ ...tagOut(t.id)!, count: counts.get(t.id)! }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  return {
    total,
    clips: toClipOuts(store, clips),
    traits,
    topics: store.clips.topTopics(vtuber, 5).filter((t) => t.count >= 2),
    /** 클립에 자주 같이 나오는 버튜버 */
    coStars: coStarsFor(store, vtuber, 8),
  };
}

/** 태그 투표 화면: '어떤 순간' 태그마다 Claude 가 붙였는지 · 찬반 수 · 지금 보이는지 */
export function clipTagVotes(store: SqliteStore, videoId: string) {
  return store.clips
    .tagVoteView(videoId)
    .filter((v) => MOMENT_IDS.includes(v.tag))
    .map((v) => ({
      ...tagOut(v.tag)!,
      ai: v.ai,
      up: v.up,
      down: v.down,
      shown: v.ai ? v.down - v.up < VOTE_MARGIN : v.up - v.down >= VOTE_MARGIN,
    }));
}
