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
} from "@/types";

// 백엔드(자체 DB + API) 기본 주소. 배포 시 BACKEND_URL 로 주입.
const BASE = process.env.BACKEND_URL ?? "http://localhost:4000";

// 실시간이라 캐시 안 함 + ngrok 무료 도메인의 브라우저 경고 인터스티셜 우회.
const FETCH_INIT: RequestInit = {
  cache: "no-store",
  headers: { "ngrok-skip-browser-warning": "true" },
};

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
  const res = await fetch(url, FETCH_INIT);
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
  const res = await fetch(`${BASE}/api/tags`, FETCH_INIT);
  if (!res.ok) throw new Error(`backend /api/tags ${res.status}`);
  const json = (await res.json()) as { tags?: TagCount[] };
  return json.tags ?? [];
}

export async function fetchCoins(
  sort: CoinSort = "cap",
  limit = 50,
): Promise<CoinItem[]> {
  const res = await fetch(`${BASE}/api/coins?sort=${sort}&limit=${limit}`, FETCH_INIT);
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
    FETCH_INIT,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`backend /api/channels ${res.status}`);
  return (await res.json()) as ChannelProfile;
}

export async function fetchDebutsFromBackend(): Promise<DebutEvent[]> {
  const res = await fetch(`${BASE}/api/debuts`, FETCH_INIT);
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
    FETCH_INIT,
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
    FETCH_INIT,
  );
  if (!res.ok) throw new Error(`backend /api/rising ${res.status}`);
  const json = (await res.json()) as { rising?: RisingEntry[] };
  return json.rising ?? [];
}
