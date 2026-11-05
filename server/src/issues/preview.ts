// 출처 URL 의 미리보기 정보(Open Graph) 수집. 화면에서 기사 카드·영상 임베드로 보여주기 위함.
import type { IssueSource } from "../store/sqlite";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 1_500_000;

/** 유튜브 영상 ID 추출 (watch / youtu.be / shorts / live / embed) */
export function youtubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/);
    if (m?.[2]) return m[2];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // <meta property="og:title" content="..."> 또는 content 가 앞에 오는 형태 모두.
    // 값 안에 다른 종류의 따옴표가 있어도 잘리지 않게, 여는 따옴표와 같은 따옴표까지 읽는다.
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*?content=(["'])(.*?)\\1`,
      "i",
    );
    const re2 = new RegExp(
      `<meta[^>]+content=(["'])(.*?)\\1[^>]*?(?:property|name)=["']${key}["']`,
      "i",
    );
    const m = html.match(re1) ?? html.match(re2);
    const v = m?.[2]?.trim();
    if (v) return decodeEntities(v);
  }
  return null;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", Accept: "text/html,*/*" },
    });
    const ctype = res.headers.get("content-type") ?? "";
    if (!res.ok || !ctype.includes("html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      // 메타 태그는 <head> 안에 있으므로 </head> 를 지나면 그만 읽는다
      if (Buffer.from(value).toString("latin1").toLowerCase().includes("</head>")) break;
    }
    reader.cancel().catch(() => {});
    const bytes = Buffer.concat(chunks);
    // 문자셋: 응답 헤더 → <meta charset> → utf-8 (일부 국내 언론사는 아직 euc-kr)
    const sniff = bytes.toString("latin1");
    const charset = (
      ctype.match(/charset=([\w-]+)/i)?.[1] ??
      sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
      "utf-8"
    ).toLowerCase();
    let html: string;
    try {
      html = new TextDecoder(charset).decode(bytes);
    } catch {
      html = new TextDecoder("utf-8").decode(bytes);
    }
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** LLM 이 준 출처 정보에 실제 페이지의 미리보기 메타데이터를 덧붙인다. 실패해도 기본값으로 돌려준다. */
export async function enrichSource(
  base: { url: string; title: string; publisher?: string | null; publishedAt?: string | null },
  timeoutMs = 8000,
): Promise<IssueSource> {
  const yt = youtubeId(base.url);
  const src: IssueSource = {
    url: base.url,
    title: base.title,
    publisher: base.publisher ?? null,
    description: null,
    imageUrl: yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null,
    publishedAt: base.publishedAt ?? null,
    kind: yt ? "youtube" : "link",
    embedId: yt,
  };
  const page = await fetchHtml(base.url, timeoutMs);
  if (!page) return src;
  const { html } = page;
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const title = meta(html, ["og:title", "twitter:title"]) ?? (titleTag ? decodeEntities(titleTag) : null);
  // 기사는 링크·출처로만 쓴다 — 대표 이미지(보도사진)와 요약문은 저장·표시하지 않음 (저작권 분쟁 방지).
  // 유튜브는 공식 썸네일(i.ytimg.com)과 임베드 재생이 약관상 허용되므로 그대로.
  return {
    ...src,
    title: title || src.title,
    publisher: meta(html, ["og:site_name", "application-name"]) ?? src.publisher,
    description: null,
    imageUrl: src.imageUrl,
    publishedAt:
      meta(html, ["article:published_time", "og:article:published_time", "pubdate", "date"]) ?? src.publishedAt,
  };
}
