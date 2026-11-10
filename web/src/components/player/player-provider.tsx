"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** 사이트 안에서 재생할 유튜브 영상 */
export interface PlayerVideo {
  id: string;
  title: string;
  /** 채널·출처 이름 (선택) */
  channel?: string | null;
  /** 이어서 재생할 영상 ID (내 재생목록 — 공식 임베드의 playlist 매개변수) */
  queue?: string[];
}

/** 임베드 주소. 이어서 재생할 영상이 있으면 공식 playlist 매개변수로 (최대 50개) */
function embedSrc(v: PlayerVideo): string {
  const q = (v.queue ?? []).filter((id) => /^[\w-]{11}$/.test(id) && id !== v.id).slice(0, 50);
  const list = q.length ? `&playlist=${q.join(",")}` : "";
  return `https://www.youtube.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0&playsinline=1${list}`;
}

type Mode = "expanded" | "mini";

interface PlayerCtx {
  video: PlayerVideo | null;
  play: (v: PlayerVideo) => void;
  close: () => void;
}

const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer(): PlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("PlayerProvider 밖에서 usePlayer 사용");
  return c;
}

/**
 * 전역 유튜브 플레이어. 루트 레이아웃에 두어 페이지를 옮겨도(클라이언트 이동) 재생이 이어진다.
 * 크게 보기 ↔ 작게 보기 전환 때 iframe 을 다시 만들지 않으므로 재생이 끊기지 않는다.
 * youtube.com/embed 를 쓰는 이유: 브라우저에 로그인된 유튜브 계정(프리미엄)이 임베드에도 적용되게.
 * (youtube-nocookie 는 쿠키를 쓰지 않아 프리미엄이 인식되지 않을 수 있음)
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [video, setVideo] = useState<PlayerVideo | null>(null);
  const [mode, setMode] = useState<Mode>("expanded");

  const play = useCallback((v: PlayerVideo) => {
    setVideo(v);
    setMode("expanded");
  }, []);
  const close = useCallback(() => setVideo(null), []);

  // 크게 보기에서 Esc → 작게 보기
  useEffect(() => {
    if (!video || mode !== "expanded") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("mini");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [video, mode]);

  const expanded = mode === "expanded";

  return (
    <Ctx.Provider value={{ video, play, close }}>
      {children}
      {video ? (
        <>
          {expanded ? (
            <div
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
              onClick={() => setMode("mini")}
              aria-hidden
            />
          ) : null}
          <div
            role="dialog"
            aria-label={`영상: ${video.title}`}
            className={
              expanded
                ? "fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,1100px)] rounded-xl overflow-hidden bg-surface border border-border shadow-2xl"
                : "fixed z-50 bottom-3 right-3 w-[min(92vw,380px)] rounded-xl overflow-hidden bg-surface border border-border shadow-2xl"
            }
          >
            <div className="relative aspect-video bg-black">
              <iframe
                key={`${video.id}:${video.queue?.length ?? 0}`}
                src={embedSrc(video)}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className={`font-semibold leading-snug truncate ${expanded ? "text-sm" : "text-xs"}`}>{video.title}</p>
                {video.channel || video.queue?.length ? (
                  <p className="text-[11px] text-muted-2 truncate">
                    {video.queue?.length ? `재생목록 · ${video.queue.length + 1}개 이어서 재생` : video.channel}
                  </p>
                ) : null}
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-surface-2"
                title="광고가 나오거나 재생이 안 되면 유튜브에서 보기"
              >
                유튜브 ↗
              </a>
              <button
                type="button"
                onClick={() => setMode(expanded ? "mini" : "expanded")}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-surface-2"
              >
                {expanded ? "작게 보기" : "크게 보기"}
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="닫기"
                className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-surface-2"
              >
                ✕
              </button>
            </div>
          </div>
        </>
      ) : null}
    </Ctx.Provider>
  );
}
