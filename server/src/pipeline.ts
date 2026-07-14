import { collectors } from "./collectors";
import { debutCandidates } from "./detect/debut";
import type { Store } from "./store/types";
import type { LiveSnapshot } from "./domain";
import { log } from "./log";

/** 한 번의 폴링 사이클: COLLECT → NORMALIZE → STORE → DETECT */
export async function runCycle(store: Store, cycle: number): Promise<void> {
  const collectedAt = new Date().toISOString();

  // 1. COLLECT — 모든 수집기에서 병렬 수집 (하나 실패해도 나머지는 진행)
  const results = await Promise.allSettled(
    collectors.map(async (c) => {
      const raw = await c.fetchLives();
      // 2. NORMALIZE — 공통 스키마(LiveSnapshot)로 변환
      return raw.map<LiveSnapshot>((r) => ({
        ...r,
        platform: c.platform,
        collectedAt,
      }));
    }),
  );

  const snapshots: LiveSnapshot[] = [];
  results.forEach((res, i) => {
    if (res.status === "fulfilled") {
      snapshots.push(...res.value);
    } else {
      log.error(`수집 실패 [${collectors[i]?.platform}]: ${res.reason}`);
    }
  });

  // 3. STORE — 시계열 저장
  await store.saveSnapshots(snapshots);

  // 4. DETECT — 신규 채널(first-seen) = 데뷔 후보
  const newly = await store.markNewChannels(snapshots);
  const debuts = debutCandidates(newly);

  const totalViewers = snapshots.reduce((s, x) => s + x.viewers, 0);
  log.info(
    `#${cycle} 수집 ${snapshots.length}건 · 시청자 ${totalViewers.toLocaleString("ko-KR")} · 신규채널 ${newly.length}`,
  );
  for (const d of debuts) {
    log.event(`  🎉 데뷔 후보: ${d.channelName} (${d.platform}) — "${d.title}"`);
  }
}
