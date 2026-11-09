"use client";

import { AUTH_ON, useFavorites, type FavoriteTarget } from "@/components/auth/auth-providers";

function Button({ target, compact }: { target: FavoriteTarget; compact?: boolean }) {
  const { isFavorite, toggle } = useFavorites();
  const on = isFavorite(target.channelId);
  const label = on ? "최애 해제" : "최애 등록";
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void toggle(target)}
        aria-label={`${target.channelName} ${label}`}
        aria-pressed={on}
        title={label}
        className={`flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-lg leading-none backdrop-blur-sm transition-colors hover:bg-black/75 ${
          on ? "text-yellow-300" : "text-white/85"
        }`}
      >
        {on ? "★" : "☆"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void toggle(target)}
      aria-pressed={on}
      className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
        on
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted hover:border-accent/60 hover:text-foreground"
      }`}
    >
      {on ? "★ 최애" : "☆ 최애 등록"}
    </button>
  );
}

export function FavoriteButton(props: { target: FavoriteTarget; compact?: boolean }) {
  return AUTH_ON ? <Button {...props} /> : null;
}
