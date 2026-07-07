import type { Metadata } from "next";
import { getDebutEvents } from "@/lib/data";
import { PlatformBadge } from "@/components/platform-badge";
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
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">신규 데뷔</h1>
        <p className="text-sm text-muted">
          라이브 목록에서 처음 감지된 채널과 예고된 데뷔 일정.
        </p>
      </header>

      <ol className="flex flex-col">
        {debuts.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-4 py-4 border-b border-border last:border-b-0"
          >
            <div className="w-16 shrink-0 text-center">
              <span className="inline-block rounded-md bg-accent/10 text-accent font-bold text-sm px-2 py-1 tabular-nums">
                {debutCountdown(d.debutAt)}
              </span>
            </div>
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
            <time className="shrink-0 text-xs text-muted-2 tabular-nums">
              {formatDateTime(d.debutAt)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
