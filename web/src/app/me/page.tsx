import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { MeClient } from "./me-client";

export const metadata: Metadata = {
  title: "내 페이지",
  robots: { index: false, follow: false },
};

export default function MePage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader title="내 페이지" description="최애와 방송 시작 알림을 관리해요." />
      <MeClient />
    </div>
  );
}
