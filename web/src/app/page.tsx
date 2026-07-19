import Link from "next/link";
import { getLiveStreams, getTags } from "@/lib/data";
import { LiveCard } from "@/components/live-card";
import { Stat } from "@/components/stat";
import { TagBar } from "@/components/tag-bar";
import { AdSlot } from "@/components/ad-slot";
import { formatCount } from "@/lib/format";

// 실시간 현황이라 캐시하지 않고 요청마다 렌더 (추후 짧은 revalidate로 조정).
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const [lives, tags] = await Promise.all([getLiveStreams(tag), getTags()]);
  const totalViewers = lives.reduce((s, l) => s + l.viewers, 0);
  const platforms = new Set(lives.map((l) => l.platform)).size;
  const activeTag = tag ? tags.find((t) => t.id === tag) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-live" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {activeTag ? `${activeTag.emoji} ${activeTag.label}` : "지금 방송 중"}
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          <Stat label="방송" value={formatCount(lives.length)} unit="개" accent />
          <Stat label="시청자" value={formatCount(totalViewers)} unit="명" />
          <Stat label="플랫폼" value={formatCount(platforms)} unit="개" />
        </div>
      </section>

      <TagBar tags={tags} active={tag} />

      {lives.length === 0 ? (
        <p className="text-muted py-12 text-center">
          해당 태그로 방송 중인 버튜버가 없어요.
        </p>
      ) : (
        <section
          aria-label="라이브 목록"
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          {lives.map((s) => (
            <LiveCard key={s.id} stream={s} />
          ))}
        </section>
      )}

      <AdSlot slot="home-mid" />

      <section className="grid gap-4 sm:grid-cols-2">
        <CtaCard
          href="/debut"
          title="신규 데뷔"
          desc="오늘·이번 주 데뷔하는 버튜버를 모아봤어요."
        />
        <CtaCard
          href="/issue"
          title="이슈 타임라인"
          desc="씬에서 무슨 일이 있었는지 한눈에."
        />
      </section>
    </div>
  );
}

function CtaCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/60"
    >
      <h2 className="font-bold flex items-center gap-1">
        {title}
        <span className="text-accent transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </h2>
      <p className="text-sm text-muted">{desc}</p>
    </Link>
  );
}
