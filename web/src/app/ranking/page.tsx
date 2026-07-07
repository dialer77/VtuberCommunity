import type { Metadata } from "next";
import { getLiveStreams } from "@/lib/data";
import { PlatformBadge } from "@/components/platform-badge";
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
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">실시간 랭킹</h1>
        <p className="text-sm text-muted">현재 동시 시청자 기준.</p>
        <p className="text-xs text-muted-2">
          ※ 시계열 데이터 축적 후 시청시간·급상승 랭킹(P1)으로 확장 예정.
        </p>
      </header>

      <ol className="flex flex-col">
        {lives.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center gap-4 py-3 border-b border-border last:border-b-0"
          >
            <span
              className={`w-8 shrink-0 text-center font-mono font-bold tabular-nums ${
                i < 3 ? "text-accent" : "text-muted-2"
              }`}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold truncate">{s.vtuberName}</span>
                <PlatformBadge platform={s.platform} />
              </div>
              <p className="text-xs text-muted truncate">{s.title}</p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatCount(s.viewers)}
              <span className="text-muted-2 font-normal text-xs">명</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
