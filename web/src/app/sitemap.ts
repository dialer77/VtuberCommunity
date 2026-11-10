import type { MetadataRoute } from "next";
import { getIssues } from "@/lib/data";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

// 자동 수집 이슈가 계속 늘어나므로 빌드 시점 고정이 아니라 요청 시 생성
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await getIssues();
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
  ];

  // 이슈 상세: 게시 시각을 lastModified 로 → 새 글이 빨리 수집되게
  const issueRoutes: MetadataRoute.Sitemap = issues.map((i) => ({
    url: `${SITE}/issue/${i.slug}`,
    lastModified: i.publishedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...issueRoutes];
}
