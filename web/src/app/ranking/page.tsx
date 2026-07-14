import type { Metadata } from "next";
import { getLiveStreams } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { Avatar } from "@/components/avatar";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = {
  title: "랭킹",
  description: "현재 동시 시청자 기준 버튜버 방송 랭킹.",
};

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  // 지금은 "현재 동접" 스냅샷 순위. 시계열이 쌓이면 시청시간·급상승 랭킹으로 확장.
  const lives = await getLiveStreams();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageHeader title="실시간 랭킹" description="현재 동시 시청자 기준." live />
        <p className="text-xs text-muted-2">
          ※ 시계열 데이터 축적 후 시청시간·급상승 랭킹(P1)으로 확장 예정.
        </p>
      </div>

      <ol className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
        {lives.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center gap-3 p-3 border-b border-border last:border-b-0 transition-colors hover:bg-surface-2/60"
          >
            <span
              className={`w-7 shrink-0 text-center font-mono font-bold tabular-nums ${
                i < 3 ? "text-accent" : "text-muted-2"
              }`}
            >
              {i + 1}
            </span>
            <Avatar name={s.vtuberName} platform={s.platform} size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold truncate">{s.vtuberName}</span>
                <PlatformBadge platform={s.platform} />
              </div>
              <p className="text-xs text-muted truncate">{s.title}</p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatCount(s.viewers)}
              <span className="text-muted-2 font-normal text-xs ml-0.5">명</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
