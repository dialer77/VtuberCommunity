import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChannelProfile } from "@/lib/data";
import { Avatar } from "@/components/avatar";
import { PlatformBadge } from "@/components/platform-badge";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = Promise<{ platform: string; channelId: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { platform, channelId } = await params;
  const p = await getChannelProfile(platform, channelId);
  if (!p) return { title: "스트리머를 찾을 수 없음" };
  return {
    title: p.name,
    description: `${p.name} — 방송 현황·기록·통계. ${p.tags.map((t) => t.label).join(", ")}`,
  };
}

export default async function VtuberProfilePage({
  params,
}: {
  params: Params;
}) {
  const { platform, channelId } = await params;
  const p = await getChannelProfile(platform, channelId);
  if (!p) notFound();

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <Link
        href="/"
        className="text-sm text-muted hover:text-accent transition-colors w-fit"
      >
        ← 지금 방송 중
      </Link>

      {/* 헤더 */}
      <header className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-4">
          <Avatar name={p.name} platform={p.platform} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold tracking-tight truncate">
                {p.name}
              </h1>
              <PlatformBadge platform={p.platform} />
              {p.isLive ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-live px-2 py-0.5 text-[11px] font-bold text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted-2">
                  오프라인
                </span>
              )}
            </div>
            {p.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {p.tags.map((t) => (
                  <span
                    key={t.id}
                    className="text-[11px] rounded-full bg-accent/10 text-accent px-1.5 py-0.5"
                  >
                    {t.emoji} {t.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {p.isLive ? (
          <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
            <p className="text-sm font-medium line-clamp-1">
              {p.currentTitle ?? "방송 중"}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted tabular-nums">
                시청자 {formatCount(p.currentViewers ?? 0)}명
              </span>
              <a
                href={p.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-accent text-accent-fg text-sm font-semibold px-3 py-1.5 hover:opacity-90 transition-opacity"
              >
                🔴 지금 방송 보러가기
              </a>
            </div>
          </div>
        ) : (
          <a
            href={p.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border text-sm font-semibold px-3 py-2 text-center hover:border-accent/60 transition-colors"
          >
            채널 방문 →
          </a>
        )}
      </header>

      {/* 큐레이션 정보 */}
      {p.curated.bio || p.curated.schedule || p.curated.links?.length ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          {p.curated.bio ? (
            <p className="text-[15px] leading-relaxed">{p.curated.bio}</p>
          ) : null}
          {p.curated.schedule ? (
            <p className="text-sm">
              <span className="text-muted-2">방송 스케줄</span>{" "}
              <span className="font-medium">{p.curated.schedule}</span>
            </p>
          ) : null}
          {p.curated.links?.length ? (
            <div className="flex flex-wrap gap-2">
              {p.curated.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm rounded-full bg-surface-2 px-3 py-1 text-accent hover:underline"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 통계 */}
      <section className="grid grid-cols-3 gap-3">
        <StatBox label="최고 동접" value={`${formatCount(p.peakViewers)}명`} />
        <StatBox label="관측 방송" value={`${formatCount(p.broadcastCount)}회`} />
        <StatBox label="감지일" value={formatDate(p.firstSeenAt)} />
      </section>

      {/* 이전 방송 기록 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-muted">이전 방송 기록</h2>
        {p.broadcasts.length === 0 ? (
          <p className="text-sm text-muted-2">아직 기록된 방송이 없어요.</p>
        ) : (
          <ol className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
            {p.broadcasts.map((b, i) => (
              <li
                key={`${b.startedAt}-${i}`}
                className="flex items-center gap-3 p-3 border-b border-border last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {b.title ?? "제목 없음"}
                  </p>
                  <p className="text-xs text-muted-2">
                    {b.startedAt ? formatDateTime(b.startedAt) : "-"}
                    {b.category ? ` · ${b.category}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  peak {formatCount(b.peakViewers)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-2">
          ※ 방송 기록·통계는 VMOA가 수집한 시점 기준이라 실제와 차이가 있을 수
          있어요.
        </p>
      </section>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-4 py-3">
      <span className="text-xs text-muted-2">{label}</span>
      <span className="text-base font-extrabold tabular-nums tracking-tight">
        {value}
      </span>
    </div>
  );
}
