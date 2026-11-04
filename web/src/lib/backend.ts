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
}

interface BackendDebut {
  channelId: string;
  channelName: string;
  platform: Platform;
  firstSeenAt: string;
  title: string | null;
  debutSignal: boolean;
  channelUrl: string;
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
    id: `${l.platform}-${l.channelId}`,
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

/** 신규 감지 채널. days 를 주면 그 기간 안에 처음 감지된 채널 */
export async function fetchDebutsFromBackend(days?: number, limit = 20): Promise<DebutEvent[]> {
  const qs = days ? `?days=${days}&limit=${limit}` : `?limit=${limit}`;
  const res = await fetch(`${BASE}/api/debuts${qs}`, fetchInit());
  if (!res.ok) throw new Error(`backend /api/debuts ${res.status}`);
  const json = (await res.json()) as { debuts?: BackendDebut[] };
  return (json.debuts ?? []).map((d) => ({
    id: d.channelId,
    vtuberName: d.channelName,
    platform: d.platform,
    debutAt: d.firstSeenAt,
    agency: null,
    note: d.title,
    debutSignal: d.debutSignal,
    channelUrl: d.channelUrl,
  }));
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
