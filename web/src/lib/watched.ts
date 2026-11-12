"use client";

// 이 브라우저에서 본 영상 기록.
// 추천에서 안 본 클립을 앞으로 보내고, 이어보기에서 본 클립을 건너뛰고, 카드에 "봤어요"를 표시하는 데 쓴다.
// 로그인하지 않으면 서버에 저장하지 않는다 (내 취향 추천을 계산할 때만 보내고 저장 안 함).
// 로그인하면 계정과 맞춘다 (components/auth/account-sync.tsx 가 setWatchedUploader 로 올린다).
import { useSyncExternalStore } from "react";

const KEY = "vmoa.watched.v1";
const MAX = 1000;
const EVENT = "vmoa:watched";

type Store = Record<string, number>; // videoId → 본 시각(ms)

let cache: { raw: string | null; set: ReadonlySet<string> } | null = null;
const EMPTY: ReadonlySet<string> = new Set();

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

/** 본 영상 집합 (바뀔 때만 새 객체 — useSyncExternalStore 용) */
function snapshot(): ReadonlySet<string> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (cache && cache.raw === raw) return cache.set;
  let set: ReadonlySet<string> = EMPTY;
  try {
    set = new Set(Object.keys(raw ? (JSON.parse(raw) as Store) : {}));
  } catch {
    set = EMPTY;
  }
  cache = { raw, set };
  return set;
}

// 로그인 사용자의 계정으로 새 기록을 올리는 함수 (없으면 브라우저에만)
let uploader: ((items: { videoId: string; at: number }[]) => void) | null = null;
export function setWatchedUploader(fn: typeof uploader): void {
  uploader = fn;
}

function save(s: Store): void {
  // 오래된 것부터 지워 최대 MAX 개만
  const ids = Object.keys(s);
  if (ids.length > MAX) {
    ids.sort((a, b) => s[a]! - s[b]!);
    for (const id of ids.slice(0, ids.length - MAX)) delete s[id];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

/** 본 기록 전체 (오래된 것 먼저) */
export function allWatched(): { videoId: string; at: number }[] {
  return Object.entries(read())
    .map(([videoId, at]) => ({ videoId, at }))
    .sort((a, b) => a.at - b.at);
}

/** 계정의 기록을 합친다 (이미 있는 것은 더 이른 시각 유지) */
export function mergeWatched(items: { videoId: string; at: number }[]): void {
  const s = read();
  let changed = false;
  for (const i of items) {
    if (!/^[\w-]{11}$/.test(i.videoId) || !Number.isFinite(i.at)) continue;
    if (s[i.videoId] == null || i.at < s[i.videoId]!) {
      s[i.videoId] = i.at;
      changed = true;
    }
  }
  if (changed) save(s);
}

/** 이 브라우저의 본 기록 지우기 */
export function clearWatchedLocal(): void {
  save({});
}

export function markWatched(videoId: string): void {
  if (!/^[\w-]{11}$/.test(videoId)) return;
  const s = read();
  if (s[videoId]) return;
  s[videoId] = Date.now();
  uploader?.([{ videoId, at: s[videoId]! }]);
  save(s);
}

export function isWatched(videoId: string): boolean {
  return snapshot().has(videoId);
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** 본 영상 집합 (서버 렌더링에서는 빈 집합 → 하이드레이션 뒤 채워짐) */
export function useWatched(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
