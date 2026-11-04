import Link from "next/link";
import type { TagCount, TagKind } from "@/types";
import { ScrollRow } from "@/components/scroll-row";

const KIND_LABEL: Record<TagKind, string> = {
  agency: "소속사",
  concept: "컨셉",
  content: "콘텐츠",
};
const KIND_ORDER: TagKind[] = ["agency", "concept", "content"];

/** 서브컬처 태그 필터 바 — VMOA만의 큐레이션 분류. URL(?tag=)로 필터. */
export function TagBar({
  tags,
  active,
}: {
  tags: TagCount[];
  active?: string;
}) {
  const live = tags.filter((t) => t.count > 0);
  if (live.length === 0) return null;

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: live
      .filter((t) => t.kind === kind)
      .sort((a, b) => b.count - a.count),
  })).filter((g) => g.items.length > 0);

  // 넓은 화면: 줄바꿈해서 전부 보이게 / 좁은 화면: 한 줄 가로 스크롤(스와이프·휠)
  return (
    <ScrollRow className="flex items-center gap-x-4 gap-y-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-1 sm:flex-wrap sm:overflow-visible">
      <Chip href="/" label="전체" active={!active} />
      {groups.map((g) => (
        <div key={g.kind} className="flex items-center gap-2 shrink-0 sm:shrink sm:flex-wrap">
          <span className="shrink-0 text-[11px] font-semibold text-muted-2">
            {KIND_LABEL[g.kind]}
          </span>
          {g.items.map((t) => (
            <Chip
              key={t.id}
              href={`/?tag=${t.id}`}
              label={`${t.emoji} ${t.label}`}
              count={t.count}
              active={active === t.id}
            />
          ))}
        </div>
      ))}
    </ScrollRow>
  );
}

function Chip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? "border-accent bg-accent text-accent-fg font-semibold"
          : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span
          className={`ml-1.5 tabular-nums ${
            active ? "opacity-80" : "text-muted-2"
          }`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
