// 유튜브 연동 데이터 → API 응답 모양
import type { SqliteStore, LiveItem } from "../store/sqlite";
import type { Platform } from "../domain";
import type { LinkStatus, SongKind, VtuberOwner, YtSong, YtVideo } from "./store";

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

function channelOut(store: SqliteStore, ytChannelId: string, status: "auto" | "manual", handle: string | null): YoutubeProfileOut {
  const repo = store.youtube;
  const ch = repo.getChannel(ytChannelId);
  const live = repo.listLiveVideos(LIVE_STALE_MS).find((v) => v.ytChannelId === ytChannelId) ?? null;
  return {
    ytChannelId,
    title: ch?.title ?? null,
    handle: ch?.handle ?? handle,
    url: ytChannelUrl(ytChannelId),
    thumbnailUrl: ch?.thumbnailUrl ?? null,
    status,
    videos: repo.listVideos(ytChannelId, 15).map(videoOut),
    live: live ? { ...videoOut(live), viewers: live.viewers } : null,
  };
}

/** 프로필의 유튜브 공식 채널 + 최신 영상 (매핑이 없으면 null). 유튜브 전용 버튜버는 자기 채널 */
export function youtubeForProfile(store: SqliteStore, platform: Platform, channelId: string): YoutubeProfileOut | null {
  const repo = store.youtube;
  if (platform === "youtube") {
    const v = repo.getVtuber(channelId);
    return v && v.active ? channelOut(store, v.ytChannelId, v.status === "manual" ? "manual" : "auto", null) : null;
  }
  const link = repo.getLink(platform, channelId);
  if (!link || !link.ytChannelId || (link.status !== "auto" && link.status !== "manual")) return null;
  return channelOut(store, link.ytChannelId, link.status, link.ytHandle);
}

// ---------------------------------------------------------------- 유튜브 전용 버튜버 프로필

/** /api/channels/youtube/:UC… — 치지직·SOOP 프로필과 같은 모양 (방송 기록·통계는 없음) */
export function ytOnlyProfile(store: SqliteStore, ytChannelId: string) {
  const v = store.youtube.getVtuber(ytChannelId);
  if (!v || !v.active) return null;
  const yt = youtubeForProfile(store, "youtube", ytChannelId);
  return {
    channelId: v.ytChannelId,
    platform: "youtube" as const,
    name: v.name,
    channelUrl: ytChannelUrl(v.ytChannelId),
    firstSeenAt: v.addedAt,
    debutSignal: false,
    isLive: !!yt?.live,
    currentViewers: yt?.live?.viewers ?? null,
    currentTitle: yt?.live?.title ?? null,
    peakViewers: 0,
    broadcastCount: 0,
    broadcasts: [],
    rawTags: [] as string[],
    youtube: yt,
    ytOnly: { group: v.group, region: v.region, aliases: v.aliases, verified: v.status === "manual" },
  };
}

// ---------------------------------------------------------------- 노래

export interface SongOut {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  kind: SongKind;
  durationSec: number | null;
  /** 버모아 버튜버 (프로필 /vtuber/{platform}/{channelId}) */
  vtuber: { platform: Platform; channelId: string; name: string } | null;
}

export function toSongOuts(store: SqliteStore, songs: YtSong[], owners?: Map<string, VtuberOwner>): SongOut[] {
  const map = owners ?? store.youtube.ownerMap();
  const names = store.channelNames(songs.map((s) => map.get(s.ytChannelId)?.channelId ?? "").filter(Boolean));
  return songs.map((s) => {
    const o = map.get(s.ytChannelId);
    return {
      videoId: s.videoId,
      title: s.title,
      publishedAt: s.publishedAt,
      thumbnailUrl: ytThumb(s.videoId),
      kind: s.kind,
      durationSec: s.durationSec,
      vtuber: o ? { platform: o.platform, channelId: o.channelId, name: names.get(o.channelId) ?? o.name } : null,
    };
  });
}

/** 프로필 '노래' 탭 (노래가 없으면 null) */
export function songsForProfile(store: SqliteStore, yt: YoutubeProfileOut | null) {
  if (!yt) return null;
  const counts = store.youtube.songCounts(yt.ytChannelId);
  const total = counts.cover + counts.original;
  if (total === 0) return null;
  const { songs } = store.youtube.listSongs({ ytChannelIds: [yt.ytChannelId], limit: 200, offset: 0 });
  return { total, cover: counts.cover, original: counts.original, songs: toSongOuts(store, songs) };
}

/** 노래 목록 (/api/songs). q = 제목 또는 버튜버 이름 */
export function listSongsOut(
  store: SqliteStore,
  opts: { kind?: SongKind; vtuber?: { platform: Platform; channelId: string }; q?: string; limit: number; offset: number },
) {
  const repo = store.youtube;
  const owners = repo.ownerMap();
  let ytChannelIds: string[] | undefined;
  if (opts.vtuber) {
    ytChannelIds = [...owners.entries()]
      .filter(([, o]) => o.platform === opts.vtuber!.platform && o.channelId === opts.vtuber!.channelId)
      .map(([id]) => id);
  }
  let orYtChannelIds: string[] | undefined;
  const q = (opts.q ?? "").trim().slice(0, 60);
  if (q) {
    const key = q.toLowerCase().replace(/\s+/g, "");
    const names = store.channelNames([...owners.values()].map((o) => o.channelId));
    orYtChannelIds = [...owners.entries()]
      .filter(([, o]) => (names.get(o.channelId) ?? o.name).toLowerCase().replace(/\s+/g, "").includes(key))
      .map(([id]) => id)
      .slice(0, 200);
  }
  const r = repo.listSongs({ kind: opts.kind, ytChannelIds, q: q || undefined, orYtChannelIds, limit: opts.limit, offset: opts.offset });
  return { total: r.total, songs: toSongOuts(store, r.songs, owners) };
}

/** LIVE 목록에 붙일 유튜브 방송. channelId 는 버튜버 주 채널(태그·프로필·최애 기준) */
export interface YoutubeLiveItem extends LiveItem {
  platform: "youtube";
  videoId: string;
  ytChannelId: string;
  /** 버튜버 주 채널 플랫폼 (프로필 주소 /vtuber/{profilePlatform}/{channelId}) */
  profilePlatform: Platform;
}

/** 유튜브 방송 중 목록. 해외 유튜브 전용 버튜버는 LIVE 목록에 넣지 않는다 (includeForeign = 검색용) */
export function youtubeLiveItems(store: SqliteStore, opts: { includeForeign?: boolean } = {}): YoutubeLiveItem[] {
  const repo = store.youtube;
  const out: YoutubeLiveItem[] = [];
  for (const v of repo.listLiveVideos(LIVE_STALE_MS)) {
    let owner: { platform: Platform; channelId: string; name: string } | undefined = repo.ownersOf(v.ytChannelId)[0];
    if (!owner) {
      const yv = repo.getVtuber(v.ytChannelId);
      if (!yv || !yv.active || (yv.region === "foreign" && !opts.includeForeign)) continue;
      owner = { platform: "youtube", channelId: yv.ytChannelId, name: yv.name };
    }
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
