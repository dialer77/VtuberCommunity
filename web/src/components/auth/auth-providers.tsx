"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SessionProvider, signIn, useSession } from "next-auth/react";
import { AccountSync } from "@/components/auth/account-sync";
import type { Platform } from "@/types";

/** 서버에 구글 로그인 설정이 있을 때만 켜짐 (next.config.ts) */
export const AUTH_ON = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";

export interface FavoriteItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  channelUrl: string;
  notify: boolean;
  isLive: boolean;
  viewers: number | null;
  title: string | null;
  thumbnailUrl: string | null;
}

export interface FavoriteTarget {
  platform: Platform;
  channelId: string;
  channelName: string;
}

interface FavoritesCtx {
  loggedIn: boolean;
  loaded: boolean;
  items: FavoriteItem[];
  isFavorite: (channelId: string) => boolean;
  toggle: (t: FavoriteTarget) => Promise<void>;
  setNotify: (channelId: string, notify: boolean) => Promise<void>;
}

const noop: FavoritesCtx = {
  loggedIn: false,
  loaded: false,
  items: [],
  isFavorite: () => false,
  toggle: async () => undefined,
  setNotify: async () => undefined,
};

const Ctx = createContext<FavoritesCtx>(noop);

export const useFavorites = () => useContext(Ctx);

function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const uid = session?.user?.id;
  const [state, setState] = useState<{ uid: string; items: FavoriteItem[] } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    fetch("/api/me/favorites")
      .then((r) => (r.ok ? r.json() : { favorites: [] }))
      .then((j: { favorites: FavoriteItem[] }) => {
        if (alive) setState({ uid, items: j.favorites ?? [] });
      })
      .catch(() => {
        if (alive) setState({ uid, items: [] });
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  const loaded = !!uid && state?.uid === uid;
  const items = useMemo(() => (loaded && state ? state.items : []), [loaded, state]);
  const update = useCallback(
    (fn: (prev: FavoriteItem[]) => FavoriteItem[]) =>
      setState((s) => (s ? { ...s, items: fn(s.items) } : s)),
    [],
  );

  const toggle = useCallback(
    async (t: FavoriteTarget) => {
      if (status === "loading") return;
      if (status !== "authenticated") {
        await signIn("google", { callbackUrl: window.location.href });
        return;
      }
      if (!loaded) return; // 목록을 받기 전에는 등록/해제 방향을 알 수 없다
      const exists = items.some((f) => f.channelId === t.channelId);
      const before = items;
      update((prev) =>
        exists
          ? prev.filter((f) => f.channelId !== t.channelId)
          : [
              {
                ...t,
                channelUrl: "",
                notify: true,
                isLive: false,
                viewers: null,
                title: null,
                thumbnailUrl: null,
              },
              ...prev,
            ],
      );
      const res = await fetch(
        exists ? `/api/me/favorites/${encodeURIComponent(t.channelId)}` : "/api/me/favorites",
        exists
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(t),
            },
      ).catch(() => null);
      if (!res?.ok) update(() => before);
    },
    [status, loaded, items, update],
  );

  const setNotify = useCallback(
    async (channelId: string, notify: boolean) => {
      update((prev) => prev.map((f) => (f.channelId === channelId ? { ...f, notify } : f)));
      const res = await fetch(`/api/me/favorites/${encodeURIComponent(channelId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notify }),
      }).catch(() => null);
      if (!res?.ok) update((prev) => prev.map((f) => (f.channelId === channelId ? { ...f, notify: !notify } : f)));
    },
    [update],
  );

  const value = useMemo<FavoritesCtx>(
    () => ({
      loggedIn: status === "authenticated",
      loaded,
      items,
      isFavorite: (id) => items.some((f) => f.channelId === id),
      toggle,
      setNotify,
    }),
    [status, loaded, items, toggle, setNotify],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 로그인·최애 상태 제공. 로그인 설정이 없으면 아무것도 하지 않는다. */
export function AuthProviders({ children }: { children: React.ReactNode }) {
  if (!AUTH_ON) return <>{children}</>;
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <AccountSync />
      <FavoritesProvider>{children}</FavoritesProvider>
    </SessionProvider>
  );
}
