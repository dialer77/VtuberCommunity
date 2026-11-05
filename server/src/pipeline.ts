import { collectors } from "./collectors";
import { fetchRegistryLives } from "./collectors/registry";
import { setRegistryAllowlist } from "./vtuber";
import { debutCandidates, hasDebutSignal } from "./detect/debut";
import type { Store } from "./store/types";
import type { LiveSnapshot } from "./domain";
import { config } from "./config";
import { log } from "./log";

// 직전 사이클 시각 — 이번 사이클이 대표하는 시간(분)을 계산 (일별 집계용)
let lastCycleMs = 0;

/** 한 번의 폴링 사이클: COLLECT → NORMALIZE → STORE → DETECT */
export async function runCycle(store: Store, cycle: number): Promise<void> {
  const collectedAt = new Date().toISOString();

  // 0. 버튜버 확정 목록 갱신 (태그가 없어도 버튜버로 인정)
  const registry = store.listRegistry?.() ?? [];
  setRegistryAllowlist(registry.map((r) => r.channelId));

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

  // 1-1. 확정 채널 중 이번 목록에 없던 채널은 직접 확인 (순위 밖·다른 카테고리)
  if (registry.length > 0) {
    const seen = new Set(snapshots.map((s) => s.channelId));
    const extra = await fetchRegistryLives(registry, seen);
    for (const x of extra) snapshots.push({ ...x.live, platform: x.platform, collectedAt });
    if (extra.length > 0) log.info(`  확정 채널 직접 확인으로 ${extra.length}건 추가`);
  }

  // 3. STORE — 시계열 저장
  await store.saveSnapshots(snapshots);

  // 3-1. 일별 집계 (기간 랭킹). 사이클 간격은 실제 경과 시간, 단 수집이 멈췄던 구간은 부풀리지 않게 상한
  const nowMs = Date.parse(collectedAt);
  const pollMin = config.pollIntervalMs / 60_000;
  const minutes = lastCycleMs ? Math.min((nowMs - lastCycleMs) / 60_000, pollMin * 2) : pollMin;
  lastCycleMs = nowMs;
  store.recordDailyStats?.(snapshots, minutes);
  store.recordBroadcastTags?.(snapshots);

  // 4. DETECT — 신규 채널(first-seen) = 데뷔 후보
  const newly = await store.markNewChannels(snapshots);
  const debuts = debutCandidates(newly);

  const totalViewers = snapshots.reduce((s, x) => s + x.viewers, 0);
  log.info(
    `#${cycle} 수집 ${snapshots.length}건 · 시청자 ${totalViewers.toLocaleString("ko-KR")} · 신규채널 ${newly.length}`,
  );
  for (const d of debuts) {
    const mark = hasDebutSignal(d.title) ? "🎀 데뷔 방송" : "🆕 신규 채널";
    log.event(`  ${mark}: ${d.channelName} (${d.platform}) — "${d.title}"`);
  }

  // 5. PRUNE — 보존 기간 초과 스냅샷 정리 (DB 무한 증가 방지)
  if (store.pruneOldSnapshots) {
    const removed = await store.pruneOldSnapshots(config.retentionDays);
    if (removed > 0) {
      log.info(`  오래된 스냅샷 ${removed}건 정리 (보존 ${config.retentionDays}일)`);
    }
  }
}
