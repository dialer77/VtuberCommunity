import type {
  LiveStream,
  DebutEvent,
  Issue,
  RankingEntry,
  RisingEntry,
} from "@/types";
import { RAW_LIVES, RAW_DEBUTS } from "@/lib/mock";
import { loadIssues, loadIssue } from "@/lib/issues";
import { fetchChzzkLives } from "@/lib/chzzk";
import type {
  TagCount,
  ChannelProfile,
  CoinItem,
  CoinSort,
  DebutWindow,
  PeriodRanking,
  RankingPeriod,
  RankingMetric,
  Clip,
  ClipDetail,
  ClipTagCount,
  SearchResponse,
  Song,
} from "@/types";
import {
  fetchLivesFromBackend,
  fetchDebutsFromBackend,
  fetchDebutWindow,
  fetchRankingFromBackend,
  fetchPeriodRanking,
  fetchRisingFromBackend,
  fetchTags,
  fetchChannelProfile,
  fetchCoins,
  fetchIssuesFromBackend,
  fetchIssueFromBackend,
  fetchClips,
  fetchClipTags,
  fetchClip,
  fetchSearch,
  fetchSongs,
} from "@/lib/backend";

// 데이터 접근 층 (SERVE 단계).
// 라이브/데뷔는 백엔드(자체 DB) 우선 → 백엔드 없으면 치지직 직접 → 목 폴백.
// 이슈는 백엔드 자동 수집(AI 정리) + 운영자 마크다운.

export async function getLiveStreams(tag?: string): Promise<LiveStream[]> {
  // 1) 백엔드(자체 DB) 우선 — 태그 필터는 백엔드에서만 지원
  try {
    const lives = await fetchLivesFromBackend(tag);
    if (lives.length > 0) return lives;
  } catch {
    // 백엔드 미기동 — 치지직 직접 조회로 폴백
  }
  // 2) 백엔드 없으면 치지직 직접 (태그 필터 불가)
  try {
    const lives = await fetchChzzkLives();
    if (lives.length > 0) return lives;
  } catch (e) {
    console.error("[data] 치지직 조회 실패 — 목 데이터로 폴백:", e);
  }
  // 3) 목
  return mockLiveStreams();
}

export async function getTags(): Promise<TagCount[]> {
  try {
    return await fetchTags();
  } catch {
    return [];
  }
}

export async function getCoins(sort: CoinSort = "cap"): Promise<CoinItem[]> {
  try {
    return await fetchCoins(sort, 50);
  } catch {
    return [];
  }
}

export async function getChannelProfile(
  platform: string,
  channelId: string,
): Promise<ChannelProfile | null> {
  try {
    return await fetchChannelProfile(platform, channelId);
  } catch {
    return null;
  }
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
    tags: [],
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

/** 신규 데뷔 탭 한 기간분 (since 이후). 기간 안에 있는 동안은 목록에서 밀려나지 않는다. */
export async function getDebutWindow(sinceIso: string): Promise<DebutWindow> {
  try {
    return await fetchDebutWindow(sinceIso, 60);
  } catch {
    // 백엔드 미기동 — 목 폴백
  }
  const inRange = mockDebutEvents().filter((d) => d.debutAt >= sinceIso);
  const detected = inRange.filter((d) => !d.debutSignal);
  return {
    confirmed: inRange.filter((d) => d.debutSignal),
    detected,
    detectedTotal: detected.length,
    upcoming: [],
    webOnly: [],
  };
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

/** 기간 랭킹 — 백엔드 없으면 빈 목록 */
export async function getPeriodRanking(
  period: Exclude<RankingPeriod, "live">,
  metric: RankingMetric,
): Promise<PeriodRanking> {
  try {
    return await fetchPeriodRanking(period, metric);
  } catch {
    return { since: "", trackingSince: null, ranking: [] };
  }
}

export async function getRising(): Promise<RisingEntry[]> {
  try {
    return await fetchRisingFromBackend();
  } catch {
    return []; // 백엔드 없으면 급상승 계산 불가
  }
}

/** 이슈 정렬 기준일: 사건 날짜 → 게시일 */
function issueSortKey(i: Issue): string {
  return i.eventDate ?? i.publishedAt.slice(0, 10);
}

// 이슈 = 백엔드 자동 수집(AI 정리) + 운영자가 쓴 마크다운(content/issues). 백엔드가 없으면 마크다운만.
export async function getIssues(): Promise<Issue[]> {
  let auto: Issue[] = [];
  try {
    auto = await fetchIssuesFromBackend();
  } catch {
    // 백엔드 미기동
  }
  return [...auto, ...loadIssues()].sort(
    (a, b) =>
      issueSortKey(b).localeCompare(issueSortKey(a)) || b.publishedAt.localeCompare(a.publishedAt),
  );
}

export async function getIssueBySlug(slug: string): Promise<Issue | null> {
  const manual = loadIssue(slug);
  if (manual) return manual;
  try {
    return await fetchIssueFromBackend(slug);
  } catch {
    return null;
  }
}

export async function getIssueSlugs(): Promise<string[]> {
  return (await getIssues()).map((i) => i.slug);
}

// ---- 키리누키 (백엔드 없으면 빈 목록)

export async function getSongs(q: Parameters<typeof fetchSongs>[0]): Promise<{ total: number; songs: Song[] }> {
  try {
    return await fetchSongs(q);
  } catch {
    return { total: 0, songs: [] };
  }
}

export async function getClips(q: Parameters<typeof fetchClips>[0]): Promise<{ total: number; clips: Clip[] }> {
  try {
    return await fetchClips(q);
  } catch {
    return { total: 0, clips: [] };
  }
}

export async function getClipTags(): Promise<ClipTagCount[]> {
  try {
    return await fetchClipTags();
  } catch {
    return [];
  }
}

export async function getClip(videoId: string): Promise<ClipDetail | null> {
  try {
    return await fetchClip(videoId);
  } catch {
    return null;
  }
}

// ---- 버튜버 검색 (백엔드가 멈추면 null → 화면에서 안내)

export async function searchVtubers(q: Parameters<typeof fetchSearch>[0]): Promise<SearchResponse | null> {
  try {
    return await fetchSearch(q);
  } catch {
    return null;
  }
}
