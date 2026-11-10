// 버튜버 주 채널(치지직·SOOP)의 채널 정보에 걸린 유튜브 링크 → 공식 채널 후보.
//  치지직: /service/v1/channels/{id}/data?fields=socialLinks  ([{ title, landingUrl }])
//  SOOP:   api-channel.sooplive.co.kr/v1.1/channel/{id}/station  (.link [{ linkName, url }])
// 다시보기·클립 채널, 소속사 채널이 같이 걸려 있는 경우가 많아 점수로 고르고, 애매하면 운영자에게 넘긴다.
import type { Platform } from "../domain";
import type { LinkCandidate } from "./store";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TIMEOUT_MS = 8000;

export interface RawLink {
  label: string;
  url: string;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** 채널 정보의 외부 링크. 실패하면 throw (다음에 다시 확인) */
export async function fetchSocialLinks(platform: Platform, channelId: string): Promise<RawLink[]> {
  if (platform === "chzzk") {
    const j = (await getJson(
      `https://api.chzzk.naver.com/service/v1/channels/${encodeURIComponent(channelId)}/data?fields=socialLinks`,
    )) as { code?: number; content?: { socialLinks?: { title?: string; landingUrl?: string }[] } };
    if (j.code !== 200) throw new Error(`chzzk code ${j.code}`);
    return (j.content?.socialLinks ?? [])
      .filter((l) => typeof l.landingUrl === "string")
      .map((l) => ({ label: l.title ?? "", url: l.landingUrl! }));
  }
  if (platform === "soop") {
    const j = (await getJson(
      `https://api-channel.sooplive.co.kr/v1.1/channel/${encodeURIComponent(channelId)}/station`,
      { Referer: "https://www.sooplive.co.kr/" },
    )) as { station?: unknown; link?: { linkName?: string; url?: string }[] };
    if (!j.station) throw new Error("soop station 없음");
    return (j.link ?? [])
      .filter((l) => typeof l.url === "string")
      .map((l) => ({ label: l.linkName ?? "", url: l.url! }));
  }
  return [];
}

export interface YoutubeTarget {
  /** UC… */
  ytChannelId: string | null;
  /** @handle */
  handle: string | null;
  /** 레거시 /user/ 이름 (API forUsername 으로만 변환) · /c/ 맞춤 주소 — 자동 변환하지 않음 */
  legacy: string | null;
  url: string;
}

/** 유튜브 채널 주소 해석. 영상·재생목록 주소는 채널이 아니므로 null */
export function parseYoutubeChannelUrl(raw: string): YoutubeTarget | null {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^(?!https?:\/\/)/i, "https://"));
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  if (host !== "youtube.com") return null;
  const parts = u.pathname.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const first = parts[0] ?? "";
  if (first.startsWith("@") && first.length > 1) {
    return { ytChannelId: null, handle: first, legacy: null, url: `https://www.youtube.com/${first}` };
  }
  if (first === "channel" && /^UC[\w-]{22}$/.test(parts[1] ?? "")) {
    return { ytChannelId: parts[1]!, handle: null, legacy: null, url: `https://www.youtube.com/channel/${parts[1]}` };
  }
  if ((first === "c" || first === "user") && parts[1]) {
    return { ytChannelId: null, handle: null, legacy: `${first}/${parts[1]}`, url: `https://www.youtube.com/${first}/${parts[1]}` };
  }
  return null;
}

/** 다시보기·클립 같은 보조 채널을 가리키는 말 */
const SECONDARY = /다시\s*보기|replay|re-?play|vod|풀\s*(영상|버전|방송)|아카이브|archive|클립|clip|키리누키|kirinuki|하이라이트|highlight|편집|저장소|박제|서브|sub\b|2nd|세컨|music|노래|음악|cover|shorts|쇼츠/i;
/** 주 채널을 가리키는 말 */
const PRIMARY = /메인|main|공식|official|본\s*채널/i;
/** 링크 이름에서 유튜브를 가리키는 말·장식 (이것만 남으면 '그냥 유튜브' 링크) */
const GENERIC = /youtube|유튜브|유투브|채널|channel|[\s\p{P}\p{S}☁]/giu;

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 후보 점수. 높을수록 주 채널 */
export function scoreCandidate(label: string, target: YoutubeTarget, vtuberName: string): number {
  const name = norm(vtuberName);
  // 버튜버 이름 자체에 든 말("아리수 아카이브")은 보조 채널 표시로 보지 않는다
  const flat = norm(`${label} ${target.handle ?? ""} ${target.legacy ?? ""}`);
  let score = 0;
  if (SECONDARY.test(name.length >= 2 ? flat.replaceAll(name, " ") : flat)) score -= 5;
  if (PRIMARY.test(label) || /official/i.test(target.handle ?? "")) score += 2;
  const rest = norm(label.replace(GENERIC, ""));
  if (name.length >= 2 && norm(label).includes(name)) score += 2;
  else if (rest.length === 0) score += 1; // "유튜브", "☁ YouTube" 처럼 이름 없이 유튜브만
  else score -= 1; // 다른 이름(소속사·다른 멤버)이 붙은 링크
  if (target.legacy) score -= 1; // 변환이 어려운 예전 주소
  return score;
}

export interface Pick {
  candidates: LinkCandidate[];
  /** 고른 후보 (없으면 운영자 판단 필요 또는 링크 없음) */
  chosen: LinkCandidate | null;
  /** 못 고른 이유 */
  reason: "nolink" | "ambiguous" | "secondary_only" | null;
}

/** 링크 목록에서 유튜브 후보를 모아 하나를 고른다 */
export function pickYoutube(links: (RawLink & { from: string })[], vtuberName: string): Pick {
  const byKey = new Map<string, LinkCandidate>();
  for (const l of links) {
    const t = parseYoutubeChannelUrl(l.url);
    if (!t) continue;
    const key = (t.ytChannelId ?? t.handle ?? t.legacy ?? t.url).toLowerCase();
    const score = scoreCandidate(l.label, t, vtuberName);
    const prev = byKey.get(key);
    // 같은 채널이 여러 번 걸려 있으면 점수가 높은 쪽 이름으로
    if (!prev || score > prev.score) {
      byKey.set(key, { url: t.url, label: l.label, ytChannelId: t.ytChannelId, handle: t.handle, score, from: l.from });
    }
  }
  const candidates = [...byKey.values()].sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return { candidates, chosen: null, reason: "nolink" };
  const [top, second] = candidates;
  if (top!.score <= -3) return { candidates, chosen: null, reason: "secondary_only" };
  if (second && second.score >= top!.score) return { candidates, chosen: null, reason: "ambiguous" };
  return { candidates, chosen: top!, reason: null };
}
