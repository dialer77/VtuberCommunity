"use client";

import { useEffect } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

/** AdSense 광고 슬롯. 퍼블리셔 ID가 없으면 프로덕션에선 렌더하지 않는다. */
export function AdSlot({ slot }: { slot?: string }) {
  useEffect(() => {
    if (!CLIENT) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* 광고 스크립트 미로딩 등 무시 */
    }
  }, []);

  if (!CLIENT) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <div className="rounded-xl border border-dashed border-border text-muted-2 text-xs text-center py-6 select-none">
        광고 영역 (AdSense 미설정)
      </div>
    );
  }

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
