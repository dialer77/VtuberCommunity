"use client";

// 클립 취향 설정 — 사용자가 직접 추천을 조절한다 (유튜브식 블랙박스와 다른 점).
//  관심 없음(클립) · 이 채널 숨기기(키리누키 채널) · 이 주제 덜 보기(게임·콘텐츠) · 좋아하는 순간
// 이 브라우저에 저장하고, 로그인하면 계정과 맞춘다 (components/auth/account-sync.tsx).
import { useSyncExternalStore } from "react";
import type { Clip } from "@/types";

export interface ClipPrefs {
  disliked: string[];
  hiddenChannels: { id: string; title: string }[];
  hiddenTopics: string[];
  moments: string[];
}

const KEY = "vmoa.clipPrefs.v1";
const EVENT = "vmoa:clipPrefs";
export const EMPTY_PREFS: ClipPrefs = { disliked: [], hiddenChannels: [], hiddenTopics: [], moments: [] };

let cache: { raw: string | null; prefs: ClipPrefs } | null = null;

function sanitize(v: unknown): ClipPrefs {
  const o = (v && typeof v === "object" ? v : {}) as Partial<ClipPrefs>;
  const strs = (a: unknown, max: number) =>
    Array.isArray(a) ? [...new Set(a.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 60))].slice(-max) : [];
  const chans = Array.isArray(o.hiddenChannels)
    ? o.hiddenChannels
        .filter((c): c is { id: string; title: string } => !!c && typeof c.id === "string" && /^UC[\w-]{22}$/.test(c.id))
        .map((c) => ({ id: c.id, title: typeof c.title === "string" ? c.title.slice(0, 60) : c.id }))
        .slice(-100)
    : [];
  return {
    disliked: strs(o.disliked, 300),
    hiddenChannels: chans.filter((c, i) => chans.findIndex((x) => x.id === c.id) === i),
    hiddenTopics: strs(o.hiddenTopics, 100),
    moments: strs(o.moments, 6),
  };
}

export function readPrefs(): ClipPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY_PREFS;
  }
  if (cache && cache.raw === raw) return cache.prefs;
  let prefs = EMPTY_PREFS;
  try {
    prefs = raw ? sanitize(JSON.parse(raw)) : EMPTY_PREFS;
  } catch {
    prefs = EMPTY_PREFS;
  }
  cache = { raw, prefs };
  return prefs;
}

export function writePrefs(next: ClipPrefs, fromSync = false): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitize(next)));
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { fromSync } }));
}

function update(fn: (p: ClipPrefs) => ClipPrefs) {
  writePrefs(fn(readPrefs()));
}

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export const prefsActions = {
  toggleDisliked: (videoId: string) => update((p) => ({ ...p, disliked: toggleIn(p.disliked, videoId) })),
  toggleChannel: (id: string, title: string) =>
    update((p) => ({
      ...p,
      hiddenChannels: p.hiddenChannels.some((c) => c.id === id)
        ? p.hiddenChannels.filter((c) => c.id !== id)
        : [...p.hiddenChannels, { id, title }],
    })),
  toggleTopic: (topic: string) => update((p) => ({ ...p, hiddenTopics: toggleIn(p.hiddenTopics, topic) })),
  toggleMoment: (id: string) => update((p) => ({ ...p, moments: toggleIn(p.moments, id) })),
  clearDisliked: () => update((p) => ({ ...p, disliked: [] })),
};

/** 두 설정 합치기 (기기 간 동기화용 — 양쪽에 있는 것을 모두 남긴다) */
export function mergePrefs(a: ClipPrefs, b: ClipPrefs): ClipPrefs {
  return sanitize({
    disliked: [...a.disliked, ...b.disliked],
    hiddenChannels: [...a.hiddenChannels, ...b.hiddenChannels],
    hiddenTopics: [...a.hiddenTopics, ...b.hiddenTopics],
    moments: [...a.moments, ...b.moments],
  });
}

export function subscribePrefs(cb: (fromSync: boolean) => void): () => void {
  const onEvent = (e: Event) => cb(!!(e as CustomEvent<{ fromSync?: boolean }>).detail?.fromSync);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb(false);
  };
  window.addEventListener(EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

export function useClipPrefs(): ClipPrefs {
  return useSyncExternalStore((cb) => subscribePrefs(() => cb()), readPrefs, () => EMPTY_PREFS);
}

const topicKey = (t: string) => t.toLowerCase().replace(/\s+/g, "");

/** 클립 카드의 키리누키 채널 ID (channelUrl 끝) */
export function clipChannelId(c: { channelUrl: string }): string {
  return c.channelUrl.split("/").pop() ?? "";
}

/** 이 설정으로 추천에서 뺄 클립인지 */
export function isHiddenByPrefs(p: ClipPrefs, c: { videoId: string; ytChannelId: string; topic: string | null }): boolean {
  if (p.disliked.includes(c.videoId)) return true;
  if (p.hiddenChannels.some((h) => h.id === c.ytChannelId)) return true;
  if (c.topic && p.hiddenTopics.some((t) => topicKey(t) === topicKey(c.topic!))) return true;
  return false;
}

export function clipHidden(p: ClipPrefs, c: Clip): boolean {
  return isHiddenByPrefs(p, { videoId: c.videoId, ytChannelId: clipChannelId(c), topic: c.topic });
}
