import type { IssueSource } from "@/types";
import { formatDate } from "@/lib/format";
import { RemoteImage } from "@/components/remote-image";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function sourceDate(s: IssueSource): string | null {
  if (!s.publishedAt) return null;
  const t = Date.parse(s.publishedAt.length === 10 ? `${s.publishedAt}T00:00:00+09:00` : s.publishedAt);
  return Number.isNaN(t) ? null : formatDate(new Date(t).toISOString());
}

/** 기사·자료 미리보기 카드. lg = 본문 위 대표 자료, md = 출처 목록 */
export function SourceCard({ source, size = "md" }: { source: IssueSource; size?: "md" | "lg" }) {
  const meta = [source.publisher ?? domainOf(source.url), sourceDate(source)].filter(Boolean).join(" · ");
  const icon = source.kind === "youtube" ? "▶" : "📰";

  if (size === "lg") {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="group block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-accent/60"
      >
        {source.imageUrl ? (
          <div className="relative aspect-[1.91/1] bg-surface-2">
            <RemoteImage src={source.imageUrl} className="absolute inset-0 h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-2">
            {icon} {meta}
          </span>
          <span className="font-semibold leading-snug group-hover:text-accent transition-colors line-clamp-2">
            {source.title}
          </span>
          {source.description ? (
            <span className="text-sm text-muted line-clamp-2">{source.description}</span>
          ) : null}
          <span className="text-xs text-accent mt-1">원문 보기 ↗</span>
        </div>
      </a>
    );
  }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group flex items-stretch gap-3 overflow-hidden rounded-xl border border-border bg-surface p-2.5 transition-colors hover:border-accent/60"
    >
      <div className="relative w-28 sm:w-36 shrink-0 aspect-video overflow-hidden rounded-lg bg-surface-2 flex items-center justify-center text-2xl text-foreground/20">
        <span aria-hidden>{icon}</span>
        {source.imageUrl ? (
          <RemoteImage src={source.imageUrl} className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className="text-xs text-muted-2 truncate">{meta}</span>
        <span className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {source.title}
        </span>
        <span className="text-xs text-muted-2 truncate">{domainOf(source.url)} ↗</span>
      </div>
    </a>
  );
}

/** 유튜브 영상 임베드 (개인정보 보호 모드 도메인) */
export function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`}
        title={title}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

/** 이슈 대표 자료: 유튜브가 있으면 영상, 아니면 이미지가 있는 첫 기사 */
export function pickCover(sources: IssueSource[]): IssueSource | null {
  return (
    sources.find((s) => s.kind === "youtube" && s.embedId) ??
    sources.find((s) => s.imageUrl) ??
    null
  );
}
