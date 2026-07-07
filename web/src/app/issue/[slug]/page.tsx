import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getIssueBySlug, getIssueSlugs } from "@/lib/data";
import { formatDate } from "@/lib/format";

// Next.js 16: params 는 Promise 이므로 await 해서 사용한다.
type Params = Promise<{ slug: string }>;

// 빌드 시 이슈 상세를 정적 생성 (SEO/AdSense 크롤 대상).
export async function generateStaticParams() {
  const slugs = await getIssueSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const issue = await getIssueBySlug(slug);
  if (!issue) return { title: "이슈를 찾을 수 없음" };
  return {
    title: issue.title,
    description: issue.summary,
  };
}

export default async function IssueDetailPage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const issue = await getIssueBySlug(slug);
  if (!issue) notFound();

  return (
    <article className="max-w-2xl mx-auto flex flex-col gap-4">
      <Link
        href="/issue"
        className="text-sm text-muted hover:text-accent transition-colors w-fit"
      >
        ← 이슈 타임라인
      </Link>

      <header className="flex flex-col gap-2 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <time className="text-xs text-muted-2 tabular-nums">
            {formatDate(issue.publishedAt)}
          </time>
          {issue.tags.map((t) => (
            <span
              key={t}
              className="text-xs rounded-full bg-surface-2 px-2 py-0.5 text-muted"
            >
              #{t}
            </span>
          ))}
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight leading-tight text-balance">
          {issue.title}
        </h1>
        <p className="text-muted">{issue.summary}</p>
      </header>

      <div className="flex flex-col gap-4 leading-relaxed">
        {issue.body.split("\n\n").map((para, i) => (
          <p key={i} className="text-[15px]">
            {para}
          </p>
        ))}
      </div>
    </article>
  );
}
