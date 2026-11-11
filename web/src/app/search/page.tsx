import type { Metadata } from "next";
import { searchVtubers } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PAGE_SIZE, SearchView } from "@/components/search/search-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "버튜버 찾기",
  description: "방송 중이 아닌 버튜버도 이름·초성·태그로 찾아보세요.",
  robots: { index: false, follow: true },
};

type SP = Promise<{ q?: string | string[]; tag?: string | string[]; offset?: string | string[] }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const tags = (Array.isArray(sp.tag) ? sp.tag : [sp.tag ?? ""])
    .flatMap((t) => t.split(","))
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  const offset = Math.max(Number(one(sp.offset)) || 0, 0);
  const data = await searchVtubers({ q: q.trim(), tags, limit: PAGE_SIZE, offset });
  // 주소가 바뀌어 서버가 다시 그리면(뒤로 가기·헤더 검색 등) 화면 상태를 새로 시작한다
  const key = `${q}|${tags.join(",")}|${offset}`;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <PageHeader title="버튜버 찾기" description="방송 중이 아니어도 버모아가 본 적 있는 버튜버는 모두 찾을 수 있어요." />
      <SearchView key={key} initial={data} initialQuery={{ q, tags, offset }} />
    </div>
  );
}
