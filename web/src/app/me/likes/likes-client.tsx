"use client";

import { useEffect, useState } from "react";
import type { Clip } from "@/types";
import { ClipGrid } from "@/components/clip-card";
import { usePlayer } from "@/components/player/player-provider";

const PAGE = 24;

export function LikesClient() {
  const { play } = usePlayer();
  const [clips, setClips] = useState<Clip[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (offset: number) => {
    setBusy(true);
    const r = await fetch(`/api/me/likes?limit=${PAGE}&offset=${offset}`).catch(() => null);
    const j = r?.ok ? ((await r.json()) as { total: number; clips: Clip[] }) : { total: 0, clips: [] };
    setTotal(j.total);
    setClips((prev) => (offset === 0 ? j.clips : [...prev, ...j.clips]));
    setBusy(false);
  };

  useEffect(() => {
    let alive = true;
    fetch(`/api/me/likes?limit=${PAGE}&offset=0`)
      .then((r) => (r.ok ? r.json() : { total: 0, clips: [] }))
      .then((j: { total: number; clips: Clip[] }) => {
        if (!alive) return;
        setTotal(j.total);
        setClips(j.clips);
      })
      .catch(() => alive && setTotal(0));
    return () => {
      alive = false;
    };
  }, []);

  if (total === null) return <p className="text-sm text-muted">불러오는 중…</p>;
  if (clips.length === 0) return <p className="text-sm text-muted">아직 좋아요한 클립이 없어요.</p>;
  const [first, ...rest] = clips;
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => play({ id: first!.videoId, title: first!.title, channel: first!.channelTitle, queue: rest.map((c) => c.videoId) })}
        className="w-fit rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg"
      >
        ▶ 이어서 재생 ({Math.min(clips.length, 51)}개)
      </button>
      <ClipGrid clips={clips} narrow />
      {clips.length < total ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(clips.length)}
          className="mx-auto rounded-md border border-border px-4 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
        >
          더 보기 ({clips.length}/{total})
        </button>
      ) : null}
    </div>
  );
}
