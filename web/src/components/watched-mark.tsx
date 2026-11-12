"use client";

import { useWatched } from "@/lib/watched";

/** 이 브라우저에서 본 영상이면 썸네일 위에 "봤어요" (썸네일을 감싼 relative 요소 안에 둔다) */
export function WatchedMark({ videoId }: { videoId: string }) {
  const watched = useWatched();
  if (!watched.has(videoId)) return null;
  return (
    <>
      <span className="pointer-events-none absolute inset-0 bg-black/35" aria-hidden />
      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        ✓ 봤어요
      </span>
    </>
  );
}
