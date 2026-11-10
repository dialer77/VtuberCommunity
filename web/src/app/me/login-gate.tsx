"use client";

import { signIn, useSession } from "next-auth/react";
import { AUTH_ON } from "@/components/auth/auth-providers";

function Gate({ children, callbackUrl }: { children: React.ReactNode; callbackUrl: string }) {
  const { status } = useSession();
  if (status === "loading") return <p className="text-sm text-muted">불러오는 중…</p>;
  if (status !== "authenticated") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm text-muted">로그인하면 볼 수 있어요.</p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg"
        >
          구글로 로그인
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

/** 로그인한 사람만 보는 화면 (로그인 기능이 꺼져 있으면 안내만). 세션은 루트 레이아웃의 AuthProviders 가 제공 */
export function LoginGate({ children, callbackUrl }: { children: React.ReactNode; callbackUrl: string }) {
  if (!AUTH_ON) return <p className="text-sm text-muted">로그인 기능을 준비하고 있어요.</p>;
  return <Gate callbackUrl={callbackUrl}>{children}</Gate>;
}
