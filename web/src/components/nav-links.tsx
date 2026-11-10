"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollRow } from "@/components/scroll-row";

// V코인(/coins)은 테스트 기능이라 메뉴에서 뺐다 — URL 로만 접근 (비공개 베타).
const LINKS = [
  { href: "/", label: "LIVE" },
  { href: "/ranking", label: "랭킹" },
  { href: "/clips", label: "클립" },
  { href: "/debut", label: "신규 데뷔" },
  { href: "/issue", label: "이슈" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ScrollRow as="nav" className="flex items-center gap-0.5 sm:gap-1 text-[13px] sm:text-sm overflow-x-auto no-scrollbar">
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-md transition-colors ${
              active
                ? "text-accent font-semibold bg-accent/10"
                : "text-muted hover:text-foreground hover:bg-surface-2"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </ScrollRow>
  );
}
