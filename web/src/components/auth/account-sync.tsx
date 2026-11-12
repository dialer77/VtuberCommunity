"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { allWatched, mergeWatched, setWatchedUploader } from "@/lib/watched";
import { EMPTY_PREFS, mergePrefs, readPrefs, subscribePrefs, writePrefs, type ClipPrefs } from "@/lib/clip-prefs";

/**
 * 로그인하면 이 브라우저의 본 기록·클립 취향을 계정과 맞춘다 (여러 기기에서 같은 추천).
 *  - 처음: 계정 기록을 받아 합치고, 계정에 없는 이 브라우저 기록을 올린다. 취향 설정은 양쪽을 합친다
 *  - 이후: 새로 본 클립·바뀐 취향 설정을 올린다
 * 로그아웃해도 브라우저 기록은 그대로 둔다.
 */
export function AccountSync() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    let prefsTimer: ReturnType<typeof setTimeout> | null = null;
    const pending: { videoId: string; at: number }[] = [];
    let upTimer: ReturnType<typeof setTimeout> | null = null;

    const post = (items: { videoId: string; at: number }[]) =>
      fetch("/api/me/watched", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      }).catch(() => undefined);
    const putPrefs = (prefs: ClipPrefs) =>
      fetch("/api/me/clip-prefs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefs }),
      }).catch(() => undefined);

    (async () => {
      // 본 기록
      const r = await fetch("/api/me/watched").catch(() => null);
      if (!alive || !r?.ok) return;
      const server = ((await r.json()) as { items?: { videoId: string; at: number }[] }).items ?? [];
      const known = new Set(server.map((i) => i.videoId));
      mergeWatched(server);
      const missing = allWatched().filter((i) => !known.has(i.videoId));
      for (let k = 0; k < missing.length && k < 1000; k += 200) await post(missing.slice(k, k + 200));
      // 취향 설정
      const p = await fetch("/api/me/clip-prefs").catch(() => null);
      if (!alive || !p?.ok) return;
      const remote = ((await p.json()) as { prefs?: ClipPrefs | null }).prefs ?? null;
      const merged = mergePrefs(readPrefs(), remote ?? EMPTY_PREFS);
      writePrefs(merged, true);
      if (JSON.stringify(merged) !== JSON.stringify(remote)) await putPrefs(merged);
    })();

    // 새로 본 클립은 모아서 올린다
    setWatchedUploader((items) => {
      pending.push(...items);
      if (upTimer) return;
      upTimer = setTimeout(() => {
        upTimer = null;
        void post(pending.splice(0, 200));
      }, 3000);
    });
    // 취향 설정이 바뀌면 (동기화로 바뀐 것은 빼고) 올린다
    const unsub = subscribePrefs((fromSync) => {
      if (fromSync) return;
      if (prefsTimer) clearTimeout(prefsTimer);
      prefsTimer = setTimeout(() => void putPrefs(readPrefs()), 1500);
    });

    return () => {
      alive = false;
      unsub();
      setWatchedUploader(null);
      if (prefsTimer) clearTimeout(prefsTimer);
      if (upTimer) clearTimeout(upTimer);
      if (pending.length) void post(pending.splice(0));
    };
  }, [status]);

  return null;
}
