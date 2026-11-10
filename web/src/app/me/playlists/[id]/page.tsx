import type { Metadata } from "next";
import Link from "next/link";
import { LoginGate } from "../../login-gate";
import { PlaylistClient } from "./playlist-client";

export const metadata: Metadata = {
  title: "내 재생목록",
  robots: { index: false, follow: false },
};

export default async function MyPlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <Link href="/me" className="text-sm text-muted hover:text-accent transition-colors w-fit">
        ← 내 페이지
      </Link>
      <LoginGate callbackUrl={`/me/playlists/${encodeURIComponent(id)}`}>
        <PlaylistClient id={id} />
      </LoginGate>
    </div>
  );
}
