// 버튜버 확정 목록(registry)의 채널을 채널 단위로 직접 조회한다.
// 치지직은 시청자 상위 N페이지만 훑기 때문에 시청자가 적은 채널(특히 막 데뷔한 채널)은 순위 밖이라 안 보이고,
// SOOP 은 '버추얼' 카테고리만 보기 때문에 다른 카테고리로 켜면 놓친다 → 확정된 채널은 따로 확인.
import type { RawLive, Platform } from "../domain";
import type { RegistryEntry } from "../store/sqlite";
import { log } from "../log";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_PER_CYCLE = 150;
const CONCURRENCY = 6;
const TIMEOUT_MS = 8000;

function kstToISO(s: string): string {
  return new Date(s.replace(" ", "T") + "+09:00").toISOString();
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function chzzkLive(e: RegistryEntry): Promise<RawLive | null> {
  const j = (await getJson(`https://api.chzzk.naver.com/service/v3/channels/${e.channelId}/live-detail`)) as {
    content?: {
      status?: string;
      liveTitle?: string;
      liveCategoryValue?: string | null;
      concurrentUserCount?: number;
      openDate?: string;
      liveImageUrl?: string | null;
      tags?: string[] | null;
      channel?: { channelName?: string };
    };
  };
  const c = j.content;
  if (!c || c.status !== "OPEN") return null;
  return {
    channelId: e.channelId,
    channelName: c.channel?.channelName ?? e.name,
    title: c.liveTitle ?? "",
    category: c.liveCategoryValue ?? null,
    viewers: Number(c.concurrentUserCount ?? 0),
    startedAt: c.openDate ? kstToISO(c.openDate) : new Date().toISOString(),
    thumbnailUrl: c.liveImageUrl ? c.liveImageUrl.replace("{type}", "480") : null,
    tags: c.tags ?? [],
  };
}

async function soopLive(e: RegistryEntry): Promise<RawLive | null> {
  const j = (await getJson(`https://chapi.sooplive.co.kr/api/${encodeURIComponent(e.channelId)}/station`, {
    Referer: "https://www.sooplive.co.kr/",
  })) as {
    broad?: { broad_no?: number; broad_title?: string; current_sum_viewer?: number } | null;
    station?: { user_nick?: string; broad_start?: string };
  };
  const b = j.broad;
  if (!b || !b.broad_no) return null;
  return {
    channelId: e.channelId,
    channelName: j.station?.user_nick ?? e.name,
    title: b.broad_title ?? "",
    category: null,
    viewers: Number(b.current_sum_viewer ?? 0),
    startedAt: j.station?.broad_start ? kstToISO(j.station.broad_start) : new Date().toISOString(),
    thumbnailUrl: `https://liveimg.sooplive.co.kr/m/${b.broad_no}`,
    tags: [],
  };
}

/**
 * 이번 사이클 목록에 없던(seen 에 없는) 확정 채널만 직접 조회해 방송 중인 것을 돌려준다.
 * 유튜브는 대상 아님 — 공식 채널 라이브는 src/youtube/sync.ts 가 따로 확인.
 */
export async function fetchRegistryLives(
  entries: RegistryEntry[],
  seen: Set<string>,
): Promise<{ platform: Platform; live: RawLive }[]> {
  const targets = entries
    .filter((e) => (e.platform === "chzzk" || e.platform === "soop") && !seen.has(e.channelId))
    .slice(0, MAX_PER_CYCLE);
  const out: { platform: Platform; live: RawLive }[] = [];
  let failed = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const res = await Promise.allSettled(batch.map((e) => (e.platform === "chzzk" ? chzzkLive(e) : soopLive(e))));
    res.forEach((r, k) => {
      if (r.status === "fulfilled") {
        if (r.value) out.push({ platform: batch[k]!.platform, live: r.value });
      } else {
        failed++;
      }
    });
  }
  if (failed > 0) log.info(`  확정 채널 직접 확인 실패 ${failed}/${targets.length}`);
  return out;
}
