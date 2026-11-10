"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { AUTH_ON } from "@/components/auth/auth-providers";
import type { ClipTag, ClipTagVote, MyClipState } from "@/types";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50";

async function call(url: string, method: string, body?: unknown): Promise<Response | null> {
  return fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
}

/** 재생목록에 담기 — 내 재생목록을 체크로 넣고 빼기 + 새로 만들기 */
function PlaylistPicker({
  videoId,
  lists,
  onChange,
}: {
  videoId: string;
  lists: MyClipState["playlists"];
  onChange: (next: MyClipState["playlists"]) => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = async (id: number, has: boolean) => {
    setBusy(true);
    setError("");
    const res = await call(`/api/me/playlists/${id}/items/${videoId}`, has ? "DELETE" : "PUT");
    if (res?.ok) onChange(lists.map((l) => (l.id === id ? { ...l, has: !has, count: l.count + (has ? -1 : 1) } : l)));
    else setError(res?.status === 409 ? "재생목록이 가득 찼어요 (200개)." : "처리하지 못했어요.");
    setBusy(false);
  };

  const create = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    setError("");
    const res = await call("/api/me/playlists", "POST", { title: t, videoId });
    if (res?.ok) {
      const { id } = (await res.json()) as { id: number };
      onChange([{ id, title: t, count: 1, updatedAt: new Date().toISOString(), firstVideoId: videoId, has: true }, ...lists]);
      setTitle("");
    } else {
      setError(res?.status === 409 ? "재생목록은 30개까지 만들 수 있어요." : "만들지 못했어요.");
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      {lists.length ? (
        <ul className="flex flex-col gap-1">
          {lists.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={l.has} disabled={busy} onChange={() => void toggle(l.id, l.has)} />
                <span className="truncate">{l.title}</span>
                <span className="text-xs text-muted-2 tabular-nums">{l.count}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-2">아직 재생목록이 없어요.</p>
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
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
        <button type="submit" disabled={busy || !title.trim()} className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-accent-fg disabled:opacity-50">
          만들고 담기
        </button>
      </form>
      {error ? <p className="text-xs text-rise">{error}</p> : null}
      <Link href="/me" className="w-fit text-xs text-muted hover:text-accent">
        내 재생목록 관리 →
      </Link>
    </div>
  );
}

/** '어떤 순간' 태그 투표 — 맞아요/아니에요, 빠진 순간 제안 */
function TagVotes({
  videoId,
  initial,
  allMoments,
  margin,
  myVotes,
  loggedIn,
}: {
  videoId: string;
  initial: ClipTagVote[];
  allMoments: ClipTag[];
  margin: number;
  myVotes: Record<string, number>;
  loggedIn: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [mine, setMine] = useState(myVotes);
  const [busy, setBusy] = useState(false);

  const vote = async (tag: string, v: 1 | -1) => {
    if (!loggedIn) {
      await signIn("google", { callbackUrl: window.location.href });
      return;
    }
    const next = mine[tag] === v ? 0 : v;
    setBusy(true);
    const res = await call(`/api/me/votes/${videoId}`, "PUT", { tag, vote: next });
    if (res?.ok) {
      const j = (await res.json()) as { tagVotes: ClipTagVote[] };
      setRows(j.tagVotes);
      setMine((m) => ({ ...m, [tag]: next }));
    }
    setBusy(false);
  };

  const others = allMoments.filter((t) => !rows.some((r) => r.id === t.id));
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${r.shown ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted-2 line-through"}`}>
              {r.emoji} {r.label}
            </span>
            <span className="text-[11px] text-muted-2">{r.ai ? "버모아 분류" : "이용자 제안"}</span>
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void vote(r.id, 1)}
                aria-pressed={mine[r.id] === 1}
                className={`rounded px-2 py-0.5 text-xs tabular-nums ${mine[r.id] === 1 ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-foreground"}`}
              >
                맞아요 {r.up}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void vote(r.id, -1)}
                aria-pressed={mine[r.id] === -1}
                className={`rounded px-2 py-0.5 text-xs tabular-nums ${mine[r.id] === -1 ? "bg-foreground text-background" : "bg-surface-2 text-muted hover:text-foreground"}`}
              >
                아니에요 {r.down}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {others.length ? (
        <label className="flex items-center gap-2 text-xs text-muted">
          빠진 순간이 있나요?
          <select
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && void vote(e.target.value, 1)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">순간 제안하기</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p className="text-[11px] text-muted-2">찬반이 {margin}표 이상 차이 나면 분류에 반영돼요. 로그인한 이용자만 투표할 수 있어요.</p>
    </div>
  );
}

/** 클립 상세: 좋아요 · 재생목록에 담기 · 태그 투표 (로그인 기능이 켜졌을 때만) */
export function ClipActions({
  videoId,
  likes,
  tagVotes,
  allMoments,
  margin,
}: {
  videoId: string;
  likes: number;
  tagVotes: ClipTagVote[];
  allMoments: ClipTag[];
  margin: number;
}) {
  if (!AUTH_ON) return null;
  return <Inner videoId={videoId} likes={likes} tagVotes={tagVotes} allMoments={allMoments} margin={margin} />;
}

function Inner({
  videoId,
  likes,
  tagVotes,
  allMoments,
  margin,
}: {
  videoId: string;
  likes: number;
  tagVotes: ClipTagVote[];
  allMoments: ClipTag[];
  margin: number;
}) {
  const { status } = useSession();
  const loggedIn = status === "authenticated";
  const [state, setState] = useState<MyClipState | null>(null);
  const [count, setCount] = useState(likes);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    fetch(`/api/me/clip/${videoId}`)
      .then((r) => (r.ok ? (r.json() as Promise<MyClipState>) : null))
      .then((j) => {
        if (alive && j) setState(j);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [loggedIn, videoId]);

  const needLogin = async () => {
    await signIn("google", { callbackUrl: window.location.href });
  };

  const like = async () => {
    if (!loggedIn) return needLogin();
    if (!state) return;
    setBusy(true);
    const res = await call(`/api/me/likes/${videoId}`, state.liked ? "DELETE" : "PUT");
    if (res?.ok) {
      const j = (await res.json()) as { liked: boolean; likes: number };
      setState({ ...state, liked: j.liked });
      setCount(j.likes);
    }
    setBusy(false);
  };

  const inLists = state?.playlists.filter((l) => l.has).length ?? 0;
  return (
    <section className="flex flex-col gap-3" aria-label="참여">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void like()}
          disabled={busy || (loggedIn && !state)}
          aria-pressed={!!state?.liked}
          className={`${btn} ${state?.liked ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/60 hover:text-foreground"}`}
        >
          {state?.liked ? "♥" : "♡"} 좋아요 <span className="tabular-nums">{count}</span>
        </button>
        <button
          type="button"
          onClick={() => (loggedIn ? setOpen((o) => !o) : void needLogin())}
          disabled={loggedIn && !state}
          aria-expanded={open}
          className={`${btn} ${inLists ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/60 hover:text-foreground"}`}
        >
          ＋ 재생목록에 담기{inLists ? ` · ${inLists}` : ""}
        </button>
      </div>
      {open && state ? (
        <PlaylistPicker videoId={videoId} lists={state.playlists} onChange={(playlists) => setState({ ...state, playlists })} />
      ) : null}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-bold text-muted">어떤 순간인가요? (태그 투표)</p>
        <TagVotes
          // 내 투표를 받아 오면 새로 그린다
          key={state ? "mine" : "init"}
          videoId={videoId}
          initial={tagVotes}
          allMoments={allMoments}
          margin={margin}
          myVotes={state?.votes ?? {}}
          loggedIn={loggedIn}
        />
      </div>
    </section>
  );
}
