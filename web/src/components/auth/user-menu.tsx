"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { AUTH_ON } from "@/components/auth/auth-providers";
import { RemoteImage } from "@/components/remote-image";

function Menu() {
  const { data: session, status } = useSession();
  if (status === "loading") return <span className="h-7 w-7 shrink-0" aria-hidden />;
  if (status !== "authenticated") {
    return (
      <button
        type="button"
        onClick={() => signIn("google")}
        className="shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] sm:text-sm text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
      >
        로그인
      </button>
    );
  }
  const name = session?.user?.name ?? "내 페이지";
  const image = session?.user?.image;
  return (
    <Link
      href="/me"
      title={name}
      aria-label="내 페이지"
      className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-xs font-bold text-muted"
    >
      <span aria-hidden>{name.trim().charAt(0)}</span>
      {image ? <RemoteImage src={image} className="absolute inset-0 h-full w-full object-cover" /> : null}
    </Link>
  );
}

export function UserMenu() {
  return AUTH_ON ? <Menu /> : null;
}
