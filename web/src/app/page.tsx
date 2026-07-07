import Link from "next/link";
import { getLiveStreams } from "@/lib/data";
import { LiveCard } from "@/components/live-card";
import { formatCount } from "@/lib/format";

// 실시간 현황이라 캐시하지 않고 요청마다 렌더 (추후 짧은 revalidate로 조정).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const lives = await getLiveStreams();
  const totalViewers = lives.reduce((s, l) => s + l.viewers, 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-live animate-pulse" />
          지금 방송 중인 버튜버
        </h1>
        <p className="text-sm text-muted">
          방송 <span className="font-semibold text-foreground tabular-nums">{lives.length}</span>개 ·
          시청자 <span className="font-semibold text-foreground tabular-nums">{formatCount(totalViewers)}</span>명
          <span className="text-muted-2"> · 치지직 · SOOP · YouTube 통합</span>
        </p>
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
        <Link
          href="/debut"
          className="rounded-xl border border-border bg-surface p-5 hover:border-accent/60 transition-colors"
        >
          <h2 className="font-bold mb-1">신규 데뷔 →</h2>
          <p className="text-sm text-muted">오늘·이번 주 데뷔하는 버튜버를 모아봤어요.</p>
        </Link>
        <Link
          href="/issue"
          className="rounded-xl border border-border bg-surface p-5 hover:border-accent/60 transition-colors"
        >
          <h2 className="font-bold mb-1">이슈 타임라인 →</h2>
          <p className="text-sm text-muted">씬에서 무슨 일이 있었는지 한눈에.</p>
        </Link>
      </section>
    </div>
  );
}
