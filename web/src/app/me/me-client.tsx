"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { AUTH_ON, useFavorites } from "@/components/auth/auth-providers";
import { PlatformBadge } from "@/components/platform-badge";
import { Avatar } from "@/components/avatar";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push-client";
import { MyLikes, MyPlaylists } from "./my-clips";

function PushPanel() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPushState().then(setState, () => setState("unsupported"));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리에 실패했어요.");
    }
    setState(await getPushState().catch(() => "unsupported" as PushState));
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-bold">방송 시작 알림</h2>
      <p className="text-sm text-muted">최애가 방송을 시작하면 이 브라우저로 알려드려요. 기기마다 따로 켜야 해요.</p>
      {state === "unsupported" ? (
        <p className="text-sm text-muted-2">
          이 브라우저는 알림을 지원하지 않아요. 아이폰은 Safari 공유 메뉴에서 &ldquo;홈 화면에 추가&rdquo;를 한 뒤 그 앱에서 켤 수 있어요.
        </p>
      ) : state === "denied" ? (
        <p className="text-sm text-muted-2">브라우저에서 이 사이트의 알림이 차단돼 있어요. 주소창의 사이트 설정에서 허용해 주세요.</p>
      ) : state ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(state === "on" ? disablePush : enablePush)}
          className={`w-fit rounded-md px-3 py-1.5 text-sm font-semibold transition-opacity disabled:opacity-50 ${
            state === "on" ? "border border-border text-muted" : "bg-accent text-accent-fg"
          }`}
        >
          {state === "on" ? "이 기기 알림 끄기" : "이 기기에서 알림 받기"}
        </button>
      ) : null}
      {error ? <p className="text-sm text-rise">{error}</p> : null}
    </section>
  );
}

function FavoriteList() {
  const { loaded, items, toggle, setNotify } = useFavorites();
  if (!loaded) return <p className="text-sm text-muted">불러오는 중…</p>;
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        아직 최애가 없어요. <Link href="/" className="text-accent">LIVE</Link>나 버튜버 페이지에서 ☆를 눌러 등록해 보세요.
      </p>
    );
  }
  return (
    <ul className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
      {items.map((f) => (
        <li key={f.channelId} className="flex items-center gap-3 border-b border-border p-3 last:border-b-0">
          <Link href={`/vtuber/${f.platform}/${f.channelId}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={f.channelName} platform={f.platform} size={36} />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate font-semibold">{f.channelName}</span>
                <PlatformBadge platform={f.platform} />
                {f.isLive ? (
                  <span className="shrink-0 rounded bg-live px-1.5 py-0.5 text-[10px] font-bold text-white">LIVE</span>
                ) : null}
              </span>
            </span>
          </Link>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={f.notify}
              onChange={(e) => void setNotify(f.channelId, e.target.checked)}
            />
            알림
          </label>
          <button
            type="button"
            onClick={() => void toggle({ platform: f.platform, channelId: f.channelId, channelName: f.channelName })}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-surface-2"
          >
            삭제
          </button>
        </li>
      ))}
    </ul>
  );
}

function AccountPanel() {
  const [busy, setBusy] = useState(false);
  const withdraw = async () => {
    if (!window.confirm("탈퇴하면 최애·알림 설정·좋아요·재생목록·태그 투표가 모두 삭제되고 되돌릴 수 없어요. 탈퇴할까요?")) return;
    setBusy(true);
    const reg = await navigator.serviceWorker?.getRegistration("/").catch(() => undefined);
    await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
    const res = await fetch("/api/me", { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      await signOut({ callbackUrl: "/" });
    } else {
      setBusy(false);
      window.alert("탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  };
  return (
    <section className="flex flex-wrap gap-2 text-sm">
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-foreground"
      >
        로그아웃
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void withdraw()}
        className="rounded-md px-3 py-1.5 text-muted-2 hover:text-foreground disabled:opacity-50"
      >
        탈퇴
      </button>
    </section>
  );
}

function Inner() {
  const { data: session, status } = useSession();
  if (status === "loading") return <p className="text-sm text-muted">불러오는 중…</p>;
  if (status !== "authenticated") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm text-muted">로그인하면 최애·방송 시작 알림, 클립 좋아요·재생목록·태그 투표를 쓸 수 있어요.</p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/me" })}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg"
        >
          구글로 로그인
        </button>
        <p className="text-xs text-muted-2">
          만 14세 이상만 가입할 수 있어요. 로그인하면 <Link href="/terms" className="underline">이용약관</Link>과{" "}
          <Link href="/privacy" className="underline">개인정보처리방침</Link>에 동의하게 돼요.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">{session?.user?.name}님, 반가워요.</p>
      <PushPanel />
      <section className="flex flex-col gap-2.5">
        <h2 className="font-bold">내 최애</h2>
        <FavoriteList />
      </section>
      <MyPlaylists />
      <MyLikes />
      <AccountPanel />
    </div>
  );
}

export function MeClient() {
  if (!AUTH_ON) return <p className="text-sm text-muted">로그인 기능을 준비하고 있어요.</p>;
  return <Inner />;
}
