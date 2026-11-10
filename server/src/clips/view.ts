// 키리누키 → API 응답 모양
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { ClipRow } from "./store";
import { CLIP_TAGS, clipTagById, type ClipTagDef } from "./vocab";
import { findSimilar } from "./similar";
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
}

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
  }));
}

/** 태그 목록 + 클립 수 (모음 페이지 태그 바) */
export function clipTagsWithCounts(store: SqliteStore): (ClipTagOut & { count: number })[] {
  const counts = store.clips.tagCounts();
  return CLIP_TAGS.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, kind: t.kind, count: counts.get(t.id) ?? 0 }));
}

/** 클립 상세 + 비슷한 클립 */
export function clipDetail(store: SqliteStore, videoId: string) {
  const row = store.clips.getClip(videoId);
  if (!row) return null;
  const { same, other } = findSimilar(store.clips, row);
  const [clip, ...rest] = toClipOuts(store, [row, ...same, ...other]);
  return { clip: clip!, sameVtuber: rest.slice(0, same.length), otherVtuber: rest.slice(same.length) };
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
  };
}
