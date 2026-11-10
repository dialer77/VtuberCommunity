// YouTube Data API v3 (키는 server\.env 의 YOUTUBE_API_KEY, docs/youtube-api.md).
// 호출마다 할당량 단위를 세어 태평양 시간 기준 하루 사용량을 app_meta 에 남긴다.
// search.list 는 쓰지 않는다 (하루 100회 별도 한도 — 3단계 키리누키 채널 찾기에서만).
import { config } from "../config";
import type { LiveStatus, VideoDetail } from "./store";

export interface MetaStore {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
}

export class QuotaExceededError extends Error {}

const TIMEOUT_MS = 10_000;

export function ytApiEnabled(): boolean {
  return !!config.youtubeApiKey;
}

/** 할당량이 초기화되는 태평양 시간 기준 날짜 */
function pacificDate(ms = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(ms));
}

export function quotaUsedToday(meta: MetaStore): number {
  const raw = meta.getMeta("yt_quota");
  if (!raw) return 0;
  try {
    const v = JSON.parse(raw) as { date?: string; used?: number };
    return v.date === pacificDate() ? Number(v.used ?? 0) : 0;
  } catch {
    return 0;
  }
}

function addQuota(meta: MetaStore, units: number): void {
  const used = quotaUsedToday(meta) + units;
  meta.setMeta("yt_quota", JSON.stringify({ date: pacificDate(), used }));
}

/** 하루 예산이 남았는지. 꼭 필요한 호출(방송 중 확인)은 essential 로 예산 끝까지 쓴다 */
export function quotaAllows(meta: MetaStore, essential: boolean): boolean {
  const used = quotaUsedToday(meta);
  const budget = config.youtubeDailyBudget;
  return used < (essential ? budget : budget * 0.8);
}

