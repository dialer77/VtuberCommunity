import type { LiveStream, DebutEvent, Platform } from "@/types";

// 백엔드(자체 DB + API) 기본 주소. 배포 시 BACKEND_URL 로 주입.
const BASE = process.env.BACKEND_URL ?? "http://localhost:4000";

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
}

interface BackendDebut {
  channelId: string;
  channelName: string;
  platform: Platform;
  firstSeenAt: string;
  title: string | null;
  channelUrl: string;
}

export async function fetchLivesFromBackend(): Promise<LiveStream[]> {
  const res = await fetch(`${BASE}/api/lives`, { cache: "no-store" });
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
  }));
}

export async function fetchDebutsFromBackend(): Promise<DebutEvent[]> {
  const res = await fetch(`${BASE}/api/debuts`, { cache: "no-store" });
  if (!res.ok) throw new Error(`backend /api/debuts ${res.status}`);
  const json = (await res.json()) as { debuts?: BackendDebut[] };
  return (json.debuts ?? []).map((d) => ({
    id: d.channelId,
    vtuberName: d.channelName,
    platform: d.platform,
    debutAt: d.firstSeenAt,
    agency: null,
    note: d.title,
    channelUrl: d.channelUrl,
  }));
}
