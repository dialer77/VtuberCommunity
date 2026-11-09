"use client";

import Link from "next/link";
import { AUTH_ON, useFavorites } from "@/components/auth/auth-providers";
import { ScrollRow } from "@/components/scroll-row";
import { RemoteImage } from "@/components/remote-image";
import { formatCount } from "@/lib/format";

function Row() {
  const { loggedIn, loaded, items } = useFavorites();
  if (!loggedIn || !loaded || items.length === 0) return null;
  const live = items.filter((f) => f.isLive).sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0));
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">
          ★ 내 최애 방송 <span className="text-muted-2 font-normal">{live.length}</span>
        </h2>
        <Link href="/me" className="text-xs text-muted-2 hover:text-accent transition-colors">
          최애 관리
        </Link>
      </div>
      {live.length === 0 ? (
        <p className="text-sm text-muted">지금 방송 중인 최애가 없어요.</p>
      ) : (
        <ScrollRow className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 py-1">
          {live.map((f) => (
            <Link
              key={f.channelId}
              href={`/vtuber/${f.platform}/${f.channelId}`}
              className="group w-52 shrink-0 overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-accent/60"
            >
              <div className="relative aspect-video bg-surface-2">
                {f.thumbnailUrl ? (
                  <RemoteImage src={f.thumbnailUrl} className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                  {formatCount(f.viewers ?? 0)}
                </span>
              </div>
              <div className="p-2">
                <p className="truncate text-sm font-semibold group-hover:text-accent transition-colors">
                  {f.channelName}
                </p>
                <p className="truncate text-xs text-muted">{f.title}</p>
              </div>
            </Link>
          ))}
        </ScrollRow>
      )}
    </section>
  );
}

export function FavoriteLiveRow() {
  return AUTH_ON ? <Row /> : null;
}
