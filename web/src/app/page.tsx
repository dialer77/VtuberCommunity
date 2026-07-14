import Link from "next/link";
import { getLiveStreams } from "@/lib/data";
import { LiveCard } from "@/components/live-card";
import { Stat } from "@/components/stat";
import { formatCount } from "@/lib/format";

// 실시간 현황이라 캐시하지 않고 요청마다 렌더 (추후 짧은 revalidate로 조정).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const lives = await getLiveStreams();
  const totalViewers = lives.reduce((s, l) => s + l.viewers, 0);
  const platforms = new Set(lives.map((l) => l.platform)).size;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-live" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">지금 방송 중</h1>
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          <Stat label="방송" value={formatCount(lives.length)} unit="개" accent />
          <Stat label="시청자" value={formatCount(totalViewers)} unit="명" />
          <Stat label="플랫폼" value={formatCount(platforms)} unit="개" />
        </div>
      </section>

      <section
        aria-label="라이브 목록"
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      >
        {lives.map((s) => (
          <LiveCard key={s.id} stream={s} />
        ))}
      </section>

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
