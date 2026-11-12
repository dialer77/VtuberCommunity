"use client";

// 유튜브 공식 IFrame Player API 로더 — 영상이 끝났는지·얼마나 봤는지 알아야 이어보기·본 기록을 할 수 있다.
// 플레이어는 youtube.com/embed 와 같은 공식 임베드라 로그인된 유튜브 계정(프리미엄)도 그대로 적용된다.

export interface YTPlayer {
  loadVideoById(id: string): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData(): { video_id?: string; title?: string; author?: string };
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

/** IFrame API 를 한 번만 불러온다. 막혀 있으면(차단 확장 등) 8초 뒤 실패 */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise<YTNamespace>((resolve, reject) => {
    const timer = setTimeout(() => {
      loading = null;
      reject(new Error("youtube_api_timeout"));
    }, 8000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      loading = null;
      reject(new Error("youtube_api_blocked"));
    };
    document.head.appendChild(s);
  });
  return loading;
}
