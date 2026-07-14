import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/about", label: "소개" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/contact", label: "문의" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-8">
      <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col gap-3 text-muted-2">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {FOOTER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-sm">
          <span className="font-semibold text-muted">버모아 · VMOA</span> —
          치지직·SOOP·유튜브의 한국 버튜버를 한 곳에서.
        </p>
        <p className="text-xs">
          방송 현황은 각 플랫폼의 공개 정보를 집계한 것으로, 수집 시점 기준이라
          실제와 차이가 있을 수 있습니다. 채널·방송의 권리는 각 크리에이터와
          플랫폼에 있습니다.
        </p>
      </div>
    </footer>
  );
}
