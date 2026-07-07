import { PLATFORMS, type Platform } from "@/types";

export function PlatformBadge({ platform }: { platform: Platform }) {
  const meta = PLATFORMS[platform];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted"
      title={meta.label}
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
