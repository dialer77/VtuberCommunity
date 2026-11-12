import type { MetadataRoute } from "next";
import { getIssues } from "@/lib/data";
import { fetchSitemapEntries } from "@/lib/backend";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

// 자동 수집 이슈가 계속 늘어나므로 빌드 시점 고정이 아니라 요청 시 생성
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 백엔드가 멈춰 있어도 사이트맵은 나가야 하므로 프로필·클립은 실패하면 뺀다
  const [issues, entries] = await Promise.all([
    getIssues(),
    fetchSitemapEntries().catch(() => ({ channels: [], clips: [] })),
  ]);
  const latestIssue = issues[0]?.publishedAt;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/issue`, changeFrequency: "hourly", priority: 0.9, lastModified: latestIssue },
    { url: `${SITE}/debut`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/ranking`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/clips`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/contact`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // 이슈 상세: 게시 시각을 lastModified 로 → 새 글이 빨리 수집되게
  const issueRoutes: MetadataRoute.Sitemap = issues.map((i) => ({
    url: `${SITE}/issue/${i.slug}`,
    lastModified: i.publishedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // 버튜버 프로필: 방송 3회 이상 또는 최근 90일 방송 (그 밖의 프로필은 페이지에서 noindex)
  const profileRoutes: MetadataRoute.Sitemap = entries.channels.map((c) => ({
    url: `${SITE}/vtuber/${c.platform}/${encodeURIComponent(c.channelId)}`,
    lastModified: c.lastLiveAt,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  // 키리누키 상세 (분류가 끝나 보이는 클립)
  const clipRoutes: MetadataRoute.Sitemap = entries.clips.map((c) => ({
    url: `${SITE}/clips/${encodeURIComponent(c.videoId)}`,
    lastModified: c.publishedAt,
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...issueRoutes, ...profileRoutes, ...clipRoutes];
}
