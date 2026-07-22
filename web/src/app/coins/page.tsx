import type { Metadata } from "next";
import Link from "next/link";
import type { CoinSort } from "@/types";
import { getCoins } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { Avatar } from "@/components/avatar";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = {
  title: "V코인 시세판",
  description:
    "버튜버를 시청자 기반 지수로 줄세운 가상 시세판. 시가총액·급등·급락으로 지금 뜨고 지는 버튜버를 한눈에.",
};

export const dynamic = "force-dynamic";

const SORTS: { id: CoinSort; label: string }[] = [
  { id: "cap", label: "시가총액" },
  { id: "gainers", label: "급등 📈" },
  { id: "losers", label: "급락 📉" },
];

export default async function CoinsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortParam } = await searchParams;
  const sort: CoinSort =
    sortParam === "gainers" || sortParam === "losers" ? sortParam : "cap";
  const coins = await getCoins(sort);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <PageHeader
          title="🪙 V코인 시세판"
          description="버튜버를 시청자 기반 지수로 줄세운 가상 시세. 재미용이에요."
          live
        />
      </div>

      {/* 정렬 탭 */}
      <div className="flex gap-2">
        {SORTS.map((s) => (
          <Link
            key={s.id}
            href={s.id === "cap" ? "/coins" : `/coins?sort=${s.id}`}
            scroll={false}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              sort === s.id
                ? "border-accent bg-accent text-accent-fg font-semibold"
                : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {coins.length === 0 ? (
        <p className="text-muted py-12 text-center">
          시세 데이터가 아직 부족해요. 잠시 후 다시 확인해 주세요.
        </p>
      ) : (
        <ol className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
          {coins.map((c, i) => (
            <li
              key={c.channelId}
              className="border-b border-border last:border-b-0"
            >
              <Link
                href={`/vtuber/${c.platform}/${c.channelId}`}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-surface-2/60"
              >
                <span
                  className={`w-6 shrink-0 text-center font-mono font-bold tabular-nums text-sm ${
                    i < 3 ? "text-accent" : "text-muted-2"
                  }`}
                >
                  {i + 1}
                </span>
                <Avatar name={c.channelName} platform={c.platform} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">
                      {c.channelName}
                    </span>
                    {c.isLive ? (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-live animate-pulse shrink-0"
                        title="방송 중"
                      />
                    ) : null}
                    <PlatformBadge platform={c.platform} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold tabular-nums">
                    {formatCount(c.price)}
                    <span className="text-muted-2 font-normal text-xs ml-0.5">
                      V
                    </span>
                  </div>
                  <Change pct={c.changePct} />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-muted-2">
        ※ 시세는 최근 시청자 평균 기반의 <b>가상 지수</b>이며 실제 화폐·주식이
        아닙니다. 등락률은 직전 24시간 대비.
      </p>
    </div>
  );
}

function Change({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <div className="text-xs text-muted-2 tabular-nums">신규</div>;
  }
  const up = pct >= 0;
  const rounded = Math.round(pct * 100);
  return (
    <div
      className={`text-xs font-semibold tabular-nums ${
        up ? "text-live" : "text-sky-500 dark:text-sky-400"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(rounded)}%
    </div>
  );
}
