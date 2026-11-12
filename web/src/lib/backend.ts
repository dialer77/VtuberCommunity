import type {
  LiveStream,
  DebutEvent,
  Platform,
  RankingEntry,
  RisingEntry,
  VmoaTag,
  TagCount,
  ChannelProfile,
  CoinItem,
  CoinSort,
  Issue,
  DebutWindow,
  DebutSource,
  DebutReportEntry,
  PeriodRanking,
  RankingPeriod,
  RankingMetric,
  Clip,
  ClipDetail,
  ClipTagCount,
  SearchResponse,
} from "@/types";

// 백엔드(자체 DB + API) 기본 주소. 배포 시 BACKEND_URL 로 주입.
const BASE = process.env.BACKEND_URL ?? "http://localhost:4000";

// 실시간이라 캐시 안 함. 백엔드(배포 PC)가 멈춰도 페이지·사이트맵이 같이 멈추지 않게 8초 제한
// (실패하면 각 호출부가 치지직 직접 조회·목 데이터 등으로 폴백한다)
const BACKEND_TIMEOUT_MS = 8000;
function fetchInit(): RequestInit {
  return { cache: "no-store", signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS) };
}

interface BackendLive {
  channelId: string;
  channelName: string;
  platform: Platform;
  title: string;
  category: string | null;
  viewers: number;
  startedAt: string;
  thumbnailUrl: string | null;
  channelUrl: string;
  tags: VmoaTag[];
  videoId?: string;
  profilePlatform?: Platform;
}

interface BackendDebut {
  channelId: string;
  channelName: string;
  platform: Platform;
  firstSeenAt: string;
  title: string | null;
  debutSignal: boolean;
  channelUrl: string;
  debutAt?: string;
  web?: boolean;
  agency?: string | null;
  summary?: string | null;
  sources?: DebutSource[];
}

export async function fetchLivesFromBackend(
  tag?: string,
): Promise<LiveStream[]> {
  const url = tag
    ? `${BASE}/api/lives?tag=${encodeURIComponent(tag)}`
    : `${BASE}/api/lives`;
  const res = await fetch(url, fetchInit());
  if (!res.ok) throw new Error(`backend /api/lives ${res.status}`);
  const json = (await res.json()) as { lives?: BackendLive[] };
  return (json.lives ?? []).map((l) => ({
    id: l.videoId ? `youtube-${l.videoId}` : `${l.platform}-${l.channelId}`,
    vtuberId: l.channelId,
    vtuberName: l.channelName,
    platform: l.platform,
    title: l.title,
    category: l.category,
    viewers: l.viewers,
    startedAt: l.startedAt,
    thumbnailUrl: l.thumbnailUrl,
    channelUrl: l.channelUrl,
    tags: l.tags ?? [],
    ...(l.videoId ? { videoId: l.videoId, profilePlatform: l.profilePlatform ?? "chzzk" } : {}),
  }));
}

export async function fetchTags(): Promise<TagCount[]> {
  const res = await fetch(`${BASE}/api/tags`, fetchInit());
  if (!res.ok) throw new Error(`backend /api/tags ${res.status}`);
  const json = (await res.json()) as { tags?: TagCount[] };
  return json.tags ?? [];
}

export async function fetchCoins(
  sort: CoinSort = "cap",
  limit = 50,
): Promise<CoinItem[]> {
  const res = await fetch(`${BASE}/api/coins?sort=${sort}&limit=${limit}`, fetchInit());
  if (!res.ok) throw new Error(`backend /api/coins ${res.status}`);
  const json = (await res.json()) as { coins?: CoinItem[] };
  return json.coins ?? [];
}

export async function fetchChannelProfile(
  platform: string,
  channelId: string,
): Promise<ChannelProfile | null> {
  const res = await fetch(
    `${BASE}/api/channels/${encodeURIComponent(platform)}/${encodeURIComponent(channelId)}`,
    fetchInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`backend /api/channels ${res.status}`);
  return (await res.json()) as ChannelProfile;
}

