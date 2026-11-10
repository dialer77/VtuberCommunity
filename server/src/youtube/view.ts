// 유튜브 연동 데이터 → API 응답 모양
import type { SqliteStore, LiveItem } from "../store/sqlite";
import type { Platform } from "../domain";
import type { LinkStatus, YtVideo } from "./store";

/** 방송 중 확인이 이만큼 끊기면 LIVE 에서 뺀다 */
const LIVE_STALE_MS = 10 * 60_000;

export const ytThumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
export const ytChannelUrl = (ytChannelId: string) => `https://www.youtube.com/channel/${ytChannelId}`;

export interface YoutubeVideoOut {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  /** null = 아직 상세를 모름 (키 없음·확인 전) */
  liveStatus: YtVideo["liveStatus"];
  scheduledAt: string | null;
  liveStartedAt: string | null;
  durationSec: number | null;
}

export interface YoutubeProfileOut {
  ytChannelId: string;
  title: string | null;
  handle: string | null;
  url: string;
  thumbnailUrl: string | null;
  /** auto = 자동 추정(틀릴 수 있음), manual = 운영자 확인 */
  status: Extract<LinkStatus, "auto" | "manual">;
  videos: YoutubeVideoOut[];
  /** 지금 유튜브에서 방송 중이면 그 영상 */
  live: (YoutubeVideoOut & { viewers: number | null }) | null;
}

function videoOut(v: YtVideo): YoutubeVideoOut {
  return {
    videoId: v.videoId,
    title: v.title,
    publishedAt: v.publishedAt,
    thumbnailUrl: ytThumb(v.videoId),
    liveStatus: v.liveStatus,
    scheduledAt: v.scheduledAt,
    liveStartedAt: v.liveStartedAt,
    durationSec: v.durationSec,
  };
}

/** 프로필의 유튜브 공식 채널 + 최신 영상 (매핑이 없으면 null) */
export function youtubeForProfile(store: SqliteStore, platform: Platform, channelId: string): YoutubeProfileOut | null {
  const repo = store.youtube;
  const link = repo.getLink(platform, channelId);
  if (!link || !link.ytChannelId || (link.status !== "auto" && link.status !== "manual")) return null;
  const ch = repo.getChannel(link.ytChannelId);
  const live = repo.listLiveVideos(LIVE_STALE_MS).find((v) => v.ytChannelId === link.ytChannelId) ?? null;
  return {
    ytChannelId: link.ytChannelId,
    title: ch?.title ?? null,
    handle: ch?.handle ?? link.ytHandle,
    url: ytChannelUrl(link.ytChannelId),
    thumbnailUrl: ch?.thumbnailUrl ?? null,
    status: link.status,
    videos: repo.listVideos(link.ytChannelId, 15).map(videoOut),
    live: live ? { ...videoOut(live), viewers: live.viewers } : null,
  };
}

/** LIVE 목록에 붙일 유튜브 방송. channelId 는 버튜버 주 채널(태그·프로필·최애 기준) */
export interface YoutubeLiveItem extends LiveItem {
  platform: "youtube";
  videoId: string;
  ytChannelId: string;
  /** 버튜버 주 채널 플랫폼 (프로필 주소 /vtuber/{profilePlatform}/{channelId}) */
  profilePlatform: Platform;
}

export function youtubeLiveItems(store: SqliteStore): YoutubeLiveItem[] {
  const repo = store.youtube;
  const out: YoutubeLiveItem[] = [];
  for (const v of repo.listLiveVideos(LIVE_STALE_MS)) {
    const owner = repo.ownersOf(v.ytChannelId)[0];
    if (!owner) continue;
    out.push({
      channelId: owner.channelId,
      channelName: owner.name,
      platform: "youtube",
      title: v.title,
      category: null,
      viewers: v.viewers ?? 0,
      startedAt: v.liveStartedAt ?? v.publishedAt,
      thumbnailUrl: ytThumb(v.videoId),
      channelUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      rawTags: store.lastRawTags(owner.channelId),
      videoId: v.videoId,
      ytChannelId: v.ytChannelId,
      profilePlatform: owner.platform,
    });
  }
  return out;
}
