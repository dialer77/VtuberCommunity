"use client";

import { useEffect } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

// 자리 이름 → 애드센스 광고 단위 ID (숫자). 애드센스에서 광고 단위를 만든 뒤 환경변수로 넣는다.
// NEXT_PUBLIC_ 값은 빌드 때 글자 그대로 바뀌므로 하나씩 적어야 한다.
const SLOT_IDS: Record<string, string | undefined> = {
  "home-mid": process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME_MID,
  "issue-bottom": process.env.NEXT_PUBLIC_ADSENSE_SLOT_ISSUE_BOTTOM,
};

/**
 * AdSense 광고 자리. 퍼블리셔 ID 와 그 자리의 광고 단위 ID(숫자)가 모두 있을 때만 그린다.
 * (승인 전이나 단위 ID 가 없을 때 빈 광고 칸이 생기지 않게. 자동 광고만 쓸 때는 단위 ID 없이 둔다)
 */
export function AdSlot({ slot }: { slot: keyof typeof SLOT_IDS }) {
  const unit = SLOT_IDS[slot];
  const active = !!CLIENT && !!unit && /^\d+$/.test(unit);

  useEffect(() => {
    if (!active) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* 광고 스크립트 미로딩 등 무시 */
    }
  }, [active]);

  if (!active) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <div className="rounded-xl border border-dashed border-border text-muted-2 text-xs text-center py-6 select-none">
        광고 영역 ({slot}, AdSense 미설정)
      </div>
    );
  }

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={CLIENT}
      data-ad-slot={unit}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
