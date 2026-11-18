// 공식 SNS·커뮤니티 링크 정리: 주소를 종류(X·인스타·팬카페 …)로 나누고 같은 곳을 하나로 합친다.
// 팬아트·게시물은 옮겨 오지 않는다 — 원래 있는 곳으로 연결만 (저작권·각 서비스 약관).

export type LinkKind =
  | "x"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "chzzk"
  | "soop"
  | "fancafe"
  | "discord"
  | "twitch"
  | "pixiv"
  | "threads"
  | "bluesky"
  | "weverse"
  | "website";

export interface SocialLink {
  kind: LinkKind;
  /** 화면에 보일 이름 (예: X, 팬카페) */
  label: string;
  url: string;
  /** X 계정 (@ 없이) — 타임라인 임베드용 */
  handle?: string;
}

export const LINK_LABEL: Record<LinkKind, string> = {
  x: "X",
  instagram: "인스타그램",
  tiktok: "틱톡",
  youtube: "YouTube",
  chzzk: "치지직",
  soop: "SOOP",
  fancafe: "팬카페",
  discord: "디스코드",
  twitch: "트위치",
  pixiv: "pixiv",
  threads: "스레드",
  bluesky: "블루스카이",
  weverse: "위버스",
  website: "공식 사이트",
};

/** 링크로 보이지 않는 것: 후원·결제·단축 주소·검색 결과 등 */
const SKIP_HOST = /(^|\.)(toon\.at|toonation\.co|twip\.kr|ssapi\.kr|buymeacoffee\.com|ko-fi\.com|patreon\.com|bit\.ly|linktr\.ee|lit\.link|fancim\.me|google\.com|search\.naver\.com)$/i;

/** 주소 → 종류·정리된 주소 (모르는 주소는 공식 사이트, 쓸 수 없으면 null) */
export function classifyLink(raw: string): SocialLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^(?!https?:\/\/)/i, "https://"));
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const mk = (kind: LinkKind, url: string, handle?: string): SocialLink => ({ kind, label: LINK_LABEL[kind], url, ...(handle ? { handle } : {}) });

  if (host === "x.com" || host === "twitter.com") {
    if (!/^[A-Za-z0-9_]{1,15}$/.test(first) || ["search", "hashtag", "i", "intent", "home", "share"].includes(first.toLowerCase())) return null;
    return mk("x", `https://x.com/${first}`, first);
  }
  if (host === "instagram.com") {
    if (!/^[A-Za-z0-9_.]{1,30}$/.test(first) || ["p", "reel", "explore", "stories"].includes(first)) return null;
    return mk("instagram", `https://www.instagram.com/${first}/`);
  }
  if (host === "tiktok.com") return first.startsWith("@") ? mk("tiktok", `https://www.tiktok.com/${first}`) : null;
  if (host === "youtube.com" || host === "youtu.be") {
    if (first.startsWith("@") || first === "channel" || first === "c" || first === "user") return mk("youtube", `https://www.youtube.com/${parts.slice(0, first.startsWith("@") ? 1 : 2).join("/")}`);
    return null;
  }
  if (host === "chzzk.naver.com") return /^[0-9a-f]{32}$/i.test(first) ? mk("chzzk", `https://chzzk.naver.com/${first.toLowerCase()}`) : null;
  if (/(^|\.)sooplive\.co\.kr$|(^|\.)afreecatv\.com$/.test(host)) return mk("soop", u.toString().replace(/\/$/, ""));
  if (host === "cafe.naver.com" || host === "game.naver.com") return first ? mk("fancafe", `https://${host}/${parts.slice(0, 2).join("/")}`) : null;
  if (host === "discord.gg" || host === "discord.com") return first ? mk("discord", `https://${host}/${parts.join("/")}`) : null;
  if (host === "twitch.tv") return first ? mk("twitch", `https://www.twitch.tv/${first}`) : null;
  if (host === "pixiv.net") return mk("pixiv", u.toString());
  if (host === "threads.net" || host === "threads.com") return first.startsWith("@") ? mk("threads", `https://www.threads.net/${first}`) : null;
  if (host === "bsky.app") return mk("bluesky", u.toString());
  if (host === "weverse.io") return mk("weverse", u.toString());
  if (SKIP_HOST.test(host)) return null;
  return mk("website", u.toString());
}

/** 같은 곳(정리된 주소 기준)은 하나만, 종류 순서대로 */
export function mergeLinks(lists: SocialLink[][]): SocialLink[] {
  const order: LinkKind[] = ["x", "instagram", "tiktok", "youtube", "chzzk", "soop", "fancafe", "discord", "weverse", "threads", "bluesky", "twitch", "pixiv", "website"];
  const seen = new Set<string>();
  const out: SocialLink[] = [];
  for (const l of lists.flat()) {
    const key = l.url.toLowerCase().replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 16);
}

/** 해시태그 정리: '#' 붙이고 공백·기호 제거. 쓸 수 없으면 null */
export function cleanHashtag(raw: string): string | null {
  const t = raw.trim().replace(/^#+/, "").replace(/[\s#]/g, "");
  if (!t || t.length > 40 || !/^[\p{L}\p{N}_]+$/u.test(t)) return null;
  return `#${t}`;
}

/** X 에서 그 태그의 이미지 게시물 보기 (로그인한 사람만 결과가 보임) */
export const xTagSearchUrl = (tag: string) => `https://x.com/search?q=${encodeURIComponent(tag)}&f=media`;
