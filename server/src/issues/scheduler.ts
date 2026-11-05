// Claude(구독) 작업 스케줄러 — 이슈 수집(3시간) · 신규 데뷔 웹 수집(6시간).
// 마지막 실행 시각을 DB 에 남겨, 배포로 서버가 재시작돼도 주기를 지킨다. 두 작업은 동시에 돌리지 않는다.
import type { SqliteStore } from "../store/sqlite";
import { config } from "../config";
import { collectIssues } from "./collector";
import { collectDebuts } from "../debuts/collector";
import { log } from "../log";

const CHECK_EVERY_MS = 5 * 60_000;
const RETRY_AFTER_FAIL_MS = 30 * 60_000;

interface Job {
  /** app_meta 키 접두사 (issues_last_attempt …) */
  key: string;
  label: string;
  enabled: boolean;
  intervalMs: number;
  run: () => Promise<unknown>;
}

let busy = false;

async function tick(store: SqliteStore, jobs: Job[]): Promise<void> {
  if (busy) return;
  for (const job of jobs) {
    if (!job.enabled) continue;
    const lastAttempt = Date.parse(store.getMeta(`${job.key}_last_attempt`) ?? "") || 0;
    const failed = store.getMeta(`${job.key}_last_status`) === "fail";
    if (Date.now() - lastAttempt < (failed ? RETRY_AFTER_FAIL_MS : job.intervalMs)) continue;

    busy = true;
    store.setMeta(`${job.key}_last_attempt`, new Date().toISOString());
    try {
      const s = await job.run();
      store.setMeta(`${job.key}_last_status`, "ok");
      store.setMeta(`${job.key}_last_result`, JSON.stringify({ at: new Date().toISOString(), ...(s as object) }));
    } catch (e) {
      store.setMeta(`${job.key}_last_status`, "fail");
      store.setMeta(`${job.key}_last_result`, JSON.stringify({ at: new Date().toISOString(), error: String(e) }));
      log.error(`${job.label} 실패: ${String(e)} — ${RETRY_AFTER_FAIL_MS / 60_000}분 뒤 재시도`);
    } finally {
      busy = false;
    }
    return; // 한 번에 한 작업만 (다음 점검 때 다음 작업)
  }
}

export function startAiJobs(store: SqliteStore): void {
  const jobs: Job[] = [
    {
      key: "issues",
      label: "이슈 수집",
      enabled: config.issuesEnabled,
      intervalMs: Math.max(30, config.issuesIntervalMin) * 60_000,
      run: () => collectIssues(store),
    },
    {
      key: "debuts",
      label: "데뷔 소식 수집",
      enabled: config.debutsEnabled,
      intervalMs: Math.max(60, config.debutsIntervalMin) * 60_000,
      run: () => collectDebuts(store),
    },
  ];
  const on = jobs.filter((j) => j.enabled);
  if (on.length === 0) {
    log.info("Claude 자동 수집 꺼짐 (ISSUES_ENABLED=1 로 켜기 — docs/issue-collector.md)");
    return;
  }
  log.info(`Claude 자동 수집 켜짐 — ${on.map((j) => `${j.label} ${Math.round(j.intervalMs / 60_000)}분`).join(" · ")}`);
  setInterval(() => void tick(store, jobs), CHECK_EVERY_MS);
  // 서버 시작 1분 뒤 첫 점검 (주기는 DB 기준이라 재시작 직후 몰아서 돌지 않음)
  setTimeout(() => void tick(store, jobs), 60_000);
}