/** 자동 수집 이슈 목록 (공개된 것만) */
export async function fetchIssuesFromBackend(limit = 100): Promise<Issue[]> {
  const res = await fetch(`${BASE}/api/issues?limit=${limit}`, fetchInit());
  if (!res.ok) throw new Error(`backend /api/issues ${res.status}`);
  const json = (await res.json()) as { issues?: Issue[] };
  return json.issues ?? [];
}

export async function fetchIssueFromBackend(slug: string): Promise<Issue | null> {
  const res = await fetch(`${BASE}/api/issues/${encodeURIComponent(slug)}`, fetchInit());
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`backend /api/issues/:slug ${res.status}`);
  return (await res.json()) as Issue;
}

function toDebutEvent(d: BackendDebut): DebutEvent {
  return {
    id: d.channelId,
    vtuberName: d.channelName,
    platform: d.platform,
    debutAt: d.debutAt ?? d.firstSeenAt,
    agency: d.agency ?? null,
    note: d.title,
    debutSignal: d.debutSignal,
    channelUrl: d.channelUrl,
    web: d.web ?? false,
    summary: d.summary ?? null,
    sources: d.sources ?? [],
  };
}

/** 최근 감지된 신규 채널 (홈 등 요약용) */
export async function fetchDebutsFromBackend(limit = 20): Promise<DebutEvent[]> {
  const res = await fetch(`${BASE}/api/debuts?limit=${limit}`, fetchInit());
  if (!res.ok) throw new Error(`backend /api/debuts ${res.status}`);
  const json = (await res.json()) as { debuts?: BackendDebut[] };
  return (json.debuts ?? []).map(toDebutEvent);
}

/** 신규 데뷔 탭: since 이후 데뷔 방송 확인 채널 전부 + 새로 감지된 채널 최근 limit 개와 전체 개수 */
export async function fetchDebutWindow(sinceIso: string, limit = 60): Promise<DebutWindow> {
  const res = await fetch(
    `${BASE}/api/debuts?since=${encodeURIComponent(sinceIso)}&limit=${limit}`,
    fetchInit(),
  );
  if (!res.ok) throw new Error(`backend /api/debuts ${res.status}`);
  const json = (await res.json()) as {
    confirmed?: BackendDebut[];
    detected?: BackendDebut[];
    detectedTotal?: number;
    debuts?: BackendDebut[];
    upcoming?: DebutReportEntry[];
    webOnly?: DebutReportEntry[];
  };
  if (json.confirmed) {
    return {
      confirmed: json.confirmed.map(toDebutEvent),
      detected: (json.detected ?? []).map(toDebutEvent),
      detectedTotal: json.detectedTotal ?? 0,
      upcoming: json.upcoming ?? [],
      webOnly: json.webOnly ?? [],
    };
  }
  // 이전 백엔드(since 미지원) 호환 — 받은 목록을 기간으로 걸러 나눈다
  const inRange = (json.debuts ?? []).map(toDebutEvent).filter((d) => d.debutAt >= sinceIso);
  const detected = inRange.filter((d) => !d.debutSignal);
  return {
    confirmed: inRange.filter((d) => d.debutSignal),
    detected: detected.slice(0, limit),
    detectedTotal: detected.length,
    upcoming: [],
    webOnly: [],
  };
}

/** 기간 랭킹 (오늘/주간/월간 × 시청시간/평균/최고/방송시간) */
export async function fetchPeriodRanking(
  period: Exclude<RankingPeriod, "live">,
  metric: RankingMetric,
  limit = 50,
): Promise<PeriodRanking> {
  const res = await fetch(
    `${BASE}/api/ranking?period=${period}&metric=${metric}&limit=${limit}`,
    fetchInit(),
  );
  if (!res.ok) throw new Error(`backend /api/ranking ${res.status}`);
  const json = (await res.json()) as Partial<PeriodRanking>;
  return {
    since: json.since ?? "",
    trackingSince: json.trackingSince ?? null,
    ranking: json.ranking ?? [],
  };
}

