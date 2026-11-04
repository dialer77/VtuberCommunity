"use client";

import { useState } from "react";

/** 외부 사이트 이미지 (기사 썸네일 등). 깨지면 자리만 남기고 숨긴다. */
export function RemoteImage({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
