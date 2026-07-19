import Link from "next/link";
import type { TagCount } from "@/types";

/** 서브컬처 태그 필터 바 — VMOA만의 큐레이션 분류. URL(?tag=)로 필터. */
export function TagBar({
  tags,
  active,
}: {
  tags: TagCount[];
  active?: string;
}) {
  const shown = tags
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  if (shown.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-1">
      <Chip href="/" label="전체" active={!active} />
      {shown.map((t) => (
        <Chip
          key={t.id}
          href={`/?tag=${t.id}`}
          label={`${t.emoji} ${t.label}`}
          count={t.count}
          active={active === t.id}
        />
      ))}
    </div>
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
