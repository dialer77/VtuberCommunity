import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Issue } from "@/types";

// 이슈 간이 CMS: content/issues/*.md 를 빌드 시 읽어 이슈로 제공.
// 새 이슈는 마크다운 파일 하나 추가하면 끝(프론트매터 + 본문).
const DIR = path.join(process.cwd(), "content/issues");

function parseFile(fileName: string): Issue {
  const raw = fs.readFileSync(path.join(DIR, fileName), "utf8");
  const { data, content } = matter(raw);
  const date = data.date as string | Date | undefined;
  return {
    slug: fileName.replace(/\.md$/, ""),
    title: (data.title as string) ?? "",
    summary: (data.summary as string) ?? "",
    body: content.trim(),
    tags: (data.tags as string[]) ?? [],
    publishedAt:
      typeof date === "string"
        ? date
        : date
          ? date.toISOString()
          : new Date(0).toISOString(),
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
