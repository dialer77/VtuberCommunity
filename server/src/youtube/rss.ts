// 유튜브 채널 RSS (youtube.com/feeds/videos.xml?channel_id=…) — 할당량을 쓰지 않는 최신 영상 15개.
// 제목·게시 시각·영상 ID 만 쓴다. (설명·조회수는 저장하지 않음)

const TIMEOUT_MS = 10_000;

export interface FeedEntry {
  videoId: string;
  title: string;
  publishedAt: string;
}

export interface Feed {
  title: string | null;
  entries: FeedEntry[];
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decodeXml(m[1]!.trim()) : null;
}

export function parseFeed(xml: string): Feed {
  const head = xml.split("<entry>")[0] ?? "";
  const entries: FeedEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]!;
    const videoId = tag(e, "yt:videoId");
    const title = tag(e, "title");
    const published = tag(e, "published");
    if (!videoId || !/^[\w-]{11}$/.test(videoId) || !published || Number.isNaN(Date.parse(published))) continue;
    entries.push({ videoId, title: title ?? "", publishedAt: new Date(published).toISOString() });
  }
  return { title: tag(head, "title"), entries };
}

/** RSS 받기. 채널이 없거나(404) 실패하면 null */
export async function fetchFeed(ytChannelId: string): Promise<Feed | null> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ytChannelId)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; VMOA/1.0; +https://vmoa.live)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const xml = await res.text();
  if (!xml.includes("<feed")) return null;
  return parseFeed(xml);
}
