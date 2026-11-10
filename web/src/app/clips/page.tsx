import type { Metadata } from "next";
import Link from "next/link";
import type { ClipTagCount } from "@/types";
import { getClipTags, getClips } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { ClipGrid, ClipNotice } from "@/components/clip-card";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type Search = Promise<{ tag?: string; v?: string; page?: string }>;

/** ?v=chzzk:<채널ID> → 버튜버 필터 */
function parseVtuber(v: string | undefined): { platform: string; channelId: string } | undefined {
  const m = v ? /^(chzzk|soop):([\w-]{1,64})$/.exec(v) : null;
  return m ? { platform: m[1]!, channelId: m[2]! } : undefined;
}

function href(q: { tag?: string; v?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (q.tag) sp.set("tag", q.tag);
  if (q.v) sp.set("v", q.v);
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  const s = sp.toString();
  return s ? `/clips?${s}` : "/clips";
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { tag } = await searchParams;
  const tags = tag ? await getClipTags() : [];
  const t = tags.find((x) => x.id === tag);
  return {
    title: t ? `${t.label} 클립` : "키리누키 클립",
    description: t
      ? `${t.emoji} ${t.label} — 버튜버 키리누키 클립 모음. 비슷한 클립도 이어서 찾아보세요.`
      : "한국 버튜버 키리누키(팬 편집 클립)를 누가·무엇을·어떤 순간으로 모아 봤어요. 재밌는 클립에서 비슷한 클립으로 이어 보기.",
  };
}

function TagRow({ title, tags, active, v }: { title: string; tags: ClipTagCount[]; active?: string; v?: string }) {
  const shown = tags.filter((t) => t.count > 0 || t.id === active);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-2 w-14 shrink-0">{title}</span>
      {shown.map((t) => (
        <Link
          key={t.id}
          href={href({ tag: active === t.id ? undefined : t.id, v })}
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
  const { tag, v, page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const vtuber = parseVtuber(v);
  const [tags, { total, clips }] = await Promise.all([
    getClipTags(),
    getClips({ tag, vtuber, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);
  const activeTag = tags.find((t) => t.id === tag);
  const vName = vtuber ? clips.flatMap((c) => c.vtubers).find((x) => x.channelId === vtuber.channelId)?.name : undefined;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={activeTag ? `${activeTag.emoji} ${activeTag.label} 클립` : "키리누키 클립"}
        description="팬들이 잘라 올린 버튜버 방송 클립을 버모아가 누가·무엇을·어떤 순간으로 정리했어요. 클립을 누르면 비슷한 클립을 이어서 볼 수 있어요."
      />

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
        <TagRow title="무엇을" tags={tags.filter((t) => t.kind === "category")} active={tag} v={v} />
        <TagRow title="어떤 순간" tags={tags.filter((t) => t.kind === "moment")} active={tag} v={v} />
      </div>

      {clips.length === 0 ? (
        <p className="py-12 text-center text-muted">
          {total === 0 && !tag && !vtuber ? "키리누키를 모으는 중이에요. 조금 뒤에 다시 와 주세요." : "해당하는 클립이 없어요."}
        </p>
      ) : (
        <ClipGrid clips={clips} />
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="페이지">
          {page > 1 ? (
            <Link href={href({ tag, v, page: page - 1 })} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
              ← 이전
            </Link>
          ) : null}
          <span className="text-muted-2 tabular-nums">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={href({ tag, v, page: page + 1 })} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
              다음 →
            </Link>
          ) : null}
        </nav>
      ) : null}

      <ClipNotice />
    </div>
  );
}
