"use client";

import { usePlayer, type PlayerVideo } from "@/components/player/player-provider";

/** 누르면 사이트 안 플레이어로 재생하는 영역 (유튜브로 이동하지 않음) */
export function PlayVideo({
  video,
  className,
  children,
}: {
  video: PlayerVideo;
  className?: string;
  children: React.ReactNode;
}) {
  const { play } = usePlayer();
  return (
    <button
      type="button"
      onClick={() => play(video)}
      className={`text-left ${className ?? ""}`}
      aria-label={`재생: ${video.title}`}
    >
      {children}
    </button>
  );
}
