import { getIssues } from "@/lib/data";

// RSS 피드 — 최근 이슈 글. 네이버 서치어드바이저 등 검색엔진 수집용 (레이아웃에 alternate 링크)
const SITE = process.env.SITE_URL ?? "http://localhost:3000";
const LIMIT = 30;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const issues = (await getIssues())
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, LIMIT);
  const items = issues
    .map((i) => {
      const url = `${SITE}/issue/${i.slug}`;
      const cats = i.tags.map((t) => `<category>${esc(t)}</category>`).join("");
      return `<item><title>${esc(i.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate><description>${esc(i.summary)}</description>${cats}</item>`;
    })
    .join("\n");
  const last = issues[0]?.publishedAt ? new Date(issues[0].publishedAt).toUTCString() : new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>버모아 VMOA — 버튜버 이슈</title>
<link>${SITE}/issue</link>
<atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
<description>한국 버튜버 씬의 최근 이슈를 출처와 함께 정리합니다.</description>
<language>ko</language>
<lastBuildDate>${last}</lastBuildDate>
${items}
</channel>
</rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
