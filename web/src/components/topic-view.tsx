import Link from "next/link";
import type { TopicPage } from "@/types";
import { PageHeader } from "@/components/page-header";
import { ClipGrid, ClipNotice } from "@/components/clip-card";
import { MindMap } from "@/components/mind-map";

export const TOPIC_PAGE_SIZE = 24;

/** 주소의 이름 (이미 풀린 값이 와도 안전하게) */
export function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 게임·사건 페이지 본문: 관계도 + 클립 목록 */
export function TopicView({ kind, data, page }: { kind: "game" | "event"; data: TopicPage; page: number }) {
  const name = data.center.label;
  const base = `/${kind}/${encodeURIComponent(name)}`;
  const pages = Math.max(1, Math.ceil(data.clipTotal / TOPIC_PAGE_SIZE));
  const people = data.groups.find((g) => g.key === "players" || g.key === "people");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={kind === "game" ? `${name} 키리누키` : name}
        description={
          kind === "game"
            ? `${name} 을(를) 한 버튜버들의 키리누키 ${data.clipTotal}개${people ? ` · 버튜버 ${people.items.length + people.more}명` : ""}. 누가 어떤 장면을 남겼는지 관계도로 볼 수 있어요.`
            : `'${name}' 을(를) 다룬 키리누키 ${data.clipTotal}개${people ? ` · 나온 버튜버 ${people.items.length + people.more}명` : ""}. 같은 일을 여러 채널이 어떻게 잘랐는지 모아 봤어요.`
        }
      />

      {page === 1 ? (
        <section className="flex flex-col gap-2" aria-label="관계도">
          <h2 className="text-sm font-bold text-muted">관계도</h2>
          <MindMap graph={data} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-label="클립">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-muted">
            클립 {data.clipTotal}개 <span className="font-normal text-muted-2">· 좋아요·최신순</span>
          </h2>
          <Link href={`/clips?q=${encodeURIComponent(name)}`} className="text-sm text-accent hover:underline">
            클립 검색으로 보기 →
          </Link>
        </div>
        <ClipGrid clips={data.clips} />
        {pages > 1 ? (
          <nav className="flex items-center justify-center gap-3 text-sm" aria-label="페이지">
            {page > 1 ? (
              <Link href={page === 2 ? base : `${base}?page=${page - 1}`} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
                ← 이전
              </Link>
            ) : null}
            <span className="text-muted-2 tabular-nums">
              {page} / {pages}
            </span>
            {page < pages ? (
              <Link href={`${base}?page=${page + 1}`} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
                다음 →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
      <ClipNotice />
    </div>
  );
}
