"use client";

import { useEffect, useState } from "react";
import { RecBundles } from "@/components/rec-bundles";
import { allWatched, clearWatchedLocal, useWatched } from "@/lib/watched";
import { prefsActions, useClipPrefs } from "@/lib/clip-prefs";
import type { Clip, ClipTag } from "@/types";

interface ForYouData {
  items: { clip: Clip; reason: string }[];
  basis: { vtubers: string[]; topics: string[]; moments: string[] };
}

/**
 * 내 취향 추천 — 이 브라우저(로그인하면 계정)의 본 기록과 취향 설정으로 고른 안 본 클립.
 * 본 기록은 계산에만 보내고 서버에 저장하지 않는다 (로그인 사용자는 계정에 따로 저장).
 */
export function ForYou({ moments }: { moments: ClipTag[] }) {
  const prefs = useClipPrefs();
  const watched = useWatched();
  const [data, setData] = useState<ForYouData | null>(null);
  const [open, setOpen] = useState(false);

  // 취향 설정이 바뀌면 다시 계산 (본 기록은 열 때 한 번 — 보는 중에 목록이 자꾸 바뀌지 않게)
  useEffect(() => {
    const ac = new AbortController();
    const h = setTimeout(() => {
      fetch("/api/for-you", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          watched: allWatched().map((w) => w.videoId).slice(-500),
          disliked: prefs.disliked,
          hiddenChannels: prefs.hiddenChannels.map((c) => c.id),
          hiddenTopics: prefs.hiddenTopics,
          moments: prefs.moments,
          limit: 12,
        }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<ForYouData>) : null))
        .then((d) => {
          if (d) setData(d);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(h);
      ac.abort();
    };
  }, [prefs]);

  const enough = watched.size >= 3 || prefs.moments.length > 0;
  const basis = data?.basis;
  const basisText = basis ? [...basis.vtubers, ...basis.topics, ...basis.moments].slice(0, 6).join(" · ") : "";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4" aria-label="내 취향 추천">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">내 취향 추천</h2>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-2">
          {enough && basisText ? `자주 본: ${basisText}` : "클립을 3개 이상 보면 취향에 맞춰져요. 지금은 요즘 인기 클립이에요."}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:border-accent/60 hover:text-foreground"
        >
          취향 설정 {open ? "닫기" : ""}
        </button>
      </div>

      {open ? <PrefsPanel moments={moments} watchedCount={watched.size} /> : null}

      {data?.items.length ? (
        <RecBundles bundles={[{ id: "for_you", title: "", items: data.items }]} />
      ) : (
        <p className="text-sm text-muted">{data ? "추천할 클립이 아직 없어요." : "불러오는 중…"}</p>
      )}
    </section>
  );
}

function PrefsPanel({ moments, watchedCount }: { moments: ClipTag[]; watchedCount: number }) {
  const prefs = useClipPrefs();
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
      on ? "border-accent bg-accent text-accent-fg font-semibold" : "border-border text-muted hover:border-accent/50 hover:text-foreground"
    }`;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 shrink-0 text-xs text-muted-2">좋아하는 순간</span>
        {moments
          .filter((m) => m.id !== "funny")
          .map((m) => (
            <button key={m.id} type="button" onClick={() => prefsActions.toggleMoment(m.id)} className={chip(prefs.moments.includes(m.id))}>
              {m.emoji} {m.label}
            </button>
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 shrink-0 text-xs text-muted-2">숨긴 채널</span>
        {prefs.hiddenChannels.length ? (
          prefs.hiddenChannels.map((c) => (
            <button key={c.id} type="button" onClick={() => prefsActions.toggleChannel(c.id, c.title)} className={chip(false)} title="다시 보기">
              {c.title} ✕
            </button>
          ))
        ) : (
          <span className="text-xs text-muted-2">없음 — 카드의 ⋯ 메뉴에서 숨길 수 있어요</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 shrink-0 text-xs text-muted-2">덜 볼 주제</span>
        {prefs.hiddenTopics.length ? (
          prefs.hiddenTopics.map((t) => (
            <button key={t} type="button" onClick={() => prefsActions.toggleTopic(t)} className={chip(false)} title="다시 보기">
              {t} ✕
            </button>
          ))
        ) : (
          <span className="text-xs text-muted-2">없음</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>관심 없음 {prefs.disliked.length}개</span>
        {prefs.disliked.length ? (
          <button type="button" onClick={prefsActions.clearDisliked} className="underline hover:text-foreground">
            초기화
          </button>
        ) : null}
        <span>본 기록 {watchedCount}개</span>
        {watchedCount ? (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("이 브라우저의 본 기록을 지울까요? (로그인했다면 계정의 기록도 지워요)")) return;
              clearWatchedLocal();
              void fetch("/api/me/watched", { method: "DELETE" }).catch(() => undefined);
            }}
            className="underline hover:text-foreground"
          >
            지우기
          </button>
        ) : null}
      </div>
    </div>
  );
}
