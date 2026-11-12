"use client";

import { useEffect, useRef, useState } from "react";
import { clipChannelId, clipHidden, prefsActions, useClipPrefs } from "@/lib/clip-prefs";
import type { Clip } from "@/types";

/** 카드의 ⋯ 메뉴 — 관심 없음 / 이 채널 숨기기 / 이 주제 덜 보기 (추천·이어보기·내 취향에 반영) */
export function ClipMenu({ clip }: { clip: Clip }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prefs = useClipPrefs();
  const ch = clipChannelId(clip);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const disliked = prefs.disliked.includes(clip.videoId);
  const chHidden = prefs.hiddenChannels.some((c) => c.id === ch);
  const topicHidden = !!clip.topic && prefs.hiddenTopics.includes(clip.topic);
  const item = "block w-full px-3 py-2 text-left text-xs hover:bg-surface-2";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="클립 메뉴"
        aria-expanded={open}
        className="rounded px-1 text-sm leading-none text-muted-2 hover:bg-surface-2 hover:text-foreground"
      >
        ⋯
      </button>
      {open ? (
        <div className="absolute bottom-full right-0 z-30 mb-1 w-44 overflow-hidden rounded-lg border border-border bg-surface shadow-lg" role="menu">
          <button type="button" role="menuitem" className={item} onClick={() => (prefsActions.toggleDisliked(clip.videoId), setOpen(false))}>
            {disliked ? "관심 없음 취소" : "관심 없음"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => (prefsActions.toggleChannel(ch, clip.channelTitle ?? ch), setOpen(false))}
          >
            {chHidden ? "이 채널 다시 보기" : `이 채널 숨기기${clip.channelTitle ? ` (${clip.channelTitle})` : ""}`}
          </button>
          {clip.topic ? (
            <button type="button" role="menuitem" className={item} onClick={() => (prefsActions.toggleTopic(clip.topic!), setOpen(false))}>
              {topicHidden ? `'${clip.topic}' 다시 보기` : `'${clip.topic}' 덜 보기`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 추천에서 뺀 클립이면 카드를 덮고 되돌리기 (카드 최상위 relative 요소 안에 둔다) */
export function ClipHiddenOverlay({ clip }: { clip: Clip }) {
  const prefs = useClipPrefs();
  if (!clipHidden(prefs, clip)) return null;
  const ch = clipChannelId(clip);
  const undo = () => {
    if (prefs.disliked.includes(clip.videoId)) prefsActions.toggleDisliked(clip.videoId);
    if (prefs.hiddenChannels.some((c) => c.id === ch)) prefsActions.toggleChannel(ch, clip.channelTitle ?? ch);
    if (clip.topic && prefs.hiddenTopics.includes(clip.topic)) prefsActions.toggleTopic(clip.topic);
  };
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/90 p-3 text-center">
      <p className="text-xs text-muted">추천에서 뺐어요</p>
      <button type="button" onClick={undo} className="rounded-md border border-border px-2.5 py-1 text-xs hover:border-accent/60">
        되돌리기
      </button>
    </div>
  );
}
