import type { LiveStream } from "@/types";
import { PlatformBadge } from "@/components/platform-badge";
import { formatCount, elapsedSince } from "@/lib/format";

export function LiveCard({ stream }: { stream: LiveStream }) {
  return (
    <a
      href={stream.channelUrl}
      className="group flex flex-col rounded-xl border border-border bg-surface overflow-hidden hover:border-accent/60 transition-colors"
    >
      {/* 썸네일 영역 (실데이터 연결 전 자리표시) */}
      <div className="relative aspect-video bg-surface-2 flex items-center justify-center">
        <span className="text-muted-2 text-xs">썸네일</span>
        <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 text-xs font-bold text-white">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
          {formatCount(stream.viewers)}명
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {stream.title}
        </h3>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium truncate">{stream.vtuberName}</span>
          <PlatformBadge platform={stream.platform} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-2">
          <span className="truncate">{stream.category ?? "-"}</span>
          <span className="shrink-0 tabular-nums">
            {elapsedSince(stream.startedAt)}
          </span>
        </div>
      </div>
    </a>
  );
}
