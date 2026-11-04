import type { MetadataRoute } from "next";
import { getIssueSlugs } from "@/lib/data";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/debut`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/ranking`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/issue`, changeFrequency: "daily", priority: 0.7 },
  ];

  const slugs = await getIssueSlugs();
  const issueRoutes: MetadataRoute.Sitemap = slugs.map((s) => ({
    url: `${SITE}/issue/${s}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...issueRoutes];
}
