import type { Metadata } from "next";
import { getDebutEvents } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PlatformBadge } from "@/components/platform-badge";
import { Avatar } from "@/components/avatar";
import { formatDateTime, debutCountdown } from "@/lib/format";

export const metadata: Metadata = {
  title: "신규 데뷔",
  description: "이번 주 데뷔하는 한국 버튜버 일정과 최근 데뷔한 신인.",
};

export const dynamic = "force-dynamic";

export default async function DebutPage() {
  const debuts = await getDebutEvents();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="신규 데뷔"
        description="라이브 목록에서 처음 감지된 채널과 예고된 데뷔 일정."
      />

      <ol className="flex flex-col gap-2">
        {debuts.map((d) => {
          const cd = debutCountdown(d.debutAt);
          const upcoming = /D-|오늘|내일/.test(cd);
          return (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent/60"
            >
              <span
                className={`w-14 shrink-0 rounded-lg px-2 py-1.5 text-center text-sm font-bold tabular-nums ${
                  upcoming
                    ? "bg-accent/10 text-accent"
                    : "bg-surface-2 text-muted-2"
                }`}
              >
                {cd}
              </span>
              <Avatar name={d.vtuberName} platform={d.platform} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold truncate">{d.vtuberName}</h2>
                  <PlatformBadge platform={d.platform} />
                </div>
                <p className="text-sm text-muted truncate">
                  {d.note ?? "데뷔 예정"}
                  {d.agency ? ` · ${d.agency}` : " · 개인세"}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-2 tabular-nums hidden sm:block">
                {formatDateTime(d.debutAt)}
              </time>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
