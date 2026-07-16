// 환경변수 기반 설정. (.env.example 참고)

export type StoreKind = "sqlite" | "memory" | "postgres";

export const config = {
  /** 폴링 간격(ms) */
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 60_000),
  /** N 사이클 후 자동 종료 (0 = 무한) — 데모/테스트용 */
  maxCycles: Number(process.env.MAX_CYCLES ?? 0),
  /** 저장소 종류 (기본: 자체 DB인 sqlite) */
  storeKind: (process.env.STORE ?? "sqlite") as StoreKind,
  /** SQLite 파일 경로 */
  dbPath: process.env.DB_PATH ?? "./data/vmoa.db",
  /** REST API 포트 (웹은 3000, 백엔드는 4000) */
  apiPort: Number(process.env.API_PORT ?? 4000),
  /** 치지직 라이브 페이징 수 (50개/페이지). 클수록 버튜버 커버리지↑, 호출↑ */
  chzzkPages: Number(process.env.CHZZK_PAGES ?? 8),
  /** 스냅샷 보존 기간(일). 초과분은 자동 정리 (DB 무한 증가 방지) */
  retentionDays: Number(process.env.RETENTION_DAYS ?? 7),
  /** Postgres 연결 문자열 (storeKind=postgres 일 때) */
  databaseUrl: process.env.DATABASE_URL ?? "",
};
