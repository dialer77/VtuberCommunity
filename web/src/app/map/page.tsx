import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGraphNode } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { MindMap } from "@/components/mind-map";

export const dynamic = "force-dynamic";

type Search = Promise<{ n?: string }>;

const TYPE_LABEL: Record<string, string> = { vtuber: "버튜버", agency: "소속사", group: "그룹", game: "게임·콘텐츠", event: "사건·밈", issue: "이슈" };

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { n } = await searchParams;
  const g = n ? await getGraphNode(n) : null;
  if (!g) return { title: "관계도", robots: { index: false, follow: true } };
  return {
    title: `${g.center.label} 관계도`,
    description: `${g.center.label}(${TYPE_LABEL[g.center.type] ?? ""})와 이어진 버튜버·소속사·게임·사건을 한눈에 보는 관계도.`,
    alternates: { canonical: `/map?n=${encodeURIComponent(g.center.id)}` },
  };
}

/** 어떤 점이든 가운데 두고 보는 관계도 (소속사·그룹·이슈처럼 따로 페이지가 없는 것도) */
export default async function MapPage({ searchParams }: { searchParams: Search }) {
  const { n } = await searchParams;
  if (!n) notFound();
  const g = await getGraphNode(n);
  if (!g) notFound();
  const own = g.center.href.startsWith("/map") ? null : g.center.href;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${g.center.label} 관계도`}
        description={`${TYPE_LABEL[g.center.type] ?? ""} · 이름을 누르면 그 대상의 페이지나 관계도로 이어져요.`}
      />
      {own ? (
        <Link href={own} className="w-fit text-sm text-accent hover:underline">
          {g.center.label} 페이지로 →
        </Link>
      ) : null}
      <MindMap graph={g} />
    </div>
  );
}
