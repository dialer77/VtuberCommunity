import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTopicPage } from "@/lib/data";
import { TOPIC_PAGE_SIZE, TopicView, safeDecode } from "@/components/topic-view";

export const dynamic = "force-dynamic";

type Params = Promise<{ name: string }>;
type Search = Promise<{ page?: string }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const [{ name: raw }, { page }] = await Promise.all([params, searchParams]);
  const d = await getTopicPage("game", safeDecode(raw), 1, 0);
  if (!d || d === "error") return { title: safeDecode(raw), robots: { index: false, follow: true } };
  const name = d.center.label;
  return {
    title: `${name} 키리누키 — 버튜버 클립 모음`,
    description: `${name} 을(를) 한 버튜버들의 키리누키(클립) ${d.clipTotal}개와 누가 함께 했는지 관계도로 모았어요.`,
    alternates: { canonical: `/game/${encodeURIComponent(name)}` },
    ...(Number(page) > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ name: raw }, { page: pageRaw }] = await Promise.all([params, searchParams]);
  const name = safeDecode(raw);
  const page = Math.max(1, Number(pageRaw) || 1);
  const d = await getTopicPage("game", name, TOPIC_PAGE_SIZE, (page - 1) * TOPIC_PAGE_SIZE);
  // 관계 그래프에 없는 이름(클립이 적거나 일반 주제)은 클립 검색으로
  if (d === null) redirect(`/clips?q=${encodeURIComponent(name)}`);
  if (d === "error") return <p className="py-12 text-center text-muted">불러오지 못했어요. 잠시 뒤에 다시 와 주세요.</p>;
  return <TopicView kind="game" data={d} page={page} />;
}