async function call<T>(meta: MetaStore, path: string, params: Record<string, string>, essential: boolean): Promise<T> {
  if (!ytApiEnabled()) throw new Error("YOUTUBE_API_KEY 없음");
  if (!quotaAllows(meta, essential)) throw new QuotaExceededError("오늘 YouTube 할당량 예산을 다 씀");
  const q = new URLSearchParams({ ...params, key: config.youtubeApiKey });
  // 실패한 요청도 1단위를 쓰므로 먼저 센다
  addQuota(meta, 1);
  const res = await fetch(`${config.youtubeApiBase}/${path}?${q}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    let reason = "";
    try {
      const j = (await res.json()) as { error?: { errors?: { reason?: string }[]; message?: string } };
      reason = j.error?.errors?.[0]?.reason ?? j.error?.message ?? "";
    } catch {
      /* 본문 없음 */
    }
    // 키에는 남은 단위가 없다고 YouTube 가 알려주면 오늘은 더 부르지 않게 예산을 채운다
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      meta.setMeta("yt_quota", JSON.stringify({ date: pacificDate(), used: config.youtubeDailyBudget }));
      throw new QuotaExceededError(`YouTube 할당량 초과 (${reason})`);
    }
    // 키 문제는 메시지에 키가 섞이지 않게 사유만
    throw new Error(`YouTube API ${path} ${res.status}${reason ? ` ${reason}` : ""}`);
  }
  return (await res.json()) as T;
}

export interface ChannelInfo {
  ytChannelId: string;
  title: string | null;
  handle: string | null;
  thumbnailUrl: string | null;
}

interface ChannelsResponse {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      customUrl?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
  }[];
}

function toChannelInfo(it: NonNullable<ChannelsResponse["items"]>[number]): ChannelInfo {
  const th = it.snippet?.thumbnails ?? {};
  const custom = it.snippet?.customUrl ?? null;
  return {
    ytChannelId: it.id,
    title: it.snippet?.title ?? null,
    handle: custom ? (custom.startsWith("@") ? custom : `@${custom}`) : null,
    thumbnailUrl: th.medium?.url ?? th.default?.url ?? null,
  };
}

/** @핸들 → 채널 (1단위). 없으면 null */
export async function channelByHandle(meta: MetaStore, handle: string): Promise<ChannelInfo | null> {
  const j = await call<ChannelsResponse>(meta, "channels", { part: "snippet", forHandle: handle }, false);
  const it = j.items?.[0];
  return it ? toChannelInfo(it) : null;
}

/** 채널 ID 50개까지 한 번에 (1단위) */
export async function channelsByIds(meta: MetaStore, ids: string[]): Promise<ChannelInfo[]> {
  const out: ChannelInfo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const j = await call<ChannelsResponse>(meta, "channels", { part: "snippet", id: batch.join(","), maxResults: "50" }, false);
    for (const it of j.items ?? []) out.push(toChannelInfo(it));
  }
  return out;
}

interface VideosResponse {
  items?: {
    id: string;
    contentDetails?: { duration?: string };
    liveStreamingDetails?: {
      actualStartTime?: string;
      actualEndTime?: string;
      scheduledStartTime?: string;
      concurrentViewers?: string;
    };
  }[];
}

/** ISO 8601 기간(PT1H2M3S) → 초 */
export function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return d! * 86400 + h! * 3600 + mi! * 60 + s!;
}

/** 영상 50개까지 한 번에 (1단위). 삭제·비공개 영상은 응답에 없다 */
export async function videosByIds(meta: MetaStore, ids: string[], essential: boolean): Promise<VideoDetail[]> {
  const out: VideoDetail[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const j = await call<VideosResponse>(
      meta,
      "videos",
      { part: "contentDetails,liveStreamingDetails", id: batch.join(","), maxResults: "50" },
      essential,
    );
    for (const it of j.items ?? []) {
      const l = it.liveStreamingDetails;
      let liveStatus: LiveStatus = "none";
      if (l) {
        if (l.actualEndTime) liveStatus = "ended";
        else if (l.actualStartTime) liveStatus = "live";
        else liveStatus = "upcoming";
      }
      const dur = parseDuration(it.contentDetails?.duration);
      out.push({
        videoId: it.id,
        liveStatus,
        scheduledAt: l?.scheduledStartTime ?? null,
        liveStartedAt: l?.actualStartTime ?? null,
        liveEndedAt: l?.actualEndTime ?? null,
        viewers: l?.concurrentViewers != null ? Number(l.concurrentViewers) : null,
        // 방송 중·예정은 P0D (0초) — 길이 없음으로
        durationSec: dur && dur > 0 ? dur : null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 키리누키 (3단계)

/** search.list 사용 횟수 (태평양 날짜 기준). 비싼 호출이라 따로 센다 */
export function searchesToday(meta: MetaStore): number {
  const raw = meta.getMeta("yt_search");
  if (!raw) return 0;
  try {
    const v = JSON.parse(raw) as { date?: string; used?: number };
    return v.date === pacificDate() ? Number(v.used ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** search.list 를 1회 더 써도 되는지: 하루 횟수 한도 + 일반 할당량 예산(80% 이내) */
export function searchAllowed(meta: MetaStore): boolean {
  return searchesToday(meta) < config.clipsSearchPerDay && quotaUsedToday(meta) + SEARCH_UNITS <= config.youtubeDailyBudget * 0.8;
}

/** search.list 한 번의 할당량. 별도 한도라는 안내도 있지만 기존 방식(100단위)으로 넉넉히 센다 */
const SEARCH_UNITS = 100;

interface SearchResponse {
  items?: { id?: { videoId?: string }; snippet?: { channelId?: string; channelTitle?: string } }[];
}

/**
 * 영상 검색 (search.list, 100단위로 셈). 결과에서 채널 ID·채널 이름만 돌려준다 (영상 정보는 쓰지 않음 — 클립 정보는 RSS 로)
 */
export async function searchVideoChannels(
  meta: MetaStore,
  q: string,
  publishedAfter: string,
): Promise<{ channelId: string; channelTitle: string }[]> {
  if (!searchAllowed(meta)) throw new QuotaExceededError("오늘 검색 한도를 다 씀");
  meta.setMeta("yt_search", JSON.stringify({ date: pacificDate(), used: searchesToday(meta) + 1 }));
  addQuota(meta, SEARCH_UNITS - 1); // call() 이 1단위를 더 센다
  const j = await call<SearchResponse>(
    meta,
    "search",
    {
      part: "snippet",
      type: "video",
      q,
      maxResults: "50",
      regionCode: "KR",
      relevanceLanguage: "ko",
      publishedAfter,
      safeSearch: "none",
    },
    false,
  );
  return (j.items ?? [])
    .filter((it) => it.snippet?.channelId)
    .map((it) => ({ channelId: it.snippet!.channelId!, channelTitle: it.snippet!.channelTitle ?? "" }));
}

interface SnippetResponse {
  items?: { id: string; snippet?: { title?: string } }[];
}

/** 영상이 아직 있는지·제목 (50개당 1단위). 응답에 없으면 삭제·비공개 */
export async function videoTitles(meta: MetaStore, ids: string[]): Promise<{ videoId: string; title: string | null }[]> {
  const out: { videoId: string; title: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const j = await call<SnippetResponse>(meta, "videos", { part: "snippet", id: batch.join(","), maxResults: "50" }, false);
    for (const it of j.items ?? []) out.push({ videoId: it.id, title: it.snippet?.title ?? null });
  }
  return out;
}
