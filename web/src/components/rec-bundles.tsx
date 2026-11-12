"use client";

import { useEffect, useRef } from "react";
import { ClipCard } from "@/components/clip-card";
import type { RecBundle } from "@/types";

type RecEvent = { b: string; t: "impression" | "open" | "play" };

// 익명 측정: 묶음별 노출·열기·재생 수만 모아서 보낸다 (누가 봤는지는 남기지 않음)
const queue: RecEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const body = JSON.stringify({ events: queue.splice(0, 30) });
  const blob = new Blob([body], { type: "application/json" });
  if (!navigator.sendBeacon?.("/api/rec", blob)) {
    void fetch("/api/rec", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
  }
}

function track(e: RecEvent) {
  queue.push(e);
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(flush, 2000);
}

/** 추천 묶음 — 묶음마다 제목, 카드마다 추천 이유 */
export function RecBundles({ bundles }: { bundles: RecBundle[] }) {
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, []);

  return (
    <>
      {bundles.map((b) => (
        <Bundle key={b.id} bundle={b} />
      ))}
    </>
  );
}

function Bundle({ bundle }: { bundle: RecBundle }) {
  const ref = useRef<HTMLElement>(null);

  // 묶음이 화면에 40% 이상 보이면 노출 1회
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track({ b: bundle.id, t: "impression" });
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [bundle.id]);

  return (
    <section
      ref={ref}
      className="flex flex-col gap-3"
      onClickCapture={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button")) track({ b: bundle.id, t: "play" });
        else if (target.closest('a[href^="/clips/"]')) track({ b: bundle.id, t: "open" });
      }}
    >
      <h2 className="text-sm font-bold text-muted">{bundle.title}</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
        {bundle.items.map((i) => (
          <div key={i.clip.videoId} className="flex min-w-0 flex-col gap-1.5">
            <span className="w-fit max-w-full truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {i.reason}
            </span>
            <ClipCard clip={i.clip} />
          </div>
        ))}
      </div>
    </section>
  );
}
