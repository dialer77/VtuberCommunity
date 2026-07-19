import type { Collector } from "./types";
import type { RawLive } from "../domain";

// SOOP(숲) 수집기 — 비공식 검색 API로 "버추얼" 카테고리 라이브를 조회.
// 반환 항목이 전부 broad_cate_name="버추얼" 이므로 카테고리가 곧 버튜버 필터다.
// ⚠️ 비공식이라 예고 없이 변경/차단될 수 있음 → 실패 시 해당 사이클만 건너뜀.
const SOOP_SEARCH_URL =
  "https://sch.sooplive.co.kr/api.php?m=liveSearch&v=1.0&szKeyword=" +
  encodeURIComponent("버추얼") +
  "&szOrder=view&nPageNo=1&nListCnt=60";

interface SoopBroad {
  user_id: string;
  user_nick: string;
  broad_title: string;
  broad_no: string;
  total_view_cnt: string | number;
  broad_cate_name: string | null;
  broad_start: string; // "2026-07-14 18:33:01" (KST)
  broad_img: string | null;
  hash_tags?: unknown;
  af_tags?: unknown;
}

/** SOOP 태그 필드는 배열 또는 콤마 문자열로 올 수 있어 방어적으로 정규화 */
function toTagArray(...sources: unknown[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    if (Array.isArray(s)) {
      for (const x of s) if (typeof x === "string" && x) out.push(x);
    } else if (typeof s === "string" && s) {
      out.push(...s.split(",").map((t) => t.trim()).filter(Boolean));
    }
  }
  return [...new Set(out)];
}

export class SoopCollector implements Collector {
  readonly platform = "soop" as const;

  async fetchLives(): Promise<RawLive[]> {
    const res = await fetch(SOOP_SEARCH_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) throw new Error(`SOOP API ${res.status}`);

    const json = await res.json();
    const list: SoopBroad[] = json?.REAL_BROAD ?? [];

    return list
      .filter((b) => (b.broad_cate_name ?? "").includes("버추얼"))
      .map<RawLive>((b) => ({
        channelId: b.user_id,
        channelName: b.user_nick,
        title: b.broad_title,
        category: b.broad_cate_name ?? null,
        viewers: Number(b.total_view_cnt) || 0,
        startedAt: kstToISO(b.broad_start),
        thumbnailUrl: b.broad_img || null,
        tags: toTagArray(b.hash_tags, b.af_tags),
      }));
  }
}

function kstToISO(s: string): string {
  return new Date(s.replace(" ", "T") + "+09:00").toISOString();
}
