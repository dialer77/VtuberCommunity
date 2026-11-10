import Link from "next/link";
import type { LiveStream } from "@/types";
import { PLATFORMS } from "@/types";
import { PlatformBadge } from "@/components/platform-badge";
import { formatCount, elapsedSince } from "@/lib/format";
import { FavoriteButton } from "@/components/auth/favorite-button";
import { PlayVideo } from "@/components/player/play-video";

export function LiveCard({ stream }: { stream: LiveStream }) {
  const color = PLATFORMS[stream.platform].color;
  const initial = stream.vtuberName.trim().charAt(0);
  // 유튜브 방송은 버튜버 주 채널(치지직·SOOP) 프로필로 연결하고, 썸네일을 누르면 사이트 안에서 재생
  const profilePlatform = stream.profilePlatform ?? stream.platform;
  const showViewers = !(stream.videoId && stream.viewers <= 0); // 유튜브는 시청자 수를 숨긴 방송이 있음

  return (
    <div className="relative">
    <Link
      href={`/vtuber/${profilePlatform}/${stream.vtuberId}`}
      className="group flex flex-col rounded-xl border border-border bg-surface overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-xl hover:shadow-black/[0.06]"
    >
      {/* 썸네일 영역 (실데이터 연결 전 플랫폼 컬러 기반 자리표시) */}
      <div
        className="relative aspect-video overflow-hidden"
        style={{
          background: `radial-gradient(120% 120% at 20% 0%, ${color}26, transparent 55%), var(--surface-2)`,
        }}
      >
        {stream.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stream.thumbnailUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-7xl font-black text-foreground/[0.06] select-none"
          >
            {initial}
          </span>
        )}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-black/75 px-2 py-0.5 text-xs font-semibold text-white tabular-nums backdrop-blur-sm">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: color }}
            aria-hidden
          />
          {showViewers ? formatCount(stream.viewers) : PLATFORMS[stream.platform].label}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {stream.title}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">
            {stream.vtuberName}
          </span>
          <PlatformBadge platform={stream.platform} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-2">
          {stream.category ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 truncate max-w-[62%]">
              {stream.category}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 tabular-nums">
            {elapsedSince(stream.startedAt)}
          </span>
        </div>
        {stream.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {stream.tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="text-[11px] rounded-full bg-accent/10 text-accent px-1.5 py-0.5"
                title={t.label}
              >
                {t.emoji} {t.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
    {stream.videoId ? (
      <PlayVideo
        video={{ id: stream.videoId, title: stream.title, channel: stream.vtuberName }}
        className="group/play absolute inset-x-0 top-0 aspect-video rounded-t-xl flex items-center justify-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-xl text-white opacity-80 shadow-lg transition group-hover/play:scale-110 group-hover/play:opacity-100">
          ▶
        </span>
      </PlayVideo>
    ) : null}
    <div className="absolute top-2 right-2">
      <FavoriteButton
        compact
        target={{ platform: profilePlatform, channelId: stream.vtuberId, channelName: stream.vtuberName }}
      />
    </div>
    </div>
  );
}
