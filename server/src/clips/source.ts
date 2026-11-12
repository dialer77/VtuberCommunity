// 키리누키의 원본 방송 링크 — 클립 설명(RSS)에 흔히 적힌 다시보기 주소를 뽑는다.
// 같은 원본 방송에서 나온 다른 클립을 묶고(source_key), 원본 다시보기로 안내하는 데 쓴다.
// 채널 첫 화면 주소(치지직 채널·SOOP 방송국)는 특정 방송이 아니라서 넣지 않는다.

export interface SourceLink {
  url: string;
  /** 같은 방송이면 같은 값: chzzk:video:<번호> · soop:vod:<번호> · youtube:<영상 ID> */
  key: string;
  platform: "chzzk" | "soop" | "youtube";
}

const PATTERNS: { re: RegExp; make: (m: RegExpMatchArray) => SourceLink }[] = [
  {
    re: /https?:\/\/(?:m\.)?chzzk\.naver\.com\/video\/(\d+)/g,
    make: (m) => ({ url: `https://chzzk.naver.com/video/${m[1]}`, key: `chzzk:video:${m[1]}`, platform: "chzzk" }),
  },
  {
    re: /https?:\/\/vod\.(?:sooplive\.co\.kr|afreecatv\.com)\/(?:player\/|PLAYER\/STATION\/)?(\d+)/gi,
    make: (m) => ({ url: `https://vod.sooplive.co.kr/player/${m[1]}`, key: `soop:vod:${m[1]}`, platform: "soop" }),
  },
  {
    re: /https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|live\/)([\w-]{11})/g,
    make: (m) => ({ url: `https://www.youtube.com/watch?v=${m[1]}`, key: `youtube:${m[1]}`, platform: "youtube" }),
  },
  {
    re: /https?:\/\/youtu\.be\/([\w-]{11})/g,
    make: (m) => ({ url: `https://www.youtube.com/watch?v=${m[1]}`, key: `youtube:${m[1]}`, platform: "youtube" }),
  },
];

/** 설명에서 특정 방송·영상 링크를 순서대로 (중복·자기 자신 제외, 최대 max 개) */
export function extractSourceLinks(text: string | null, selfVideoId: string, max = 5): SourceLink[] {
  if (!text) return [];
  const found: { at: number; link: SourceLink }[] = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) found.push({ at: m.index ?? 0, link: p.make(m) });
  }
  const out: SourceLink[] = [];
  for (const { link } of found.sort((a, b) => a.at - b.at)) {
    if (link.key === `youtube:${selfVideoId}`) continue;
    if (out.some((l) => l.key === link.key)) continue;
    out.push(link);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 원본 방송 고르기: Claude 가 고른 번호(1부터) → 없으면, 치지직·SOOP 다시보기가 딱 하나뿐일 때 그것
 * (키리누키 설명의 치지직·SOOP 다시보기 링크는 거의 항상 원본이다. 유튜브 링크는 다른 클립일 수 있어 자동으로는 안 고른다)
 */
export function pickSource(links: SourceLink[], chosen: number | undefined): SourceLink | null {
  if (chosen && chosen >= 1 && chosen <= links.length) return links[chosen - 1]!;
  const vods = links.filter((l) => l.platform !== "youtube");
  return vods.length === 1 ? vods[0]! : null;
}

/** 'YYYY-MM-DD' 형식이고 그럴듯한 날짜만 (미래·너무 오래된 날짜는 버림) */
export function cleanSourceDate(raw: string | undefined, publishedAt: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((raw ?? "").trim());
  if (!m) return null;
  const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
  if (!Number.isFinite(t)) return null;
  const pub = Date.parse(publishedAt);
  // 원본 방송은 클립보다 앞이고, 3년 넘게 전 방송은 날짜를 잘못 읽었을 가능성이 크다
  if (t > pub + 86_400_000 || t < pub - 3 * 365 * 86_400_000) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
