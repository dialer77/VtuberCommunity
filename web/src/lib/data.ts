import type { LiveStream, DebutEvent, Issue } from "@/types";
import { RAW_LIVES, RAW_DEBUTS, ISSUES } from "@/lib/mock";

// 데이터 접근 층 (SERVE 단계).
// 지금은 목 데이터를 반환하지만, 시그니처를 async로 유지해
// 추후 DB/수집기 호출로 이 파일만 갈아끼우면 페이지 코드는 그대로 둔다.

export async function getLiveStreams(): Promise<LiveStream[]> {
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
