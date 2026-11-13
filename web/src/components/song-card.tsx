import Link from "next/link";
import type { Song } from "@/types";
import { PlayVideo } from "@/components/player/play-video";
import { RemoteImage } from "@/components/remote-image";
import { WatchedMark } from "@/components/watched-mark";
import { formatDate } from "@/lib/format";

/** 초 → "3:41" */
function durationText(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export const SONG_KIND_LABEL: Record<Song["kind"], string> = { cover: "커버", original: "오리지널" };

/** 노래 카드 — 썸네일·제목을 누르면 사이트 안에서 재생, 이름은 버튜버 프로필로 */
export function SongCard({ song, queue, showVtuber = true }: { song: Song; queue?: string[]; showVtuber?: boolean }) {
  const video = { id: song.videoId, title: song.title, channel: song.vtuber?.name ?? null, queue };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <PlayVideo video={video} className="group relative block aspect-video overflow-hidden rounded-lg bg-surface-2">
        <RemoteImage src={song.thumbnailUrl} className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
        <WatchedMark videoId={song.videoId} />
        <span
          className={`absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            song.kind === "original" ? "bg-accent text-accent-fg" : "bg-black/75 text-white"
          }`}
        >
          {SONG_KIND_LABEL[song.kind]}
        </span>
        {song.durationSec ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 py-0.5 text-[10px] font-semibold text-white tabular-nums">
            {durationText(song.durationSec)}
          </span>
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-lg text-white">▶</span>
        </span>
      </PlayVideo>
      <PlayVideo video={video} className="group min-w-0">
        <span className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors">{song.title}</span>
      </PlayVideo>
      <span className="truncate text-xs text-muted-2">
        {showVtuber && song.vtuber ? (
          <>
            <Link href={`/vtuber/${song.vtuber.platform}/${encodeURIComponent(song.vtuber.channelId)}?tab=songs`} className="text-muted hover:text-accent">
              {song.vtuber.name}
            </Link>
            {" · "}
          </>
        ) : null}
        {formatDate(song.publishedAt)}
      </span>
    </div>
  );
}

/** 노래 목록. 카드를 누르면 그 노래부터 목록 끝까지 이어서 재생 */
export function SongGrid({ songs, narrow, showVtuber }: { songs: Song[]; narrow?: boolean; showVtuber?: boolean }) {
  const ids = songs.map((s) => s.videoId);
  return (
    <div className={`grid gap-x-3 gap-y-5 ${narrow ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
      {songs.map((s, i) => (
        <SongCard key={s.videoId} song={s} queue={ids.slice(i + 1, i + 51)} showVtuber={showVtuber} />
      ))}
    </div>
  );
}

/** 목록 전체 재생 (최대 50곡) */
export function PlayAllSongs({ songs, label = "▶ 전체 재생" }: { songs: Song[]; label?: string }) {
  const first = songs[0];
  if (!first) return null;
  return (
    <PlayVideo
      video={{ id: first.videoId, title: first.title, channel: first.vtuber?.name ?? null, queue: songs.slice(1, 50).map((s) => s.videoId) }}
      className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
    >
      {label}
    </PlayVideo>
  );
}

export function SongNotice() {
  return (
    <p className="text-xs text-muted-2">
      ※ 버튜버 공식 유튜브 채널 영상 중 제목에 커버·오리지널 표기가 있는 노래만 모았어요. 영상 정보 출처: YouTube.
    </p>
  );
}
