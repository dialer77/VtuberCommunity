import type { Store } from "./types";
import type { LiveSnapshot } from "../domain";

/**
 * Postgres 저장소 (미구현 스텁).
 *
 * 구현 시:
 *   1) 의존성 추가: npm i pg  (+ npm i -D @types/pg)
 *   2) 테이블 (예시 스키마):
 *
 *      CREATE TABLE channels (
 *        channel_id   TEXT PRIMARY KEY,
 *        platform     TEXT NOT NULL,
 *        name         TEXT NOT NULL,
 *        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
 *      );
 *
 *      CREATE TABLE live_snapshots (
 *        id           BIGSERIAL PRIMARY KEY,
 *        channel_id   TEXT NOT NULL REFERENCES channels(channel_id),
 *        platform     TEXT NOT NULL,
 *        title        TEXT,
 *        category     TEXT,
 *        viewers      INT  NOT NULL,
 *        started_at   TIMESTAMPTZ,
 *        collected_at TIMESTAMPTZ NOT NULL
 *      );
 *      -- 시계열 조회 최적화: (channel_id, collected_at) 인덱스 / 파티셔닝(Timescale) 고려
 *
 *   3) saveSnapshots  : live_snapshots 배치 INSERT
 *      markChannelsSeen: channels 에 INSERT ... ON CONFLICT (channel_id) DO NOTHING,
 *                        RETURNING channel_id 로 "새로 삽입된" id만 반환
 */
export class PostgresStore implements Store {
  async saveSnapshots(_snapshots: LiveSnapshot[]): Promise<void> {
    throw new Error(
      "PostgresStore 미구현 — MemoryStore(STORE=memory)로 먼저 검증 후 구현하세요.",
    );
  }

  async markChannelsSeen(_channelIds: string[]): Promise<string[]> {
    throw new Error("PostgresStore 미구현");
  }
}
