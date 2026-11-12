"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { loadYouTubeApi, type YTPlayer } from "@/components/player/youtube-api";
import { markWatched, useWatched } from "@/lib/watched";

/** 사이트 안에서 재생할 유튜브 영상 */
export interface PlayerVideo {
  id: string;
  title: string;
  /** 채널·출처 이름 (선택) */
  channel?: string | null;
  /** 이어서 재생할 영상 ID (내 재생목록) */
  queue?: string[];
  /** 키리누키 클립이면 끝난 뒤 비슷한 클립을 이어서 재생할 수 있다 */
  clip?: boolean;
  /** 추천으로 재생했다면 그 이유 ("같은 방송" 등) */
  reason?: string | null;
}

/** 이어보기 후보 (/api/up-next) */
interface UpNextItem {
  videoId: string;
  title: string;
  channelTitle: string | null;
  reason: string;
}

/** API 를 못 쓰는 환경(차단 등)용 일반 임베드 주소. 재생목록은 공식 playlist 매개변수로 */
function embedSrc(v: PlayerVideo): string {
  const q = (v.queue ?? []).filter((id) => /^[\w-]{11}$/.test(id) && id !== v.id).slice(0, 50);
  const list = q.length ? `&playlist=${q.join(",")}` : "";
  return `https://www.youtube.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0&playsinline=1${list}`;
}

