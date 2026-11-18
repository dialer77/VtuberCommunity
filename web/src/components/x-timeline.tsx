"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    twttr?: { widgets?: { load: (el?: HTMLElement) => void } };
  }
}

const SCRIPT_ID = "x-widgets-js";

/**
 * X 공식 타임라인 임베드. 누르기 전에는 X 스크립트를 불러오지 않는다 (속도·개인정보).
 * 게시물·이미지는 X 가 보여 주는 것이고 버모아에 저장하지 않는다.
 */
export function XTimeline({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !box.current) return;
    const el = box.current;
    const render = () => window.twttr?.widgets?.load(el);
    if (window.twttr?.widgets) render();
    else if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = "https://platform.twitter.com/widgets.js";
      s.async = true;
      s.charset = "utf-8";
      s.onload = render;
      s.onerror = () => setFailed(true);
      document.body.appendChild(s);
    }
    // X 가 막혔거나 비어 있으면(로그인 안 한 방문자에게는 안 그려질 때가 많음) 12초 뒤 안내
    const t = setTimeout(() => {
      const frame = el.querySelector("iframe");
      if (!frame || frame.offsetHeight < 100 || el.querySelector("a.twitter-timeline")) setFailed(true);
    }, 12_000);
    return () => clearTimeout(t);
  }, [open]);

  const theme = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

  return (
    <section className="flex flex-col gap-2" aria-label="X 최근 게시물">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-muted">X 게시물</h3>
        <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-accent hover:underline">
          @{handle} ↗
        </a>
      </div>
      {open ? (
        <div ref={box} className="min-h-40 overflow-hidden rounded-xl border border-border bg-surface">
          {failed ? null : (
            <a className="twitter-timeline" data-height="640" data-theme={theme} data-dnt="true" data-lang="ko" href={`https://twitter.com/${handle}`}>
              @{handle} 게시물 불러오는 중…
            </a>
          )}
          {failed ? (
            <p className="p-3 text-sm text-muted-2">
              X 게시물을 불러오지 못했어요. X 사정으로 로그인하지 않으면 안 보이거나 늦게 보일 수 있어요 —{" "}
              <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
                X 에서 보기
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted hover:border-accent/60 hover:text-foreground transition-colors"
        >
          X 최근 게시물 불러오기 (X 위젯 — 누르면 X 가 정보를 받을 수 있어요)
        </button>
      )}
    </section>
  );
}
