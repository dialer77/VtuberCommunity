import type { LiveStream, DebutEvent, Issue } from "@/types";
import { RAW_LIVES, RAW_DEBUTS, ISSUES } from "@/lib/mock";
import { fetchChzzkLives } from "@/lib/chzzk";

// 데이터 접근 층 (SERVE 단계).
// 라이브 현황은 치지직 실데이터를 직접 조회한다(추후 워커/DB 경유로 교체 가능).
// 데뷔·이슈는 아직 목 데이터(데뷔 감지는 워커+DB 영역, 이슈는 수동 콘텐츠).

export async function getLiveStreams(): Promise<LiveStream[]> {
  try {
    const lives = await fetchChzzkLives();
    if (lives.length > 0) return lives;
    console.warn("[data] 치지직 라이브 0건(휴리스틱 필터) — 목 데이터로 폴백");
  } catch (e) {
    console.error("[data] 치지직 조회 실패 — 목 데이터로 폴백:", e);
  }
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
  const now = Date.now();
  return RAW_DEBUTS.map((r, i) => ({
    id: `debut-${i}`,
    vtuberName: r.vtuberName,
    platform: r.platform,
    debutAt: new Date(now + r.debutDaysFromNow * 86_400_000).toISOString(),
    agency: r.agency,
    note: r.note,
    channelUrl: r.channelUrl,
  })).sort((a, b) => a.debutAt.localeCompare(b.debutAt));
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
