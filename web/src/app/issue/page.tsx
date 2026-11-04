import type { Metadata } from "next";
import Link from "next/link";
import { getIssues } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { RemoteImage } from "@/components/remote-image";
import { pickCover } from "@/components/source-card";
import { formatDate, issueDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "이슈 타임라인",
  description: "한국 버튜버 씬의 이슈와 사건을 출처와 함께 시간순으로 정리한 아카이브.",
};

// 백엔드가 3시간마다 새 이슈를 올리고, 숨김 처리도 바로 반영돼야 하므로 요청마다 렌더링
export const dynamic = "force-dynamic";

export default async function IssueListPage() {
  const issues = await getIssues();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="이슈 타임라인"
        description="버튜버 씬에 흩어진 소식을 출처와 함께 한 곳에 정리했어요. 3시간마다 새 소식을 찾아 올립니다."
      />

      {issues.length === 0 ? (
        <p className="text-muted py-12 text-center">아직 정리된 이슈가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {issues.map((issue) => {
            const cover = pickCover(issue.sources);
            const first = issue.sources[0];
            return (
              <li key={issue.slug}>
                <Link
                  href={`/issue/${issue.slug}`}
                  className="group flex gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5 transition-colors hover:border-accent/60"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <time className="text-xs text-muted-2 tabular-nums">{formatDate(issueDate(issue))}</time>
                      {issue.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-xs rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                          #{t}
                        </span>
                      ))}
                    </div>
                    <h2 className="font-bold leading-snug group-hover:text-accent transition-colors">
                      {issue.title}
                    </h2>
                    <p className="text-sm text-muted mt-1 line-clamp-2">{issue.summary}</p>
                    {first ? (
                      <p className="mt-2 text-xs text-muted-2 truncate">
                        출처 {issue.sources.length} · {first.publisher ?? new URL(first.url).hostname.replace(/^www\./, "")}
                        {issue.origin === "auto" ? " · AI 정리" : ""}
                      </p>
                    ) : null}
                  </div>
                  {cover?.imageUrl ? (
                    <div className="relative hidden sm:block w-40 shrink-0 self-center aspect-video overflow-hidden rounded-lg bg-surface-2">
                      <RemoteImage src={cover.imageUrl} className="absolute inset-0 h-full w-full object-cover" />
                      {cover.kind === "youtube" ? (
                        <span className="absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow">
                          ▶
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
