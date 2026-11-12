import Link from "next/link";
import type { Clip, ClipTag } from "@/types";
import { PlayVideo } from "@/components/player/play-video";
import { RemoteImage } from "@/components/remote-image";
import { formatDate } from "@/lib/format";
import { WatchedMark } from "@/components/watched-mark";

export function ClipTagChip({ tag, href, count }: { tag: ClipTag; href?: string; count?: number }) {
  const cls = "inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent";
  const body = (
    <>
      <span aria-hidden>{tag.emoji}</span>
      {tag.label}
      {count != null ? <span className="text-accent/70 tabular-nums">{count}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className={`${cls} hover:bg-accent/20 transition-colors`}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/**
 * 키리누키 카드 — 썸네일은 사이트 안에서 재생(끝나면 비슷한 클립 이어보기), 제목은 클립 페이지(분류·추천)로.
 * reason: 추천으로 나온 카드면 그 이유 (플레이어에 표시)
 */
export function ClipCard({ clip, reason }: { clip: Clip; reason?: string }) {
  const who = clip.vtubers.map((v) => v.name).join(", ");
  const tags = [clip.category, ...clip.moments].filter((t): t is ClipTag => !!t && t.id !== "etc").slice(0, 3);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <PlayVideo
        video={{ id: clip.videoId, title: clip.title, channel: clip.channelTitle, clip: true, reason: reason ?? null }}
        className="group relative block aspect-video overflow-hidden rounded-lg bg-surface-2"
      >
        <RemoteImage src={clip.thumbnailUrl} className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
        <WatchedMark videoId={clip.videoId} />
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-lg text-white">▶</span>
        </span>
      </PlayVideo>
      <Link href={`/clips/${clip.videoId}`} className="group flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors">{clip.title}</span>
        {clip.summary ? <span className="text-xs text-muted line-clamp-1">{clip.summary}</span> : null}
      </Link>
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((t) => (
          <ClipTagChip key={t.id} tag={t} />
        ))}
      </div>
      <span className="text-xs text-muted-2 truncate">
        {who ? `${who} · ` : ""}
        {clip.channelTitle ?? "YouTube"} · {formatDate(clip.publishedAt)}
        {clip.likes ? <span className="text-accent"> · ♥ {clip.likes}</span> : null}
      </span>
    </div>
  );
}

/** narrow: 프로필·클립 페이지처럼 폭이 좁은 곳 (최대 3열) */
export function ClipGrid({ clips, narrow }: { clips: Clip[]; narrow?: boolean }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${narrow ? "" : "lg:grid-cols-4"} gap-x-3 gap-y-5`}>
      {clips.map((c) => (
        <ClipCard key={c.videoId} clip={c} />
      ))}
    </div>
  );
}

/** 분류 출처 안내 (YouTube 정책: 자체 정보는 YouTube 정보가 아님을 표시) */
export function ClipNotice() {
  return (
    <p className="text-xs text-muted-2">
      ※ 영상 출처: YouTube. 누가·무엇을·어떤 순간·요약은 버모아가 영상 제목·설명으로 자동 정리한 <b>버모아 분류</b>로, YouTube 가 제공한 정보가 아니며 틀릴 수 있어요.
    </p>
  );
}
