import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { LoginGate } from "../login-gate";
import { LikesClient } from "./likes-client";

export const metadata: Metadata = {
  title: "좋아요한 클립",
  robots: { index: false, follow: false },
};

export default function MyLikesPage() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <Link href="/me" className="text-sm text-muted hover:text-accent transition-colors w-fit">
        ← 내 페이지
      </Link>
      <PageHeader title="좋아요한 클립" />
      <LoginGate callbackUrl="/me/likes">
        <LikesClient />
      </LoginGate>
    </div>
  );
}
