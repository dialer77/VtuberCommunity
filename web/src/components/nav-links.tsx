"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "지금 방송중" },
  { href: "/debut", label: "신규 데뷔" },
  { href: "/ranking", label: "랭킹" },
  { href: "/issue", label: "이슈" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md transition-colors ${
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