const AUTONEXT_KEY = "vmoa.autonext";
const ENDED = 0;
const PLAYING = 1;

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
 * 크게 보기 ↔ 작게 보기 전환 때 플레이어를 다시 만들지 않으므로 재생이 끊기지 않는다.
 * 유튜브 공식 IFrame API 로 끝난 시점·본 시간을 알아서:
 *  - 30초(짧은 영상은 절반) 이상 보거나 끝까지 본 영상을 이 브라우저에 기록 (lib/watched.ts)
 *  - 키리누키는 끝나면 안 본 추천 클립을 이어서 재생 (같은 방송 → 같은 사건 → 같은 버튜버 → …)
 *  - 내 재생목록은 순서대로 이어서 재생
 * youtube.com/embed 공식 임베드라 로그인된 유튜브 계정(프리미엄)이 그대로 적용된다.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [video, setVideo] = useState<PlayerVideo | null>(null);
  const [mode, setMode] = useState<Mode>("expanded");
  const [fallback, setFallback] = useState(false);
  // 이어보기 켬/끔 (브라우저에 기억). 플레이어는 재생을 눌러야 나타나서 서버 렌더링과 어긋나지 않는다
  const [autoNext, setAutoNext] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(AUTONEXT_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [candidates, setCandidates] = useState<{ for: string; items: UpNextItem[] } | null>(null);
  const watched = useWatched();
  // 이번 이어보기에서 이미 튼 영상 (같은 영상이 돌고 돌지 않게)
  const [played, setPlayed] = useState<ReadonlySet<string>>(new Set());

  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const loadedId = useRef<string | null>(null);
  const videoRef = useRef<PlayerVideo | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const goNextRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    videoRef.current = video;
  }, [video]);

  const toggleAutoNext = () => {
    setAutoNext((v) => {
      try {
        localStorage.setItem(AUTONEXT_KEY, v ? "0" : "1");
      } catch {
        /* 무시 */
      }
      return !v;
    });
  };

  const play = useCallback((v: PlayerVideo) => {
    setPlayed(new Set([v.id])); // 사용자가 직접 고른 영상부터 새로 이어보기
    setVideo(v);
    setMode("expanded");
  }, []);

  const close = useCallback(() => {
    setVideo(null);
    setCandidates(null);
  }, []);

  // 다음 클립 = 이어보기 후보 중 아직 안 봤고 이번에 이미 튼 적 없는 첫 클립
  const upNext =
    video?.clip && candidates?.for === video.id
      ? (candidates.items.find((c) => !watched.has(c.videoId) && !played.has(c.videoId)) ?? null)
      : null;

  const goNext = useCallback(() => {
    const cur = videoRef.current;
    if (!cur) return;
    if (cur.queue?.length) {
      const [next, ...rest] = cur.queue;
      setPlayed((s) => new Set(s).add(next!));
      setVideo({ ...cur, id: next!, title: "", queue: rest, reason: null });
      return;
    }
    if (cur.clip && upNext) {
      setPlayed((s) => new Set(s).add(upNext.videoId));
      setVideo({ id: upNext.videoId, title: upNext.title, channel: upNext.channelTitle, clip: true, reason: upNext.reason });
    }
  }, [upNext]);

  useEffect(() => {
    goNextRef.current = goNext;
  }, [goNext]);

  // 키리누키면 이어보기 후보를 받아 둔다 (영상마다 한 번)
  useEffect(() => {
    if (!video?.clip || candidates?.for === video.id) return;
    const id = video.id;
    let alive = true;
    fetch(`/api/up-next/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: UpNextItem[] }) => {
        if (alive) setCandidates({ for: id, items: j.items ?? [] });
      })
      .catch(() => {
        if (alive) setCandidates({ for: id, items: [] });
      });
    return () => {
      alive = false;
    };
  }, [video?.id, video?.clip, candidates?.for]);

  // 플레이어 만들기 (영상이 처음 열릴 때) / 영상 바꾸기 (열려 있을 때)
  useEffect(() => {
    if (!video || fallback) return;
    const p = playerRef.current;
    if (p) {
      if (loadedId.current !== video.id) {
        loadedId.current = video.id;
        p.loadVideoById(video.id);
      }
      return;
    }
    let cancelled = false;
    loadYouTubeApi()
      .then((YT) => {
        const host = hostRef.current;
        if (cancelled || !host || playerRef.current) return;
        const el = document.createElement("div");
        host.replaceChildren(el);
        loadedId.current = video.id;
        playerRef.current = new YT.Player(el, {
          videoId: video.id,
          host: "https://www.youtube.com",
          playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
          events: {
            onStateChange: (e) => {
              const id = loadedId.current;
              if (tick.current) clearInterval(tick.current);
              tick.current = null;
              if (e.data === PLAYING) {
                // 제목을 모르는 영상(재생목록)은 플레이어에서 받아 표시
                const data = e.target.getVideoData();
                if (data.title) setVideo((v) => (v && v.id === id && !v.title ? { ...v, title: data.title!, channel: v.channel ?? data.author } : v));
                // 30초(짧으면 절반) 이상 보면 '본 영상'
                tick.current = setInterval(() => {
                  const t = e.target.getCurrentTime();
                  const d = e.target.getDuration();
                  if (id && d > 0 && t >= Math.min(30, d * 0.5)) {
                    markWatched(id);
                    if (tick.current) clearInterval(tick.current);
                    tick.current = null;
                  }
                }, 3000);
              } else if (e.data === ENDED) {
                if (id) markWatched(id);
                goNextRef.current();
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });
    return () => {
      cancelled = true;
    };
  }, [video, fallback]);

  // 닫으면 플레이어 정리
  useEffect(() => {
    if (video) return;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    loadedId.current = null;
  }, [video]);

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
  const canNext = !!video && (!!video.queue?.length || (!!video.clip && !!upNext));
  const sub = video?.queue?.length
    ? `재생목록 · ${video.queue.length}개 남음`
    : video?.clip && autoNext && upNext && !fallback
      ? `다음: ${upNext.title} · ${upNext.reason}`
      : video?.reason
        ? `추천 이유: ${video.reason}`
        : (video?.channel ?? "");

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
            aria-label={`영상: ${video.title || "재생 중"}`}
            className={
              expanded
                ? "fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,1100px)] rounded-xl overflow-hidden bg-surface border border-border shadow-2xl"
                : "fixed z-50 bottom-3 right-3 w-[min(92vw,380px)] rounded-xl overflow-hidden bg-surface border border-border shadow-2xl"
            }
          >
            <div className="relative aspect-video bg-black [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full">
              {fallback ? (
                <iframe
                  key={`${video.id}:${video.queue?.length ?? 0}`}
                  src={embedSrc(video)}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <div ref={hostRef} className="absolute inset-0" />
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className={`font-semibold leading-snug truncate ${expanded ? "text-sm" : "text-xs"}`}>{video.title || "불러오는 중…"}</p>
                {sub ? <p className="text-[11px] text-muted-2 truncate">{sub}</p> : null}
              </div>
              {canNext && !fallback ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-accent hover:bg-surface-2"
                  title={upNext && !video.queue?.length ? `다음: ${upNext.title}` : "다음 영상"}
                >
                  다음 ▶
                </button>
              ) : null}
              {video.clip && !fallback ? (
                <button
                  type="button"
                  onClick={toggleAutoNext}
                  aria-pressed={autoNext}
                  className={`shrink-0 rounded-md px-2 py-1 text-xs hover:bg-surface-2 ${autoNext ? "text-foreground" : "text-muted-2"}`}
                  title="끝나면 안 본 비슷한 클립을 이어서 재생"
                >
                  이어보기 {autoNext ? "켬" : "끔"}
                </button>
              ) : null}
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
