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
  /** REST API 포트. 호스팅(Railway 등)은 PORT를 주입하므로 그걸 우선한다. */
  apiPort: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  /** 치지직 라이브 페이징 수 (50개/페이지). 클수록 버튜버 커버리지↑, 호출↑ */
  chzzkPages: Number(process.env.CHZZK_PAGES ?? 8),
  /** 스냅샷 보존 기간(일). 초과분은 자동 정리 (DB 무한 증가 방지) */
  retentionDays: Number(process.env.RETENTION_DAYS ?? 7),
  /** Postgres 연결 문자열 (storeKind=postgres 일 때) */
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** 유저 데이터 API 보호용 공유 시크릿 (웹 서버 ↔ 백엔드). 비어있으면 유저 API 비활성 */
  internalSecret: process.env.INTERNAL_SECRET ?? "",

  // ---- 사용자 데이터 (로그인·최애·알림) — docs/user-accounts.md
  /** 사용자 DB(Postgres) 접속 주소. 비어 있으면 로그인 기능 전체 비활성 */
  userDatabaseUrl: process.env.USER_DATABASE_URL ?? "",
  /** 웹 푸시 VAPID 키. 비어 있으면 알림만 비활성 */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "https://vmoa.live",

  // ---- YouTube 공식 채널 연동 — docs/youtube-api.md
  /** Data API 키. 서버(.env)에만 둔다 */
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
  /** API 주소 (시험용으로 바꿀 때만) */
  youtubeApiBase: process.env.YOUTUBE_API_BASE ?? "https://www.googleapis.com/youtube/v3",
  /** 연동 켜기. 기본은 키가 있을 때만. 1 = 키 없이 매핑·RSS 만(@핸들 변환·라이브 감지 없음), 0 = 끔 */
  youtubeSync: process.env.YOUTUBE_SYNC ? process.env.YOUTUBE_SYNC === "1" : !!process.env.YOUTUBE_API_KEY,
  /** 하루 할당량 예산(단위). 기본 한도 10,000 중 이만큼만 쓴다. 80% 를 넘으면 방송 중 확인만 */
  youtubeDailyBudget: Number(process.env.YOUTUBE_DAILY_BUDGET ?? 8000),
  /** 매핑 대상: 월간 시청시간 상위 N + 지금 방송 중 + 확정 목록 */
  youtubeMapTop: Number(process.env.YOUTUBE_MAP_TOP ?? 200),

  // ---- 이슈 자동 수집 (Claude Code 헤드리스 + 구독 인증) — docs/issue-collector.md
  /** 1 이면 주기적으로 이슈 수집 */
  issuesEnabled: process.env.ISSUES_ENABLED === "1",
  /** 수집 주기(분). 기본 3시간 */
  issuesIntervalMin: Number(process.env.ISSUES_INTERVAL_MIN ?? 180),
  /** 한 번에 올릴 최대 이슈 수 */
  issuesMaxPerRun: Number(process.env.ISSUES_MAX_PER_RUN ?? 5),
  /** 신규 데뷔 웹 수집 (기본: 이슈 수집과 같이 켜짐) */
  debutsEnabled: (process.env.DEBUTS_ENABLED ?? process.env.ISSUES_ENABLED) === "1",
  /** 데뷔 수집 주기(분). 기본 6시간 */
  debutsIntervalMin: Number(process.env.DEBUTS_INTERVAL_MIN ?? 360),
  /** 한 번에 받을 최대 데뷔 소식 수 */
  debutsMaxPerRun: Number(process.env.DEBUTS_MAX_PER_RUN ?? 15),
  /** claude 실행 파일 경로 (비우면 자동 탐색) */
  claudeBin: process.env.CLAUDE_BIN ?? "",
  /** 사용할 모델 (비우면 구독 계정 기본값) */
  claudeModel: process.env.CLAUDE_MODEL ?? "",
  /** 1회 실행 제한 시간(ms) */
  claudeTimeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS ?? 15 * 60_000),
};
