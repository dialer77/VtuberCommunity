import type { Store } from "./types";
import type { LiveSnapshot } from "../domain";

/**
 * Postgres 저장소 (미구현 스텁 — 프로덕션 확장용).
 *
 * 지금은 자체 DB인 SqliteStore로 운영한다. 트래픽/동시성이 커지면 이 구현을 채워
 * STORE=postgres 로 전환한다. Store 인터페이스가 동일하므로 파이프라인은 그대로.
 *
 * 구현 시:
 *   1) 의존성: npm i pg  (+ npm i -D @types/pg)
 *   2) 스키마는 sqlite.ts 의 테이블과 동일 개념 (channels, live_snapshots)
 *   3) saveSnapshots   : live_snapshots 배치 INSERT
 *      markNewChannels : channels 에 INSERT ... ON CONFLICT DO NOTHING,
 *                        RETURNING 으로 새로 삽입된 행만 반환
 */
export class PostgresStore implements Store {
  async saveSnapshots(_snapshots: LiveSnapshot[]): Promise<void> {
    throw new Error("PostgresStore 미구현 — 기본 STORE=sqlite 사용");
  }

  async markNewChannels(_snapshots: LiveSnapshot[]): Promise<LiveSnapshot[]> {
    throw new Error("PostgresStore 미구현 — 기본 STORE=sqlite 사용");
  }
}
