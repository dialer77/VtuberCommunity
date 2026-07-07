import Link from "next/link";
import { NavLinks } from "@/components/nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-baseline gap-2 shrink-0">
          <span className="text-lg font-extrabold tracking-tight">버모아</span>
          <span className="font-mono text-xs text-muted-2 tracking-widest">
            VMOA
          </span>
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
