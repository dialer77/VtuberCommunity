import type {
  LiveStream,
  DebutEvent,
  Issue,
  RankingEntry,
  RisingEntry,
} from "@/types";
import { RAW_LIVES, RAW_DEBUTS, ISSUES } from "@/lib/mock";
import { fetchChzzkLives } from "@/lib/chzzk";
import {
  fetchLivesFromBackend,
  fetchDebutsFromBackend,
  fetchRankingFromBackend,
  fetchRisingFromBackend,
} from "@/lib/backend";

// 데이터 접근 층 (SERVE 단계).
// 라이브/데뷔는 백엔드(자체 DB) 우선 → 백엔드 없으면 치지직 직접 → 목 폴백.
// 이슈는 아직 목 데이터(수동 콘텐츠).

export async function getLiveStreams(): Promise<LiveStream[]> {
  // 1) 백엔드(자체 DB) 우선
  try {
    const lives = await fetchLivesFromBackend();
    if (lives.length > 0) return lives;
  } catch {
    // 백엔드 미기동 — 치지직 직접 조회로 폴백
  }
  // 2) 백엔드 없으면 치지직 직접
  try {
    const lives = await fetchChzzkLives();
    if (lives.length > 0) return lives;
  } catch (e) {
    console.error("[data] 치지직 조회 실패 — 목 데이터로 폴백:", e);
  }
  // 3) 목
  return mockLiveStreams();
}

function mockLiveStreams(): LiveStream[] {
  const now = Date.now();
  return RAW_LIVES.map((r) => ({
    id: `live-${r.vtuberId}`,
    vtuberId: r.vtuberId,
    vtuberName: r.vtuberName,
    platform: r.platform,
    title: r.title,
    category: r.category,
    viewers: r.viewers,
    startedAt: new Date(now - r.startedMinAgo * 60_000).toISOString(),
    thumbnailUrl: null,
    channelUrl: r.channelUrl,
  })).sort((a, b) => b.viewers - a.viewers);
}

export async function getDebutEvents(): Promise<DebutEvent[]> {
  // 백엔드(자체 DB의 first-seen 채널) 우선, 없으면 목
  try {
    const debuts = await fetchDebutsFromBackend();
    if (debuts.length > 0) return debuts;
  } catch {
    // 백엔드 미기동 — 목 폴백
  }
  return mockDebutEvents();
}

function mockDebutEvents(): DebutEvent[] {
  const now = Date.now();
  return RAW_DEBUTS.map((r, i) => ({
    id: `debut-${i}`,
    vtuberName: r.vtuberName,
    platform: r.platform,
    debutAt: new Date(now + r.debutDaysFromNow * 86_400_000).toISOString(),
    agency: r.agency,
    note: r.note,
    debutSignal: /데뷔|첫 ?방송/.test(r.note ?? ""),
    channelUrl: r.channelUrl,
  })).sort((a, b) => a.debutAt.localeCompare(b.debutAt));
}

export async function getRanking(): Promise<RankingEntry[]> {
  try {
    const ranking = await fetchRankingFromBackend();
    if (ranking.length > 0) return ranking;
  } catch {
    // 백엔드 미기동 — 현재 라이브를 시청자순으로 폴백
  }
  const lives = await getLiveStreams();
  return lives.map((l) => ({
    channelId: l.vtuberId,
    channelName: l.vtuberName,
    platform: l.platform,
    avgViewers: l.viewers,
    peakViewers: l.viewers,
    samples: 1,
    title: l.title,
    channelUrl: l.channelUrl,
  }));
}

export async function getRising(): Promise<RisingEntry[]> {
  try {
    return await fetchRisingFromBackend();
  } catch {
    return []; // 백엔드 없으면 급상승 계산 불가
  }
}

export async function getIssues(): Promise<Issue[]> {
  return [...ISSUES].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function getIssueBySlug(slug: string): Promise<Issue | null> {
  return ISSUES.find((i) => i.slug === slug) ?? null;
}

export async function getIssueSlugs(): Promise<string[]> {
  return ISSUES.map((i) => i.slug);
}
