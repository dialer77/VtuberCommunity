// 프로필의 SNS·커뮤니티·팬아트 태그 — 채널 소개 링크 + 웹 수집 + 정해진 주소(유튜브·치지직 커뮤니티)를 합친다.
// 팬아트·게시물 자체는 옮겨 오지 않고 원래 있는 곳으로 연결한다.
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { HashtagKind } from "./store";
import { classifyLink, cleanHashtag, mergeLinks, xTagSearchUrl, type SocialLink } from "./links";

export interface ProfileSocial {
  links: SocialLink[];
  /** 공식 커뮤니티 바로가기 (유튜브 커뮤니티 탭·치지직 커뮤니티) */
  communities: { label: string; url: string }[];
  hashtags: { tag: string; kind: HashtagKind; searchUrl: string }[];
  /** X 타임라인 임베드에 쓸 계정 */
  xHandle: string | null;
  /** 웹 수집·운영자 정보가 있는지 (안내 문구용) */
  fromWeb: boolean;
}

export function socialForProfile(store: SqliteStore, platform: Platform, channelId: string, ytChannelId: string | null): ProfileSocial | null {
  // 프로필 자신의 채널, 이미 연결된 유튜브(공식 영상 탭·유튜브 커뮤니티로 보여 줌)는 링크에서 뺀다
  const own = (l: SocialLink) =>
    !(l.kind === "chzzk" && platform === "chzzk" && l.url.endsWith(`/${channelId}`)) && !(l.kind === "youtube" && ytChannelId);
  const fromPlatform = store.social
    .platformLinks(platform, channelId)
    .map((l) => classifyLink(l.url))
    .filter((l): l is SocialLink => !!l && own(l));
  const web = store.social.web(platform, channelId);
  const fromWeb = (web?.links ?? []).map((u) => classifyLink(u)).filter((l): l is SocialLink => !!l && own(l));
  const links = mergeLinks([fromPlatform, fromWeb]);

  const communities: ProfileSocial["communities"] = [];
  if (ytChannelId) communities.push({ label: "유튜브 커뮤니티", url: `https://www.youtube.com/channel/${ytChannelId}/posts` });
  if (platform === "chzzk") communities.push({ label: "치지직 커뮤니티", url: `https://chzzk.naver.com/${channelId}/community` });
  for (const l of links.filter((x) => x.kind === "fancafe")) communities.push({ label: "팬카페", url: l.url });

  const seen = new Set<string>();
  const hashtags: ProfileSocial["hashtags"] = [];
  for (const h of web?.hashtags ?? []) {
    const tag = cleanHashtag(h.tag);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    hashtags.push({ tag, kind: h.kind, searchUrl: xTagSearchUrl(tag) });
  }
  hashtags.sort((a, b) => (a.kind === "fanart" ? -1 : 0) - (b.kind === "fanart" ? -1 : 0));

  if (links.length === 0 && communities.length === 0 && hashtags.length === 0) return null;
  return {
    links,
    communities,
    hashtags,
    xHandle: links.find((l) => l.kind === "x")?.handle ?? null,
    fromWeb: !!web && (web.links.length > 0 || web.hashtags.length > 0),
  };
}
