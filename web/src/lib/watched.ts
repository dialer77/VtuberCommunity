"use client";

// 이 브라우저에서 본 영상 기록 (로그인 없이, 서버로 보내지 않음).
// 추천에서 안 본 클립을 앞으로 보내고, 이어보기에서 본 클립을 건너뛰고, 카드에 "봤어요"를 표시하는 데 쓴다.
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

export function markWatched(videoId: string): void {
  if (!/^[\w-]{11}$/.test(videoId)) return;
  const s = read();
  if (s[videoId]) return;
  s[videoId] = Date.now();
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
