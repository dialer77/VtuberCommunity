import type { Metadata } from "next";
import { getRanking, getRising } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { Avatar } from "@/components/avatar";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = {
  title: "랭킹",
  description: "최근 시청자 평균 기준 버튜버 방송 랭킹과 실시간 급상승.",
};

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const [ranking, rising] = await Promise.all([getRanking(), getRising()]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <PageHeader
          title="랭킹"
          description="최근 3시간 평균 시청자 기준. 시계열 스냅샷으로 집계."
          live
        />
      </div>

      {rising.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-rise flex items-center gap-1.5">
            🔥 실시간 급상승
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {rising.slice(0, 6).map((r) => (
              <a
                key={r.channelId}
                href={r.channelUrl}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-rise/60"
              >
                <Avatar name={r.channelName} platform={r.platform} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">
                      {r.channelName}
                    </span>
                    <PlatformBadge platform={r.platform} />
                  </div>
                  <span className="text-xs text-muted-2 tabular-nums">
                    {formatCount(r.firstViewers)} → {formatCount(r.latestViewers)}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-bold text-rise tabular-nums">
                  +{Math.round(r.growthPct * 100)}%
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-muted">시청자 랭킹</h2>
        <ol className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
          {ranking.map((s, i) => (
            <li
              key={s.channelId}
              className="flex items-center gap-3 p-3 border-b border-border last:border-b-0 transition-colors hover:bg-surface-2/60"
            >
              <span
                className={`w-7 shrink-0 text-center font-mono font-bold tabular-nums ${
                  i < 3 ? "text-accent" : "text-muted-2"
                }`}
              >
                {i + 1}
              </span>
              <Avatar name={s.channelName} platform={s.platform} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">
                    {s.channelName}
                  </span>
                  <PlatformBadge platform={s.platform} />
                </div>
                <p className="text-xs text-muted truncate">
                  {s.title ?? ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold tabular-nums">
                  {formatCount(s.avgViewers)}
                  <span className="text-muted-2 font-normal text-xs ml-0.5">
                    평균
                  </span>
                </div>
                <div className="text-xs text-muted-2 tabular-nums">
                  peak {formatCount(s.peakViewers)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
