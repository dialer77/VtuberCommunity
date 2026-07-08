import { config } from "./config";
import { runCycle } from "./pipeline";
import type { Store } from "./store/types";
import { log } from "./log";

/** 폴링 스케줄러. 일정 간격으로 runCycle 을 실행하며,
 *  사이클 중복 실행 방지 + graceful shutdown 을 처리한다. */
export async function startScheduler(store: Store): Promise<void> {
  let cycle = 0;
  let running = false;
  let stopped = false;

  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    log.info("스케줄러 종료");
    process.exit(0);
  };

  const tick = async () => {
    // 이전 사이클이 아직 안 끝났으면(느린 API 등) 이번 틱은 건너뛴다.
    if (running) {
      log.info("이전 사이클 진행 중 — 이번 틱 건너뜀");
      return;
    }
    running = true;
    cycle += 1;
    try {
      await runCycle(store, cycle);
    } catch (e) {
      log.error(`사이클 실패: ${String(e)}`);
    } finally {
      running = false;
    }

    if (config.maxCycles > 0 && cycle >= config.maxCycles) {
      log.info(`MAX_CYCLES(${config.maxCycles}) 도달 — 종료`);
      shutdown();
    }
  };

  const timer = setInterval(tick, config.pollIntervalMs);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log.info(
    `스케줄러 시작 — 간격 ${config.pollIntervalMs}ms · store=${config.storeKind}` +
      (config.maxCycles > 0 ? ` · maxCycles=${config.maxCycles}` : ""),
  );
  await tick(); // 즉시 1회 실행 후 간격 반복
}
