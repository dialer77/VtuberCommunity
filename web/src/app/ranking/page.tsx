import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodRankingEntry, RankingMetric, RankingPeriod } from "@/types";
import { getRanking, getRising, getPeriodRanking } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { Avatar } from "@/components/avatar";
import { formatCount, formatYmd } from "@/lib/format";

export const metadata: Metadata = {
  title: "랭킹",
  description: "오늘·주간·월간 버튜버 랭킹 — 총 시청시간, 평균 시청자, 최고 동접, 방송시간 기준. 실시간 급상승 포함.",
};

export const dynamic = "force-dynamic";

const PERIODS: { id: RankingPeriod; label: string; desc: string }[] = [
  { id: "live", label: "실시간", desc: "최근 3시간 평균 시청자 + 급상승" },
  { id: "today", label: "오늘", desc: "오늘 0시(KST)부터" },
  { id: "week", label: "주간", desc: "최근 7일" },
  { id: "month", label: "월간", desc: "최근 30일" },
];

const METRICS: { id: RankingMetric; label: string }[] = [
  { id: "watch", label: "총 시청시간" },
  { id: "avg", label: "평균 시청자" },
  { id: "peak", label: "최고 동접" },
  { id: "hours", label: "방송시간" },
];

function href(period: RankingPeriod, metric: RankingMetric): string {
  const q = new URLSearchParams();
  if (period !== "week") q.set("period", period);
  if (metric !== "watch" && period !== "live") q.set("metric", metric);
  const s = q.toString();
  return s ? `/ranking?${s}` : "/ranking";
}

/** 시간 표시: 1시간 미만은 분, 100시간 이상은 정수 */
function duration(h: number): { value: string; unit: string } {
  if (h < 1) return { value: String(Math.max(1, Math.round(h * 60))), unit: "분" };
  return { value: h >= 100 ? formatCount(Math.round(h)) : h.toFixed(1), unit: "시간" };
}
function durationText(h: number): string {
  const d = duration(h);
  return d.value + d.unit;
}

function Tabs<T extends string>({
  items,
  active,
  link,
  small,
}: {
  items: { id: T; label: string }[];
  active: T;
  link: (id: T) => string;
  small?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((x) => (
        <Link
          key={x.id}
          href={link(x.id)}
          scroll={false}
          className={`rounded-full border transition-colors ${small ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${
            active === x.id
              ? "border-accent bg-accent text-accent-fg font-semibold"
              : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
          }`}
        >
          {x.label}
        </Link>
      ))}
    </div>
  );
}

function PeriodRow({ s, i, metric }: { s: PeriodRankingEntry; i: number; metric: RankingMetric }) {
  const main: Record<RankingMetric, { value: string; unit: string }> = {
    watch: duration(s.watchHours),
    avg: { value: formatCount(s.avgViewers), unit: "명 평균" },
    peak: { value: formatCount(s.peakViewers), unit: "명 최고" },
    hours: { ...duration(s.liveHours), unit: `${duration(s.liveHours).unit} 방송` },
  };
  const m = main[metric];
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={`/vtuber/${s.platform}/${s.channelId}`}
        className="flex items-center gap-3 p-3 transition-colors hover:bg-surface-2/60"
      >
        <span
          className={`w-7 shrink-0 text-center font-mono font-bold tabular-nums ${i < 3 ? "text-accent" : "text-muted-2"}`}
        >
          {i + 1}
        </span>
        <Avatar name={s.channelName} platform={s.platform} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{s.channelName}</span>
            <PlatformBadge platform={s.platform} />
          </div>
          <p className="text-xs text-muted truncate">{s.title ?? ""}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold tabular-nums">
            {m.value}
            <span className="text-muted-2 font-normal text-xs ml-0.5">{m.unit}</span>
          </div>
          <div className="text-xs text-muted-2 tabular-nums hidden sm:block">
            평균 {formatCount(s.avgViewers)} · 최고 {formatCount(s.peakViewers)} · 방송 {durationText(s.liveHours)}
          </div>
        </div>
      </Link>
    </li>
  );
}

async function LiveRanking() {
  const [ranking, rising] = await Promise.all([getRanking(), getRising()]);
  return (
    <>
      {rising.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-rise flex items-center gap-1.5">🔥 실시간 급상승</h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {rising.slice(0, 6).map((r) => (
              <Link
                key={r.channelId}
                href={`/vtuber/${r.platform}/${r.channelId}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-rise/60"
              >
                <Avatar name={r.channelName} platform={r.platform} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{r.channelName}</span>
                    <PlatformBadge platform={r.platform} />
                  </div>
                  <span className="text-xs text-muted-2 tabular-nums">
                    {formatCount(r.firstViewers)} → {formatCount(r.latestViewers)}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-bold text-rise tabular-nums">
                  +{Math.round(r.growthPct * 100)}%
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-muted">최근 3시간 평균 시청자</h2>
        <ol className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
          {ranking.map((s, i) => (
            <li key={s.channelId} className="border-b border-border last:border-b-0">
              <Link
                href={`/vtuber/${s.platform}/${s.channelId}`}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-surface-2/60"
              >
                <span
                  className={`w-7 shrink-0 text-center font-mono font-bold tabular-nums ${i < 3 ? "text-accent" : "text-muted-2"}`}
                >
                  {i + 1}
                </span>
                <Avatar name={s.channelName} platform={s.platform} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{s.channelName}</span>
                    <PlatformBadge platform={s.platform} />
                  </div>
                  <p className="text-xs text-muted truncate">{s.title ?? ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums">
                    {formatCount(s.avgViewers)}
                    <span className="text-muted-2 font-normal text-xs ml-0.5">평균</span>
                  </div>
                  <div className="text-xs text-muted-2 tabular-nums">peak {formatCount(s.peakViewers)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

async function PeriodRankingList({
  period,
  metric,
}: {
  period: Exclude<RankingPeriod, "live">;
  metric: RankingMetric;
}) {
  const { since, trackingSince, ranking } = await getPeriodRanking(period, metric);
  const partial = trackingSince && since && trackingSince > since;
  return (
    <section className="flex flex-col gap-3">
      <Tabs items={METRICS} active={metric} link={(m) => href(period, m)} small />
      {partial ? (
        <p className="text-xs text-muted-2">
          {trackingSince ? formatYmd(trackingSince) : ""}부터 집계를 시작해 아직 기간을 다 채우지 못했어요.
        </p>
      ) : null}
      {metric === "avg" ? (
        <p className="text-xs text-muted-2">평균 시청자는 이 기간에 1시간 이상 방송한 채널만 집계해요.</p>
      ) : null}
      {ranking.length === 0 ? (
        <p className="text-muted py-12 text-center">아직 집계된 방송이 없어요.</p>
      ) : (
        <ol className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
          {ranking.map((s, i) => (
            <PeriodRow key={s.channelId} s={s} i={i} metric={metric} />
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; metric?: string }>;
}) {
  const q = await searchParams;
  const period: RankingPeriod =
    q.period === "live" || q.period === "today" || q.period === "month" ? q.period : "week";
  const metric: RankingMetric =
    q.metric === "avg" || q.metric === "peak" || q.metric === "hours" ? q.metric : "watch";
  const desc = PERIODS.find((p) => p.id === period)?.desc ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="랭킹" description={`${desc} 기준. 방송 시청자를 1분마다 집계해요.`} live={period === "live"} />
      <Tabs items={PERIODS} active={period} link={(p) => href(p, metric)} />
      {period === "live" ? <LiveRanking /> : <PeriodRankingList period={period} metric={metric} />}
    </div>
  );
}
