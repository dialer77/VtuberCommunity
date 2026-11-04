import type { Metadata } from "next";
import Link from "next/link";
import type { DebutEvent } from "@/types";
import { getDebutWindow } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { Avatar } from "@/components/avatar";
import { formatDateTime, debutCountdown } from "@/lib/format";

export const metadata: Metadata = {
  title: "신규 데뷔",
  description: "이번 달·최근 1개월·3개월 사이에 데뷔하거나 새로 등장한 한국 버튜버.",
};

export const dynamic = "force-dynamic";

type Range = "month" | "30d" | "90d";

const RANGES: { id: Range; label: string }[] = [
  { id: "month", label: "이번 달" },
  { id: "30d", label: "1개월" },
  { id: "90d", label: "3개월" },
];

/** 기간 시작 시각 (이번 달 = KST 1일 0시) */
function rangeStart(range: Range): number {
  if (range === "30d") return Date.now() - 30 * 86_400_000;
  if (range === "90d") return Date.now() - 90 * 86_400_000;
  const kst = new Date(Date.now() + 9 * 3_600_000);
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3_600_000;
}

const MAX_DETECTED = 60;

function DebutRow({ d }: { d: DebutEvent }) {
  const cd = debutCountdown(d.debutAt);
  const upcoming = /D-|오늘|내일/.test(cd);
  return (
    <li>
      <Link
        href={`/vtuber/${d.platform}/${d.id}`}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent/60"
      >
        <span
          className={`w-14 shrink-0 rounded-lg px-2 py-1.5 text-center text-sm font-bold tabular-nums ${
            upcoming ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted-2"
          }`}
        >
          {cd}
        </span>
        <Avatar name={d.vtuberName} platform={d.platform} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{d.vtuberName}</h3>
            {d.debutSignal ? (
              <span className="shrink-0 rounded-full bg-accent/15 text-accent text-[11px] font-bold px-2 py-0.5">
                🎀 데뷔 방송
              </span>
            ) : null}
            <PlatformBadge platform={d.platform} />
          </div>
          <p className="text-sm text-muted truncate">
            {d.note ?? "데뷔 예정"}
            {d.agency ? ` · ${d.agency}` : ""}
          </p>
        </div>
        <time className="shrink-0 text-xs text-muted-2 tabular-nums hidden sm:block">
          {formatDateTime(d.debutAt)}
        </time>
      </Link>
    </li>
  );
}

export default async function DebutPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: r } = await searchParams;
  const range: Range = r === "30d" || r === "90d" ? r : "month";
  const since = rangeStart(range);

  // 기간 시작 이후에 처음 감지된 채널만 — 기간이 지나면(3개월 탭이면 90일) 목록에서 빠진다
  const { confirmed, detected, detectedTotal } = await getDebutWindow(new Date(since).toISOString());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="신규 데뷔"
        description="데뷔(처음 감지)한 날부터 기간 동안 계속 보여요. 3개월이 지나면 신규 목록에서 빠져요. 데뷔 방송이 확인된 채널(🎀)을 먼저 보여줘요."
      />

      {/* 기간 탭 */}
      <div className="flex gap-2">
        {RANGES.map((x) => (
          <Link
            key={x.id}
            href={x.id === "month" ? "/debut" : `/debut?range=${x.id}`}
            scroll={false}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              range === x.id
                ? "border-accent bg-accent text-accent-fg font-semibold"
                : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="font-bold">
          🎀 데뷔 방송 확인 <span className="text-muted-2 font-normal">{confirmed.length}</span>
        </h2>
        {confirmed.length === 0 ? (
          <p className="text-sm text-muted py-4">이 기간에 데뷔 방송이 확인된 채널이 없어요.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {confirmed.map((d) => (
              <DebutRow key={d.id} d={d} />
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <div>
          <h2 className="font-bold">
            새로 감지된 채널 <span className="text-muted-2 font-normal">{detectedTotal}</span>
          </h2>
          <p className="text-xs text-muted-2 mt-0.5">
            처음 감지된 시점 기준이라, 원래 활동하던 채널이 새로 잡힌 경우도 섞여 있어요.
          </p>
        </div>
        {detected.length === 0 ? (
          <p className="text-sm text-muted py-4">이 기간에 새로 감지된 채널이 없어요.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {detected.slice(0, MAX_DETECTED).map((d) => (
              <DebutRow key={d.id} d={d} />
            ))}
          </ol>
        )}
        {detectedTotal > MAX_DETECTED ? (
          <p className="text-xs text-muted-2 text-center">최근 {MAX_DETECTED}개만 보여줘요 (전체 {detectedTotal}개)</p>
        ) : null}
      </section>
    </div>
  );
}
