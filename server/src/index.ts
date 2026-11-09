import { config } from "./config";
import { startScheduler } from "./scheduler";
import { buildApi } from "./api";
import { SqliteStore } from "./store/sqlite";
import { MemoryStore } from "./store/memory";
import { PostgresStore } from "./store/postgres";
import type { Store } from "./store/types";
import { log } from "./log";
import { startAiJobs } from "./issues/scheduler";
import { migrateUserDb, userDbEnabled } from "./userdb/db";
import { buildAgencyRoster, loadRosterSeed } from "./tags/roster";
import { setAgencyRoster } from "./tags/catalog";

function makeStore(): Store {
  switch (config.storeKind) {
    case "postgres":
      return new PostgresStore();
    case "memory":
      return new MemoryStore();
    default:
      return new SqliteStore(config.dbPath);
  }
}

const store = makeStore();

// 기간 랭킹용 일별 집계가 비어 있으면 남은 스냅샷으로 한 번 채움 (처음 배포 시)
if (store instanceof SqliteStore) {
  const pollMin = config.pollIntervalMs / 60_000;
  const n = store.backfillDailyStats(pollMin, pollMin * 2);
  if (n > 0) log.info(`일별 집계 백필: 스냅샷 ${n}사이클 반영`);
  const b = store.backfillBroadcastTags();
  if (b > 0) log.info(`방송별 태그 백필: ${b}개 방송`);

  // 소속사 명단: 방송 기록에서 꾸준히 소속사 태그를 단 채널 + 웹 데뷔 소식의 소속사 + 미리 계산한 명단 (30분마다 갱신)
  const rosterSeed = loadRosterSeed();
  const refreshRoster = (s: SqliteStore) => {
    const debutAgencies = s
      .listDebutReports()
      .filter((r) => r.channelId && r.agency)
      .map((r) => ({ channelId: r.channelId as string, agency: r.agency as string }));
    const roster = buildAgencyRoster(s.listBroadcastTags(90), debutAgencies, rosterSeed);
    setAgencyRoster(roster);
    return roster.size;
  };
  log.info(`소속사 명단: ${refreshRoster(store)}개 채널`);
  setInterval(() => refreshRoster(store), 30 * 60_000);
}

// 사용자 DB 스키마 적용 (실패해도 방송 수집·공개 API 는 계속 동작)
if (userDbEnabled()) {
  try {
    await migrateUserDb();
    log.info("사용자 DB 연결됨");
  } catch (e) {
    log.error(`사용자 DB 준비 실패: ${String(e)}`);
  }
}

// REST API (읽기 라우트는 SqliteStore 기준)
if (store instanceof SqliteStore) {
  const app = buildApi(store);
  await app.listen({ port: config.apiPort, host: "0.0.0.0" });
  log.info(
    `API http://localhost:${config.apiPort}  (/health, /api/lives, /api/debuts, /api/issues)`,
  );
  // Claude 자동 수집 — 이슈 3시간 · 신규 데뷔 6시간 (ISSUES_ENABLED=1 일 때만)
  startAiJobs(store);
}

// 수집 스케줄러
await startScheduler(store);
