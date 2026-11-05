import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getIssueBySlug } from "@/lib/data";
import { formatDate, issueDate } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";
import { AdSlot } from "@/components/ad-slot";
import { SourceCard, VideoCover, pickCover } from "@/components/source-card";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

// Next.js 16: params 는 Promise 이므로 await 해서 사용한다.
type Params = Promise<{ slug: string }>;

// 자동 수집 이슈는 백엔드에 계속 쌓이고 숨김도 즉시 반영돼야 하므로 요청마다 렌더링 (SSR — 검색 노출 유지)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const issue = await getIssueBySlug(slug);
  if (!issue) return { title: "이슈를 찾을 수 없음" };
  const cover = pickCover(issue.sources);
  return {
    title: issue.title,
    description: issue.summary,
    alternates: { canonical: `/issue/${issue.slug}` },
    openGraph: cover?.imageUrl ? { images: [cover.imageUrl] } : undefined,
  };
}

export default async function IssueDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const issue = await getIssueBySlug(slug);
  if (!issue) notFound();

  const bodyHtml = renderMarkdown(issue.body);
  const cover = pickCover(issue.sources);
  const when = issueDate(issue);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: issue.title,
    description: issue.summary,
    datePublished: issue.publishedAt,
    keywords: issue.tags.join(", "),
    url: `${SITE_URL}/issue/${issue.slug}`,
    image: cover?.imageUrl ?? undefined,
    citation: issue.sources.map((s) => s.url),
    publisher: { "@type": "Organization", name: "버모아 VMOA" },
  };

  return (
    <article className="max-w-2xl mx-auto flex flex-col gap-5">
      <Link href="/issue" className="text-sm text-muted hover:text-accent transition-colors w-fit">
        ← 이슈 타임라인
      </Link>

      <header className="flex flex-col gap-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <time className="text-xs text-muted-2 tabular-nums">{formatDate(when)}</time>
          {issue.tags.map((t) => (
            <span key={t} className="text-xs rounded-full bg-surface-2 px-2 py-0.5 text-muted">
              #{t}
            </span>
          ))}
          {issue.origin === "auto" ? (
            <span className="text-[11px] rounded-full bg-accent/10 text-accent px-2 py-0.5 font-semibold">
              AI 정리
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight leading-tight text-balance">{issue.title}</h1>
        <p className="text-muted">{issue.summary}</p>
      </header>

      {/* 대표 자료: 유튜브 영상이 있으면 사이트 안에서 재생 (기사는 아래 출처 링크로) */}
      {cover ? <VideoCover source={cover} /> : null}

      <script
        type="application/ld+json"
        // 제목 등에 "</script>" 가 섞여도 태그를 벗어나지 못하게 < 를 이스케이프
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="issue-content" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

      {issue.sources.length > 0 ? (
        <section className="flex flex-col gap-2.5 border-t border-border pt-5">
          <h2 className="text-sm font-bold text-muted">출처 · 원문 자료 {issue.sources.length}</h2>
          {issue.sources.map((s) => (
            <SourceCard key={s.url} source={s} />
          ))}
        </section>
      ) : null}

      {issue.origin === "auto" ? (
        <p className="rounded-lg bg-surface-2 px-4 py-3 text-xs text-muted leading-relaxed">
          이 글은 공개된 기사·공지를 바탕으로 AI가 자동으로 정리했어요. 정확한 내용은 위 출처의 원문을 확인해 주세요.
          잘못된 내용은{" "}
          <Link href="/contact" className="text-accent underline-offset-2 hover:underline">
            문의
          </Link>
          로 알려주시면 바로 고칠게요.
        </p>
      ) : null}

      <AdSlot slot="issue-bottom" />
    </article>
  );
}
