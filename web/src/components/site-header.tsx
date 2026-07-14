import Link from "next/link";
import { NavLinks } from "@/components/nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">버모아</span>
          <span className="font-mono text-[10px] text-muted-2 tracking-[0.2em] mt-0.5">
            VMOA
          </span>
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
