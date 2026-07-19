import type { Collector } from "./types";
import type { RawLive } from "../domain";
import { isVtuber } from "../vtuber";
import { config } from "../config";

// 치지직 비공식 공개 API (인증 불필요).
// ⚠️ 비공식이라 예고 없이 변경/차단될 수 있음 → 실패 시 해당 사이클만 건너뜀.
//
// 치지직에는 SOOP의 "버추얼" 같은 버튜버 카테고리가 없어서, 전체 라이브를
// 커서 페이징으로 훑고 버튜버 판정으로 걸러낸다.
// (home/lives 는 상위 50개 상한 + 페이징 불가라 커버리지가 크게 떨어짐)
const CHZZK_LIVES_URL = "https://api.chzzk.naver.com/service/v1/lives";
const PAGE_SIZE = 50;

interface ChzzkLive {
  liveId: number;
  liveTitle: string;
  liveImageUrl: string | null;
  concurrentUserCount: number;
  openDate: string; // "2026-07-14 13:03:14" (KST)
  tags: string[] | null;
  liveCategoryValue: string | null;
  channel: { channelId: string; channelName: string };
}

interface ChzzkCursor {
  concurrentUserCount: number;
  liveId: number;
}

export class ChzzkCollector implements Collector {
  readonly platform = "chzzk" as const;

  async fetchLives(): Promise<RawLive[]> {
    const out: RawLive[] = [];
    let url = `${CHZZK_LIVES_URL}?size=${PAGE_SIZE}`;

    for (let page = 0; page < config.chzzkPages; page++) {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      if (!res.ok) throw new Error(`CHZZK API ${res.status}`);

      const json = await res.json();
      const content = json?.content ?? {};
      const list: ChzzkLive[] = content.data ?? [];
      if (list.length === 0) break;

      for (const l of list) {
        if (
          isVtuber({
            channelId: l.channel.channelId,
            title: l.liveTitle,
            tags: l.tags ?? [],
          })
        ) {
          out.push({
            channelId: l.channel.channelId,
            channelName: l.channel.channelName,
            title: l.liveTitle,
            category: l.liveCategoryValue,
            viewers: l.concurrentUserCount,
            startedAt: kstToISO(l.openDate),
            thumbnailUrl: toThumbUrl(l.liveImageUrl),
            tags: l.tags ?? [],
          });
        }
      }

      const next: ChzzkCursor | null = content.page?.next ?? null;
      if (!next) break;
      url =
        `${CHZZK_LIVES_URL}?size=${PAGE_SIZE}` +
        `&concurrentUserCount=${next.concurrentUserCount}&liveId=${next.liveId}`;
    }

    return out;
  }
}

function kstToISO(s: string): string {
  return new Date(s.replace(" ", "T") + "+09:00").toISOString();
}

function toThumbUrl(raw: string | null): string | null {
  if (!raw) return null;
  return raw.includes("{type}") ? raw.replace("{type}", "480") : raw;
}
