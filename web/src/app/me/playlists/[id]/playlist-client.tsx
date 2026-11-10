"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Clip } from "@/types";
import { ClipCard } from "@/components/clip-card";
import { usePlayer } from "@/components/player/player-provider";

interface Playlist {
  id: number;
  title: string;
  total: number;
  clips: Clip[];
}

export function PlaylistClient({ id }: { id: string }) {
  const router = useRouter();
  const { play } = usePlayer();
  const [p, setP] = useState<Playlist | null | "missing">(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/me/playlists/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Playlist>) : null))
      .then((j) => alive && setP(j ?? "missing"))
      .catch(() => alive && setP("missing"));
    return () => {
      alive = false;
    };
  }, [id]);

  if (p === null) return <p className="text-sm text-muted">불러오는 중…</p>;
  if (p === "missing") return <p className="text-sm text-muted">재생목록을 찾을 수 없어요.</p>;

  const rename = async () => {
    const t = title.trim();
    if (!t || t === p.title) return setEditing(false);
    setBusy(true);
    const r = await fetch(`/api/me/playlists/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t }),
    }).catch(() => null);
    if (r?.ok) setP({ ...p, title: t });
    setEditing(false);
    setBusy(false);
  };

  const remove = async (videoId: string) => {
    setBusy(true);
    const r = await fetch(`/api/me/playlists/${p.id}/items/${videoId}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) setP({ ...p, total: p.total - 1, clips: p.clips.filter((c) => c.videoId !== videoId) });
    setBusy(false);
  };

  const destroy = async () => {
    if (!window.confirm(`'${p.title}' 재생목록을 지울까요? 담긴 클립 목록도 함께 지워져요.`)) return;
    setBusy(true);
    const r = await fetch(`/api/me/playlists/${p.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) router.push("/me");
    else setBusy(false);
  };

  const [first, ...rest] = p.clips;
  const missing = p.total - p.clips.length;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-lg font-bold"
            />
            <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg">
              저장
            </button>
          </form>
        ) : (
          <h1 className="text-2xl font-extrabold tracking-tight">{p.title}</h1>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-2">클립 {p.clips.length}개</span>
          {first ? (
            <button
              type="button"
              onClick={() => play({ id: first.videoId, title: first.title, channel: first.channelTitle, queue: rest.map((c) => c.videoId) })}
              className="rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-fg"
            >
              ▶ 전체 재생
            </button>
          ) : null}
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setTitle(p.title);
                setEditing(true);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-foreground"
            >
              이름 바꾸기
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void destroy()} className="rounded-md px-3 py-1.5 text-muted-2 hover:text-foreground">
            재생목록 지우기
          </button>
        </div>
        {missing > 0 ? <p className="text-xs text-muted-2">삭제·비공개된 클립 {missing}개는 보이지 않아요.</p> : null}
      </header>

      {p.clips.length === 0 ? (
        <p className="text-sm text-muted">아직 담은 클립이 없어요. 클립 페이지의 &ldquo;재생목록에 담기&rdquo;로 추가해 보세요.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-5">
          {p.clips.map((c) => (
            <div key={c.videoId} className="flex min-w-0 flex-col gap-1">
              <ClipCard clip={c} />
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(c.videoId)}
                className="w-fit text-xs text-muted-2 hover:text-foreground"
              >
                빼기
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
