"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "지금 방송중" },
  { href: "/ranking", label: "랭킹" },
  { href: "/coins", label: "V코인" },
  { href: "/debut", label: "신규 데뷔" },
  { href: "/issue", label: "이슈" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0.5 sm:gap-1 text-[13px] sm:text-sm overflow-x-auto no-scrollbar">
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
    </nav>
  );
}
