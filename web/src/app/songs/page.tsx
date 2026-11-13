import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { getSongs } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PlayAllSongs, SongGrid, SongNotice } from "@/components/song-card";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type Search = Promise<{ kind?: string; v?: string; page?: string; q?: string }>;
type Kind = "cover" | "original";

/** ?v=chzzk:<채널ID> · youtube:UC… → 버튜버 필터 */
function parseVtuber(v: string | undefined): { platform: string; channelId: string } | undefined {
  const m = v ? /^(chzzk|soop|youtube):([\w-]{1,64})$/.exec(v) : null;
  return m ? { platform: m[1]!, channelId: m[2]! } : undefined;
}

function href(q: { kind?: Kind; v?: string; page?: number; q?: string }): string {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.kind) sp.set("kind", q.kind);
  if (q.v) sp.set("v", q.v);
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  const s = sp.toString();
  return s ? `/songs?${s}` : "/songs";
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { kind, q, v } = await searchParams;
  if (q?.trim()) return { title: `'${q.trim().slice(0, 40)}' 노래 검색`, robots: { index: false, follow: true } };
  const title = kind === "cover" ? "버튜버 커버곡" : kind === "original" ? "버튜버 오리지널곡" : "버튜버 노래 — 커버·오리지널";
  return {
    title,
    description: "버튜버들이 공식 유튜브 채널에 올린 커버곡·오리지널곡을 새로 올라온 순서로 모았어요. 사이트 안에서 이어서 들을 수 있어요.",
    ...(v ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function SongsPage({ searchParams }: { searchParams: Search }) {
  const { kind: kindRaw, v, page: pageRaw, q: qRaw } = await searchParams;
  const kind: Kind | undefined = kindRaw === "cover" || kindRaw === "original" ? kindRaw : undefined;
  const q = (qRaw ?? "").trim().slice(0, 60) || undefined;
  const page = Math.max(1, Number(pageRaw) || 1);
  const vtuber = parseVtuber(v);
  const { total, songs } = await getSongs({ kind, q, vtuber, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const vName = vtuber ? songs[0]?.vtuber?.name : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={q ? `'${q}' 노래 검색` : kind === "cover" ? "커버곡" : kind === "original" ? "오리지널곡" : "노래"}
        description="버튜버들이 공식 유튜브 채널에 올린 커버곡·오리지널곡이에요. 누르면 사이트 안에서 재생하고, 끝나면 목록의 다음 곡으로 이어져요."
      />

      <Form action="/songs" role="search" className="flex gap-2">
        {v ? <input type="hidden" name="v" value={v} /> : null}
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <input
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder="노래 검색 — 곡 제목·버튜버 이름"
          aria-label="노래 검색"
          autoComplete="off"
          enterKeyHint="search"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
        />
        <button type="submit" className="shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg">
          검색
        </button>
      </Form>

      {vtuber ? (
        <p className="text-sm">
          <Link href={`/vtuber/${vtuber.platform}/${vtuber.channelId}`} className="font-semibold text-accent hover:underline">
            {vName ?? "버튜버"}
          </Link>{" "}
          의 노래만 보는 중 ·{" "}
          <Link href={href({ kind, q })} className="text-muted hover:text-foreground">
            전체 보기
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {[
            { id: undefined, label: "전체" },
            { id: "cover" as const, label: "커버" },
            { id: "original" as const, label: "오리지널" },
          ].map((o) => (
            <Link
              key={o.label}
              href={href({ kind: o.id, v, q })}
              scroll={false}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                kind === o.id
                  ? "border-accent bg-accent text-accent-fg font-semibold"
                  : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
              }`}
            >
              {o.label}
            </Link>
          ))}
          <span className="ml-1 text-xs text-muted-2 tabular-nums">{total.toLocaleString("ko-KR")}곡</span>
        </div>
        <PlayAllSongs songs={songs} label={pages > 1 ? "▶ 이 페이지 전체 재생" : "▶ 전체 재생"} />
      </div>

      {songs.length === 0 ? (
        <p className="py-12 text-center text-muted">
          {q ? "찾는 노래가 없어요. 곡 제목이나 버튜버 이름으로 찾아보세요." : "노래를 모으는 중이에요. 조금 뒤에 다시 와 주세요."}
        </p>
      ) : (
        <SongGrid songs={songs} showVtuber={!vtuber} />
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="페이지">
          {page > 1 ? (
            <Link href={href({ kind, v, q, page: page - 1 })} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
              ← 이전
            </Link>
          ) : null}
          <span className="text-muted-2 tabular-nums">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={href({ kind, v, q, page: page + 1 })} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
              다음 →
            </Link>
          ) : null}
        </nav>
      ) : null}

      <SongNotice />
    </div>
  );
}
