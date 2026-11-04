import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Issue, IssueSource } from "@/types";

// 수동 이슈(운영자 작성): content/issues/*.md 를 빌드 시 읽는다. 자동 수집 이슈는 백엔드 /api/issues.
// 프론트매터: title, summary, tags, date, sources: [{ url, title, publisher }]
const DIR = path.join(process.cwd(), "content/issues");

function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      return u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/)?.[2] ?? null;
    }
  } catch {
    /* 잘못된 URL */
  }
  return null;
}

function parseSources(raw: unknown): IssueSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s.url === "string")
    .map((s) => {
      const url = s.url as string;
      const yt = youtubeId(url);
      return {
        url,
        title: typeof s.title === "string" ? s.title : url,
        publisher: typeof s.publisher === "string" ? s.publisher : null,
        description: null,
        imageUrl:
          typeof s.image === "string" ? s.image : yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null,
        publishedAt: null,
        kind: yt ? "youtube" : "link",
        embedId: yt,
      };
    });
}

function parseFile(fileName: string): Issue {
  const raw = fs.readFileSync(path.join(DIR, fileName), "utf8");
  const { data, content } = matter(raw);
  const date = data.date as string | Date | undefined;
  const publishedAt =
    typeof date === "string" ? date : date ? date.toISOString() : new Date(0).toISOString();
  return {
    slug: fileName.replace(/\.md$/, ""),
    title: (data.title as string) ?? "",
    summary: (data.summary as string) ?? "",
    body: content.trim(),
    tags: (data.tags as string[]) ?? [],
    publishedAt,
    eventDate: null,
    origin: "manual",
    sources: parseSources(data.sources),
  };
}

function fileNames(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".md"));
}

export function loadIssues(): Issue[] {
  return fileNames()
    .map(parseFile)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function loadIssue(slug: string): Issue | null {
  const file = `${slug}.md`;
  if (!fs.existsSync(path.join(DIR, file))) return null;
  return parseFile(file);
}

export function issueSlugs(): string[] {
  return fileNames().map((f) => f.replace(/\.md$/, ""));
}
