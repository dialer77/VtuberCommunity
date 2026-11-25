import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getChannelProfile, getIntro } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { ClipCard, ClipNotice } from "@/components/clip-card";
import { PlayVideo } from "@/components/player/play-video";

export const dynamic = "force-dynamic";

type Params = Promise<{ platform: string; channelId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { platform, channelId } = await params;
  const p = await getChannelProfile(platform, channelId);
  if (!p) return { title: "입문 클립" };
  return {
    title: `${p.name} 처음이라면 — 입문 키리누키`,
    description: `${p.name}을(를) 처음 보는 사람에게 추천하는 키리누키 모음. 좋아요·명장면·자주 하는 게임을 골고루 골랐어요.`,
    alternates: { canonical: `/vtuber/${p.platform}/${encodeURIComponent(p.channelId)}/intro` },
  };
}

/** 입문 모음 "OO 처음이라면" — 주인공 클립 중 좋아요·명장면·다양성으로 고른 10개 */
export default async function IntroPage({ params }: { params: Params }) {
  const { platform, channelId } = await params;
  const [p, clips] = await Promise.all([getChannelProfile(platform, channelId), getIntro(platform, channelId)]);
  if (!p) notFound();
  const base = `/vtuber/${p.platform}/${encodeURIComponent(p.channelId)}`;
  // 키리누키가 적으면 입문 모음 없이 프로필로
  if (clips === null) redirect(base);
  if (clips === "error") return <p className="py-12 text-center text-muted">불러오지 못했어요. 잠시 뒤에 다시 와 주세요.</p>;
  const first = clips[0];
  return (
    <div className="flex flex-col gap-6">
      <Link href={base} className="text-sm text-muted hover:text-accent transition-colors w-fit">
        ← {p.name} 프로필
      </Link>
      <PageHeader
        title={`${p.name} 처음이라면`}
        description={`${p.name}을(를) 처음 보는 분께 추천하는 키리누키 ${clips.length}개예요. 버모아 좋아요, 레전드·명곡 같은 대표 장면, 자주 하는 게임을 골고루 골랐어요.`}
      />
      {first ? (
        <PlayVideo
          video={{ id: first.videoId, title: first.title, channel: first.channelTitle, queue: clips.slice(1).map((c) => c.videoId) }}
          className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
        >
          ▶ 처음부터 이어서 보기
        </PlayVideo>
      ) : null}
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-5">
        {clips.map((c, i) => (
          <li key={c.videoId} className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-accent">
              {i + 1}. {c.reason}
            </span>
            <ClipCard clip={c} reason={`입문 · ${c.reason}`} />
          </li>
        ))}
      </ol>
      <Link href={`/clips?v=${p.platform}:${p.channelId}`} className="w-fit text-sm text-accent hover:underline">
        {p.name} 키리누키 모두 보기 →
      </Link>
      <ClipNotice />
    </div>
  );
}
