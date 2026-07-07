import type { Metadata } from "next";
import Link from "next/link";
import { getIssues } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "이슈 타임라인",
  description: "한국 버튜버 씬의 이슈와 사건을 시간순으로 정리한 아카이브.",
};

// 콘텐츠 페이지는 정적/ISR로 (검색 유입 + AdSense 크롤 대상).
export const revalidate = 300;

export default async function IssueListPage() {
  const issues = await getIssues();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">이슈 타임라인</h1>
        <p className="text-sm text-muted">
          씬에 흩어진 사건을 한 곳에 정리한 큐레이션 아카이브.
        </p>
      </header>

      <ul className="flex flex-col gap-4">
        {issues.map((issue) => (
          <li key={issue.slug}>
            <Link
              href={`/issue/${issue.slug}`}
              className="block rounded-xl border border-border bg-surface p-5 hover:border-accent/60 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <time className="text-xs text-muted-2 tabular-nums">
                  {formatDate(issue.publishedAt)}
                </time>
                {issue.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="text-xs rounded-full bg-surface-2 px-2 py-0.5 text-muted"
                  >
                    #{t}
                  </span>
                ))}
              </div>
              <h2 className="font-bold leading-snug">{issue.title}</h2>
              <p className="text-sm text-muted mt-1 line-clamp-2">
                {issue.summary}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