export async function fetchRankingFromBackend(
  windowMinutes = 180,
  limit = 30,
): Promise<RankingEntry[]> {
  const res = await fetch(
    `${BASE}/api/ranking?window=${windowMinutes}&limit=${limit}`,
    fetchInit(),
  );
  if (!res.ok) throw new Error(`backend /api/ranking ${res.status}`);
  const json = (await res.json()) as { ranking?: RankingEntry[] };
  return json.ranking ?? [];
}

export async function fetchRisingFromBackend(
  windowMinutes = 60,
  limit = 10,
): Promise<RisingEntry[]> {
  const res = await fetch(
    `${BASE}/api/rising?window=${windowMinutes}&limit=${limit}`,
    fetchInit(),
  );
  if (!res.ok) throw new Error(`backend /api/rising ${res.status}`);
  const json = (await res.json()) as { rising?: RisingEntry[] };
  return json.rising ?? [];
}

/** 키리누키 목록 (버모아 분류 완료분, 최신순) */
export async function fetchClips(q: {
  tag?: string;
  sort?: "likes";
  vtuber?: { platform: string; channelId: string };
  limit?: number;
  offset?: number;
}): Promise<{ total: number; clips: Clip[] }> {
  const sp = new URLSearchParams();
  if (q.tag) sp.set("tag", q.tag);
  if (q.sort) sp.set("sort", q.sort);
  if (q.vtuber) {
    sp.set("platform", q.vtuber.platform);
    sp.set("channelId", q.vtuber.channelId);
  }
  sp.set("limit", String(q.limit ?? 24));
  sp.set("offset", String(q.offset ?? 0));
  const res = await fetch(`${BASE}/api/clips?${sp}`, fetchInit());
  if (!res.ok) throw new Error(`backend /api/clips ${res.status}`);
  const json = (await res.json()) as { total?: number; clips?: Clip[] };
  return { total: json.total ?? 0, clips: json.clips ?? [] };
}

export async function fetchClipTags(): Promise<ClipTagCount[]> {
  const res = await fetch(`${BASE}/api/clips/tags`, fetchInit());
  if (!res.ok) throw new Error(`backend /api/clips/tags ${res.status}`);
  return ((await res.json()) as { tags?: ClipTagCount[] }).tags ?? [];
}

export async function fetchClip(videoId: string): Promise<ClipDetail | null> {
  const res = await fetch(`${BASE}/api/clips/${encodeURIComponent(videoId)}`, fetchInit());
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`backend /api/clips/:id ${res.status}`);
  return (await res.json()) as ClipDetail;
}

/** 사이트맵 재료 — 검색 노출 대상 프로필 + 보이는 클립 */
export async function fetchSitemapEntries(): Promise<{
  channels: { platform: Platform; channelId: string; lastLiveAt: string }[];
  clips: { videoId: string; publishedAt: string }[];
}> {
  const res = await fetch(`${BASE}/api/sitemap`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`backend /api/sitemap ${res.status}`);
  const json = (await res.json()) as { channels?: []; clips?: [] };
  return { channels: json.channels ?? [], clips: json.clips ?? [] };
}

/** 버튜버 검색 — 이름·초성·'#태그', tags 는 모두 만족 */
export async function fetchSearch(q: {
  q?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.tags?.length) sp.set("tag", q.tags.join(","));
  sp.set("limit", String(q.limit ?? 30));
  sp.set("offset", String(q.offset ?? 0));
  const res = await fetch(`${BASE}/api/search?${sp}`, fetchInit());
  if (!res.ok) throw new Error(`backend /api/search ${res.status}`);
  return (await res.json()) as SearchResponse;
}
