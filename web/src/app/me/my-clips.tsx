"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Clip, PlaylistSummary } from "@/types";
import { ClipGrid } from "@/components/clip-card";
import { RemoteImage } from "@/components/remote-image";

/** 좋아요한 클립 (최근 6개) */
export function MyLikes() {
  const [data, setData] = useState<{ total: number; clips: Clip[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/me/likes?limit=6")
      .then((r) => (r.ok ? r.json() : { total: 0, clips: [] }))
      .then((j: { total: number; clips: Clip[] }) => alive && setData(j))
      .catch(() => alive && setData({ total: 0, clips: [] }));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">좋아요한 클립{data?.total ? ` ${data.total}` : ""}</h2>
        {data && data.total > data.clips.length ? (
          <Link href="/me/likes" className="text-sm text-accent hover:underline">
            모두 보기 →
          </Link>
        ) : null}
      </div>
      {!data ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : data.clips.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          아직 좋아요한 클립이 없어요. <Link href="/clips" className="text-accent">클립</Link>에서 마음에 드는 클립에 ♡를 눌러 보세요.
        </p>
      ) : (
        <ClipGrid clips={data.clips} narrow />
      )}
    </section>
  );
}

/** 내 재생목록 — 목록 + 새로 만들기 */
export function MyPlaylists() {
  const [lists, setLists] = useState<PlaylistSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/playlists")
      .then((r) => (r.ok ? r.json() : { playlists: [] }))
      .then((j: { playlists: PlaylistSummary[] }) => alive && setLists(j.playlists ?? []))
      .catch(() => alive && setLists([]));
    return () => {
      alive = false;
    };
  }, []);

  const create = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/me/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t }),
    }).catch(() => null);
    if (res?.ok) {
      const { id } = (await res.json()) as { id: number };
      setLists((l) => [{ id, title: t, count: 0, updatedAt: new Date().toISOString(), firstVideoId: null }, ...(l ?? [])]);
      setTitle("");
    } else {
      setError(res?.status === 409 ? "재생목록은 30개까지 만들 수 있어요." : "만들지 못했어요.");
    }
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-bold">내 재생목록</h2>
      {!lists ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-muted">클립 페이지의 &ldquo;재생목록에 담기&rdquo;로 모아 두고 이어서 볼 수 있어요.</p>
      ) : (
        <ul className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
          {lists.map((l) => (
            <li key={l.id} className="border-b border-border last:border-b-0">
              <Link href={`/me/playlists/${l.id}`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
                <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded bg-surface-2">
                  {l.firstVideoId ? (
                    <RemoteImage src={`https://i.ytimg.com/vi/${l.firstVideoId}/hqdefault.jpg`} className="absolute inset-0 h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.title}</span>
                  <span className="text-xs text-muted-2">클립 {l.count}개</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
          placeholder="새 재생목록 이름"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        />
        <button type="submit" disabled={busy || !title.trim()} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg disabled:opacity-50">
          만들기
        </button>
      </form>
      {error ? <p className="text-sm text-rise">{error}</p> : null}
    </section>
  );
}
