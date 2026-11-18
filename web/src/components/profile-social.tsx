import type { ProfileSocial } from "@/types";
import { XTimeline } from "@/components/x-timeline";

const KIND_ICON: Record<string, string> = {
  x: "𝕏",
  instagram: "📷",
  tiktok: "🎵",
  youtube: "▶",
  chzzk: "🟢",
  soop: "🔵",
  fancafe: "☕",
  discord: "💬",
  twitch: "🟣",
  pixiv: "🎨",
  threads: "@",
  bluesky: "🦋",
  weverse: "💜",
  website: "🔗",
};

const TAG_KIND: Record<string, string> = { fanart: "팬아트", clip: "클립·짤", stream: "방송", other: "태그" };

/** 프로필 머리의 공식 SNS 줄 (작게) */
export function SocialLinksRow({ social }: { social: ProfileSocial }) {
  if (social.links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="공식 SNS">
      {social.links.slice(0, 8).map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:border-accent/50 hover:text-foreground transition-colors"
        >
          <span aria-hidden>{KIND_ICON[l.kind] ?? "🔗"}</span>
          {l.label}
        </a>
      ))}
    </div>
  );
}

/** 'SNS·팬아트' 탭 — 공식 링크 · 커뮤니티 바로가기 · 팬아트 태그 · X 최근 게시물(누르면 불러옴) */
export function SocialTab({ social, name }: { social: ProfileSocial; name: string }) {
  const fanart = social.hashtags.filter((h) => h.kind === "fanart");
  const others = social.hashtags.filter((h) => h.kind !== "fanart");
  return (
    <div className="flex flex-col gap-5">
      {fanart.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4" aria-label="팬아트">
          <h3 className="text-sm font-bold">🎨 팬아트</h3>
          <p className="text-xs text-muted-2">
            {name}의 공식 팬아트 태그예요. 누르면 X 에서 그 태그가 달린 그림을 볼 수 있어요 (X 로그인 필요).
          </p>
          <div className="flex flex-wrap gap-2">
            {fanart.map((h) => (
              <a
                key={h.tag}
                href={h.searchUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
              >
                {h.tag} 팬아트 보기 ↗
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {social.links.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="공식 SNS">
          <h3 className="text-sm font-bold text-muted">공식 SNS·사이트</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {social.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-accent/50 transition-colors"
              >
                <span aria-hidden className="shrink-0">
                  {KIND_ICON[l.kind] ?? "🔗"}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{l.label}</span>
                  <span className="block truncate text-xs text-muted-2">{l.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {social.communities.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="커뮤니티">
          <h3 className="text-sm font-bold text-muted">커뮤니티 게시물 보러 가기</h3>
          <div className="flex flex-wrap gap-2">
            {social.communities.map((c) => (
              <a
                key={c.url}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:border-accent/50 hover:text-foreground transition-colors"
              >
                {c.label} ↗
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="공식 해시태그">
          <h3 className="text-sm font-bold text-muted">공식 해시태그</h3>
          <div className="flex flex-wrap gap-1.5">
            {others.map((h) => (
              <a
                key={h.tag}
                href={h.searchUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent hover:bg-accent/20"
              >
                {h.tag} <span className="opacity-70">{TAG_KIND[h.kind] ?? ""}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {social.xHandle ? <XTimeline handle={social.xHandle} /> : null}

      <p className="text-xs text-muted-2">
        ※ 팬아트와 게시물은 작가·버튜버의 것이라 버모아로 옮겨 오지 않고 원래 있는 곳으로 연결해요.
        {social.fromWeb ? " 링크·태그 일부는 버모아가 공식 프로필·위키에서 모은 정보라 틀릴 수 있어요. 틀리면 문의로 알려 주세요." : ""}
      </p>
    </div>
  );
}
