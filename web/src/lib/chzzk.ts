import type { LiveStream, Platform } from "@/types";
import { isVtuber } from "@/lib/vtuber-registry";

// 치지직 비공식 공개 API (인증 불필요). 지금 방송 중인 라이브 목록.
// ⚠️ 비공식이라 예고 없이 변경/차단될 수 있음 → 실패 시 호출부에서 폴백 처리.
const CHZZK_LIVES_URL =
  "https://api.chzzk.naver.com/service/v1/home/lives?size=50";

interface ChzzkLive {
  liveTitle: string;
  liveImageUrl: string | null;
  concurrentUserCount: number;
  openDate: string; // "2026-07-14 13:03:14" (KST)
  tags: string[] | null;
  liveCategoryValue: string | null;
  channel: {
    channelId: string;
    channelName: string;
    channelImageUrl: string | null;
  };
}

function toThumbUrl(raw: string | null): string | null {
  if (!raw) return null;
  return raw.includes("{type}") ? raw.replace("{type}", "480") : raw;
}

function kstToISO(s: string): string {
  // "2026-07-14 13:03:14" (KST, tz 없음) → ISO
  return new Date(s.replace(" ", "T") + "+09:00").toISOString();
}

/** 치지직에서 현재 방송 중인 (버튜버 추정) 라이브 목록을 가져온다. */
export async function fetchChzzkLives(): Promise<LiveStream[]> {
  const res = await fetch(CHZZK_LIVES_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    cache: "no-store", // 실시간이라 캐시하지 않음
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
    .map<LiveStream>((l) => ({
      id: `chzzk-${l.channel.channelId}`,
      vtuberId: l.channel.channelId,
      vtuberName: l.channel.channelName,
      platform: "chzzk" as Platform,
      title: l.liveTitle,
      category: l.liveCategoryValue,
      viewers: l.concurrentUserCount,
      startedAt: kstToISO(l.openDate),
      thumbnailUrl: toThumbUrl(l.liveImageUrl),
      channelUrl: `https://chzzk.naver.com/live/${l.channel.channelId}`,
      tags: [],
    }))
    .sort((a, b) => b.viewers - a.viewers);
}
