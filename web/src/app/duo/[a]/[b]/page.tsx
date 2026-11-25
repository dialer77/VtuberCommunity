import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SharedNode } from "@/types";
import { getDuo } from "@/lib/data";
import { Avatar } from "@/components/avatar";
import { ClipGrid, ClipNotice } from "@/components/clip-card";
import { safeDecode } from "@/components/topic-view";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type Params = Promise<{ a: string; b: string }>;
type Search = Promise<{ page?: string }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const [{ a, b }, { page }] = await Promise.all([params, searchParams]);
  const d = await getDuo(safeDecode(a), safeDecode(b), 1, 0);
  if (!d || d === "error") return { title: "합방 조합", robots: { index: false, follow: true } };
  const games = d.games.slice(0, 3).map((g) => g.node.label);
  return {
    title: `${d.a.label} × ${d.b.label} 합방 클립`,
    description: `${d.a.label}와(과) ${d.b.label}이(가) 함께 나온 키리누키 ${d.together}개${games.length ? ` · 같이 한 게임 ${games.join("·")}` : ""}. 둘의 합방 명장면을 모아 봤어요.`,
    alternates: { canonical: d.canonical },
    ...(Number(page) > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

function SharedChips({ title, items }: { title: string; items: SharedNode[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-bold text-muted">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <Link
            key={s.node.id}
            href={s.node.href}
            prefetch={false}
            className="rounded-full border border-border bg-surface px-2.5 py-1 text-[13px] hover:border-accent/50 hover:text-accent transition-colors"
          >
            {s.node.label}
            {s.a > 1 || s.b > 1 ? (
              <span className="ml-1 text-muted-2 tabular-nums">
                {s.a}·{s.b}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** 합방 조합 — 두 버튜버가 함께 나온 키리누키, 같이 한 게임·사건, 같은 소속 */
export default async function DuoPageView({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ a, b }, { page: pageRaw }] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Number(pageRaw) || 1);
  const d = await getDuo(safeDecode(a), safeDecode(b), PAGE_SIZE, (page - 1) * PAGE_SIZE);
  if (d === null) notFound();
  if (d === "error") return <p className="py-12 text-center text-muted">불러오지 못했어요. 잠시 뒤에 다시 와 주세요.</p>;
  // 순서가 다른 주소는 하나로 (A×B = B×A)
  const here = `/duo/${encodeURIComponent(safeDecode(a))}/${encodeURIComponent(safeDecode(b))}`;
  if (here !== d.canonical) redirect(page > 1 ? `${d.canonical}?page=${page}` : d.canonical);
  const pages = Math.max(1, Math.ceil(d.clipTotal / PAGE_SIZE));
  const person = (n: typeof d.a) => (
    <Link href={n.href} className="flex min-w-0 flex-col items-center gap-1.5 hover:text-accent transition-colors">
      <Avatar name={n.label} platform={n.platform ?? "chzzk"} size={56} />
      <span className="max-w-full truncate font-bold">{n.label}</span>
    </Link>
  );
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {person(d.a)}
          <span className="text-2xl font-extrabold text-accent">×</span>
          {person(d.b)}
        </div>
        <h1 className="text-center text-lg font-extrabold tracking-tight">
          {d.a.label} × {d.b.label} 합방 클립 <span className="text-accent tabular-nums">{d.together}</span>
        </h1>
        <div className="flex flex-col gap-3">
          <SharedChips title="같은 소속" items={d.sameAgency} />
          <SharedChips title="같이 한 게임 (각자 클립 수)" items={d.games} />
          <SharedChips title="같이 엮인 사건·밈" items={d.events} />
        </div>
      </header>

      <section className="flex flex-col gap-3" aria-label="함께 나온 클립">
        <h2 className="text-sm font-bold text-muted">
          함께 나온 키리누키 {d.clipTotal}개 <span className="font-normal text-muted-2">· 좋아요·최신순</span>
        </h2>
        <ClipGrid clips={d.clips} narrow />
        {pages > 1 ? (
          <nav className="flex items-center justify-center gap-3 text-sm" aria-label="페이지">
            {page > 1 ? (
              <Link href={page === 2 ? d.canonical : `${d.canonical}?page=${page - 1}`} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
                ← 이전
              </Link>
            ) : null}
            <span className="text-muted-2 tabular-nums">
              {page} / {pages}
            </span>
            {page < pages ? (
              <Link href={`${d.canonical}?page=${page + 1}`} className="rounded-md border border-border px-3 py-1.5 hover:border-accent/60">
                다음 →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
      <p className="text-xs text-muted-2">※ 합방 조합은 키리누키에 함께 나온 기록(버모아 분류)으로 만든 것이라 실제 합방 횟수와 다를 수 있어요.</p>
      <ClipNotice />
    </div>
  );
}
