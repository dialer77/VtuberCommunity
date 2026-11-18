// 치지직·SOOP 채널 소개 링크 받기 — 10분마다 25명 (상위 400명·방송 중·확정 목록, 7일마다 다시).
// 유튜브 매핑(youtube/sync.ts)이 같은 링크를 받을 때도 여기 저장하므로 겹쳐 받지 않는다.
import type { SqliteStore } from "../store/sqlite";
import { fetchSocialLinks } from "../youtube/links";
import { mappingTargets } from "../youtube/sync";
import { config } from "../config";
import { log } from "../log";

const EVERY_MS = 10 * 60_000;
const PER_RUN = 25;

export async function runPlatformLinks(store: SqliteStore, limit = PER_RUN): Promise<{ fetched: number; failed: number }> {
  const due = mappingTargets(store, 400).filter((t) => store.social.platformLinksDue(t.platform, t.channelId)).slice(0, limit);
  let failed = 0;
  for (const t of due) {
    try {
      store.social.savePlatformLinks(t.platform, t.channelId, await fetchSocialLinks(t.platform, t.channelId));
    } catch {
      failed++;
      store.social.savePlatformLinks(t.platform, t.channelId, null);
    }
  }
  return { fetched: due.length, failed };
}

/** 서버 시작 시. SOCIAL_SYNC=0 이면 끔 (공개 채널 정보만 읽음 — 키·설정 필요 없음) */
export function startSocialSync(store: SqliteStore): void {
  if (!config.socialSync) {
    log.info("SNS 링크 받기 꺼짐 (SOCIAL_SYNC=0)");
    return;
  }
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await runPlatformLinks(store);
      if (r.fetched > 0 && r.failed > 0) log.info(`SNS 링크: ${r.fetched}명 확인 · 실패 ${r.failed}`);
    } catch (e) {
      log.error(`SNS 링크 받기 실패: ${String(e)}`);
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), EVERY_MS);
  // 수집 스케줄러 첫 사이클(채널·랭킹)이 끝난 뒤
  setTimeout(() => void tick(), 90_000);
}
