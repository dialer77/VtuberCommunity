// 이슈 수집 스케줄러. 마지막 실행 시각을 DB 에 남겨, 배포로 서버가 재시작돼도 3시간 주기를 지킨다.
import type { SqliteStore } from "../store/sqlite";
import { config } from "../config";
import { collectIssues } from "./collector";
import { log } from "../log";

const CHECK_EVERY_MS = 5 * 60_000;
const RETRY_AFTER_FAIL_MS = 30 * 60_000;

export function startIssueScheduler(store: SqliteStore): void {
  if (!config.issuesEnabled) {
    log.info("이슈 자동 수집 꺼짐 (ISSUES_ENABLED=1 로 켜기 — docs/issue-collector.md)");
    return;
  }
  const intervalMs = Math.max(30, config.issuesIntervalMin) * 60_000;
  let running = false;

  const tick = async () => {
    if (running) return;
    const lastAttempt = Date.parse(store.getMeta("issues_last_attempt") ?? "") || 0;
    const lastFailed = store.getMeta("issues_last_status") === "fail";
    const wait = lastFailed ? RETRY_AFTER_FAIL_MS : intervalMs;
    if (Date.now() - lastAttempt < wait) return;

    running = true;
    store.setMeta("issues_last_attempt", new Date().toISOString());
    try {
      const s = await collectIssues(store);
      store.setMeta("issues_last_status", "ok");
      store.setMeta("issues_last_result", JSON.stringify({ at: new Date().toISOString(), ...s }));
    } catch (e) {
      store.setMeta("issues_last_status", "fail");
      store.setMeta("issues_last_result", JSON.stringify({ at: new Date().toISOString(), error: String(e) }));
      log.error(`이슈 수집 실패: ${String(e)} — ${RETRY_AFTER_FAIL_MS / 60_000}분 뒤 재시도`);
    } finally {
      running = false;
    }
  };

  log.info(`이슈 자동 수집 켜짐 — ${Math.round(intervalMs / 60_000)}분 주기`);
  setInterval(() => void tick(), CHECK_EVERY_MS);
  // 서버 시작 1분 뒤 첫 점검 (막 재시작한 직후 수집 폭주 방지 — 주기는 DB 기준)
  setTimeout(() => void tick(), 60_000);
}
