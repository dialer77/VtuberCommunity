"use client";

import { useEffect, useRef } from "react";

/**
 * 가로로 넘치는 한 줄 목록. 터치 스와이프 + 마우스 세로 휠 → 가로 스크롤.
 * (넘치지 않거나 끝에 닿으면 휠은 원래대로 페이지를 스크롤한다)
 */
export function ScrollRow({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "nav";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return; // 안 넘치면 그대로
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // 이미 가로 스크롤(트랙패드)
      const max = el.scrollWidth - el.clientWidth;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return; // 끝이면 페이지 스크롤로 넘김
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <Tag ref={ref as React.Ref<HTMLDivElement>} className={className}>
      {children}
    </Tag>
  );
}
