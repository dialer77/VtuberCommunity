import type { Collector } from "./types";
import type { RawLive } from "../domain";
import { isVtuber } from "../vtuber";

// 치지직 비공식 공개 API (인증 불필요). 현재 방송 중인 라이브 목록.
// ⚠️ 비공식이라 예고 없이 변경/차단될 수 있음 → 실패 시 파이프라인이 해당 사이클만 건너뜀.
const CHZZK_LIVES_URL =
  "https://api.chzzk.naver.com/service/v1/home/lives?size=50";

interface ChzzkLive {
  liveTitle: string;
  concurrentUserCount: number;
  openDate: string; // "2026-07-14 13:03:14" (KST)
  tags: string[] | null;
  liveCategoryValue: string | null;
  channel: { channelId: string; channelName: string };
}

export class ChzzkCollector implements Collector {
  readonly platform = "chzzk" as const;

  async fetchLives(): Promise<RawLive[]> {
    const res = await fetch(CHZZK_LIVES_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) throw new Error(`CHZZK API ${res.status}`);

    const json = await res.json();
    const list: ChzzkLive[] = json?.content?.streamingLiveList ?? [];

    return list
      .filter((l) =>
        isVtuber({
          channelId: l.channel.channelId,
          title: l.liveTitle,
          tags: l.tags ?? [],
        }),
      )
      .map<RawLive>((l) => ({
        channelId: l.channel.channelId,
        channelName: l.channel.channelName,
        title: l.liveTitle,
        category: l.liveCategoryValue,
        viewers: l.concurrentUserCount,
        startedAt: kstToISO(l.openDate),
      }));
  }
}

function kstToISO(s: string): string {
  return new Date(s.replace(" ", "T") + "+09:00").toISOString();
}
