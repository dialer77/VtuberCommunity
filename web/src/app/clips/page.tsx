import type { Metadata } from "next";
import Link from "next/link";
import type { ClipTagCount } from "@/types";
import { getClipTags, getClips } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import Form from "next/form";
import { ClipGrid, ClipNotice } from "@/components/clip-card";
import { ForYou } from "@/components/for-you";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type Search = Promise<{ tag?: string; v?: string; page?: string; sort?: string; q?: string }>;

/** ?v=chzzk:<채널ID> · youtube:UC… → 버튜버 필터 */
function parseVtuber(v: string | undefined): { platform: string; channelId: string } | undefined {
  const m = v ? /^(chzzk|soop|youtube):([\w-]{1,64})$/.exec(v) : null;
  return m ? { platform: m[1]!, channelId: m[2]! } : undefined;
}

function href(q: { tag?: string; v?: string; page?: number; sort?: string; q?: string }): string {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.tag) sp.set("tag", q.tag);
  if (q.v) sp.set("v", q.v);
  if (q.sort === "likes") sp.set("sort", "likes");
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  const s = sp.toString();
  return s ? `/clips?${s}` : "/clips";
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { tag, q } = await searchParams;
  // 검색 결과 페이지는 검색엔진에 내보내지 않는다
  if (q?.trim()) return { title: `'${q.trim().slice(0, 40)}' 클립 검색`, robots: { index: false, follow: true } };
  const tags = tag ? await getClipTags() : [];
  const t = tags.find((x) => x.id === tag);
  return {
    title: t ? `${t.label} 클립` : "키리누키 클립",
    description: t
      ? `${t.emoji} ${t.label} — 버튜버 키리누키 클립 모음. 비슷한 클립도 이어서 찾아보세요.`
      : "한국 버튜버 키리누키(팬 편집 클립)를 누가·무엇을·어떤 순간으로 모아 봤어요. 재밌는 클립에서 비슷한 클립으로 이어 보기.",
  };
}

function TagRow({ title, tags, active, v, sort, q }: { title: string; tags: ClipTagCount[]; active?: string; v?: string; sort?: string; q?: string }) {
  const shown = tags.filter((t) => t.count > 0 || t.id === active);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-2 w-14 shrink-0">{title}</span>
      {shown.map((t) => (
        <Link
          key={t.id}
          href={href({ tag: active === t.id ? undefined : t.id, v, sort, q })}
          scroll={false}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            active === t.id
              ? "border-accent bg-accent text-accent-fg font-semibold"
              : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
          }`}
        >
          {t.emoji} {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function ClipsPage({ searchParams }: { searchParams: Search }) {
  const { tag, v, page: pageRaw, sort: sortRaw, q: qRaw } = await searchParams;
  const q = (qRaw ?? "").trim().slice(0, 100) || undefined;
  const sort = sortRaw === "likes" ? "likes" : undefined;
  const page = Math.max(1, Number(pageRaw) || 1);
  const vtuber = parseVtuber(v);
  const [tags, { total, clips }] = await Promise.all([
    getClipTags(),
    getClips({ q, tag, vtuber, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);
  const activeTag = tags.find((t) => t.id === tag);
  const vName = vtuber ? clips.flatMap((c) => c.vtubers).find((x) => x.channelId === vtuber.channelId)?.name : undefined;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={q ? `'${q}' 클립 검색` : activeTag ? `${activeTag.emoji} ${activeTag.label} 클립` : "키리누키 클립"}
        description="팬들이 잘라 올린 버튜버 방송 클립을 버모아가 누가·무엇을·어떤 순간으로 정리했어요. 클립을 누르면 비슷한 클립을 이어서 볼 수 있어요."
      />

      <Form action="/clips" role="search" className="flex gap-2">
        {v ? <input type="hidden" name="v" value={v} /> : null}
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        {sort ? <input type="hidden" name="sort" value={sort} /> : null}
        <input
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder="클립 검색 — 버튜버·게임·사건·제목, #레전드"
          aria-label="클립 검색"
          autoComplete="off"
          enterKeyHint="search"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
        />
        <button type="submit" className="shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg">
          검색
        </button>
      </Form>

      {q ? (
        <p className="text-sm text-muted">
          검색 결과 {total}개 ·{" "}
          <Link href={href({ tag, v, sort })} className="hover:text-foreground">
            검색어 지우기
          </Link>
        </p>
      ) : null}

      {!q && !tag && !vtuber && page === 1 ? <ForYou moments={tags.filter((t) => t.kind === "moment")} /> : null}

      {vtuber ? (
        <p className="text-sm">
          <Link href={`/vtuber/${vtuber.platform}/${vtuber.channelId}`} className="font-semibold text-accent hover:underline">
            {vName ?? "버튜버"}
          </Link>{" "}
          의 클립만 보는 중 ·{" "}
          <Link href={href({ tag })} className="text-muted hover:text-foreground">
            전체 보기
          </Link>
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-2 w-14 shrink-0">정렬</span>
          {[
            { id: undefined, label: "최신순" },
            { id: "likes", label: "좋아요순" },
          ].map((o) => (
            <Link
              key={o.label}
              href={href({ tag, v, sort: o.id, q })}
              scroll={false}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                sort === o.id
                  ? "border-accent bg-accent text-accent-fg font-semibold"
                  : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
        <TagRow title="무엇을" tags={tags.filter((t) => t.kind === "category")} active={tag} v={v} sort={sort} q={q} />
        <TagRow title="어떤 순간" tags={tags.filter((t) => t.kind === "moment")} active={tag} v={v} sort={sort} q={q} />
      </div>

      {clips.length === 0 ? (
        <p className="py-12 text-center text-muted">
          {q
            ? "찾는 클립이 없어요. 버튜버 이름·게임·사건 이름으로 찾아보세요."
            : total === 0 && !tag && !vtuber
              ? "키리누키를 모으는 중이에요. 조금 뒤에 다시 와 주세요."
              : "해당하는 클립이 없어요."}
        </p>
      ) : (
        <ClipGrid clips={clips} />
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="페이지">
          {page > 1 ? (
            <Link href={href({ tag, v, sort, q, page: page - 1 })} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
              ← 이전
            </Link>
          ) : null}
          <span className="text-muted-2 tabular-nums">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={href({ tag, v, sort, q, page: page + 1 })} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
              다음 →
            </Link>
          ) : null}
        </nav>
      ) : null}

      <ClipNotice />
    </div>
  );
}
