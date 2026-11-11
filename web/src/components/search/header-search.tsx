"use client";

import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** 헤더 검색 — 넓은 화면은 입력창, 좁은 화면은 아이콘. 검색 페이지에서는 페이지 안의 입력창을 쓰므로 숨긴다 */
export function HeaderSearch() {
  const pathname = usePathname();
  if (pathname === "/search") return null;
  return (
    <>
      <Form action="/search" role="search" className="hidden md:block shrink-0">
        <label className="relative block">
          <span className="sr-only">버튜버 검색</span>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            name="q"
            type="search"
            placeholder="버튜버 검색"
            autoComplete="off"
            enterKeyHint="search"
            className="h-8 w-40 lg:w-52 rounded-md border border-border bg-surface pl-8 pr-2 text-sm placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
          />
        </label>
      </Form>
      <Link
        href="/search"
        aria-label="버튜버 검색"
        className="md:hidden shrink-0 rounded-md p-1.5 text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
      >
        <SearchIcon className="h-[18px] w-[18px]" />
      </Link>
    </>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
