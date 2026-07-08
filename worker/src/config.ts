// 환경변수 기반 설정. (.env.example 참고)

export type StoreKind = "memory" | "postgres";

export const config = {
  /** 폴링 간격(ms) */
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 60_000),
  /** N 사이클 후 자동 종료 (0 = 무한) — 데모/테스트용 */
  maxCycles: Number(process.env.MAX_CYCLES ?? 0),
  /** 저장소 종류 */
  storeKind: (process.env.STORE ?? "memory") as StoreKind,
  /** Postgres 연결 문자열 (storeKind=postgres 일 때) */
  databaseUrl: process.env.DATABASE_URL ?? "",
};
