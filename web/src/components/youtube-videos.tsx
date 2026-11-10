import type { YoutubeChannel, YoutubeVideo } from "@/types";
import { PlayVideo } from "@/components/player/play-video";
import { RemoteImage } from "@/components/remote-image";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";

/** 초 → "12:34" / "1:02:03" */
function durationText(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function VideoBadge({ v }: { v: YoutubeVideo }) {
  if (v.liveStatus === "live") {
    return (
      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-live px-1.5 py-0.5 text-[10px] font-bold text-white">
        <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
        LIVE
      </span>
    );
  }
  if (v.liveStatus === "upcoming") {
    return (
      <span className="absolute top-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        예정{v.scheduledAt ? ` · ${formatDateTime(v.scheduledAt)}` : ""}
      </span>
    );
  }
  if (v.durationSec) {
    return (
      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 py-0.5 text-[10px] font-semibold text-white tabular-nums">
        {durationText(v.durationSec)}
      </span>
    );
  }
  return null;
}

function VideoItem({ v, channel }: { v: YoutubeVideo; channel: string | null }) {
  const when =
    v.liveStatus === "live" && v.liveStartedAt
      ? `${formatDateTime(v.liveStartedAt)} 시작`
      : v.liveStatus === "ended"
        ? `${formatDate(v.liveStartedAt ?? v.publishedAt)} 방송`
        : formatDate(v.publishedAt);
  return (
    <PlayVideo video={{ id: v.videoId, title: v.title, channel }} className="group flex flex-col gap-1.5 min-w-0">
      <span className="relative block aspect-video overflow-hidden rounded-lg bg-surface-2">
        <RemoteImage src={v.thumbnailUrl} className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
        <VideoBadge v={v} />
      </span>
      <span className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors">
        {v.title}
      </span>
      <span className="text-xs text-muted-2">{when}</span>
    </PlayVideo>
  );
}

/** 프로필 '공식 영상' 탭 — 최신 영상 (누르면 사이트 안에서 재생) */
export function YoutubeVideos({ yt }: { yt: YoutubeChannel }) {
  const name = yt.title ?? yt.handle ?? "YouTube";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm min-w-0 truncate">
          <span className="font-semibold">{name}</span>
          {yt.handle && yt.title ? <span className="text-muted-2"> {yt.handle}</span> : null}
        </p>
        <a
          href={yt.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sm text-accent hover:underline"
        >
          YouTube 채널 ↗
        </a>
      </div>
      {yt.videos.length === 0 ? (
        <p className="text-sm text-muted-2">아직 불러온 영상이 없어요. 잠시 뒤에 다시 확인해 주세요.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-4">
          {yt.videos.map((v) => (
            <VideoItem key={v.videoId} v={v} channel={name} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-2">
        ※ 영상 정보 출처: YouTube.{" "}
        {yt.status === "auto"
          ? "채널 연결은 버모아가 방송 채널 소개의 링크로 자동 추정한 것이라 틀릴 수 있어요."
          : "채널 연결은 버모아 운영자가 확인했어요."}
      </p>
    </div>
  );
}

/** 유튜브에서 방송 중일 때 프로필 머리에 붙는 상자 */
export function YoutubeLiveBox({ yt }: { yt: YoutubeChannel }) {
  const live = yt.live;
  if (!live) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
      <p className="text-xs font-semibold text-muted">
        <span className="text-live">●</span> 유튜브에서 방송 중
      </p>
      <p className="text-sm font-medium line-clamp-1">{live.title}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted tabular-nums">
          {live.viewers != null && live.viewers > 0 ? `시청자 ${formatCount(live.viewers)}명` : "YouTube"}
        </span>
        <PlayVideo
          video={{ id: live.videoId, title: live.title, channel: yt.title }}
          className="rounded-md bg-accent text-accent-fg text-sm font-semibold px-3 py-1.5 hover:opacity-90 transition-opacity"
        >
          ▶ 여기서 보기
        </PlayVideo>
      </div>
    </div>
  );
}
