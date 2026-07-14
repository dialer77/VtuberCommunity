# VMOA 백엔드 (server) — 구조 설명

> 문서 버전 v0.2 · 대상: `server/` 폴더
> 관련 문서: [VMOA-concept-v0.1.md](./VMOA-concept-v0.1.md)
> v0.1 → v0.2: `worker/` → `server/` 승격. 자체 DB(SQLite) + REST API 통합.

## 1. 왜 별도 백엔드인가

"백엔드"는 사실 두 가지가 섞인 말이다.

| 역할 | 하는 일 |
|---|---|
| **수집 워커** | 주기적 폴링 → 정규화 → 저장 → 감지 (상시 실행) |
| **API 서빙** | 웹/앱에 데이터 내려주기 |

리서치 결론이 *"플랫폼 API는 과거 통계를 안 주니 직접 주기적으로 폴링해 시계열을 쌓아야 한다"* 였는데, 이건 **요청 올 때만 도는 웹 서버로는 불가능**하다. 그래서 상시 실행 프로세스가 필요하다.

이 둘을 **하나의 백엔드 서비스(`server/`)로 통합**한다: 자체 DB를 소유하고, 수집 스케줄러가 쓰고, REST API가 읽는다. 웹(그리고 나중에 앱)은 이 API만 소비한다.

```
   치지직 API ──▶┌──────────── server/ (상시 실행) ────────────┐
   SOOP  API ──▶│ 스케줄러: COLLECT→NORMALIZE→STORE→DETECT     │
   YouTube  ──▶│                    │                         │
                │                    ▼                         │
                │            [ 자체 DB: SQLite ]               │
                │                    │                         │
                │            REST API (Fastify)  ◀── /api/... │
                └────────────────────┬─────────────────────────┘
                                     ▼  (HTTP)
                          ┌──────────────────────┐
                          │  web/ (Next.js)      │  ← 사용자
                          │  현황·데뷔·랭킹·이슈  │
                          └──────────────────────┘
```

수집과 서빙이 한 서비스 안에서 분리돼 있어, 폴링이 느리거나 실패해도 API/웹은 마지막 스냅샷을 계속 서빙한다.

## 2. 폴더 구조

```
server/
├─ package.json          # tsx로 TS 직접 실행 (dev/start/typecheck), fastify
├─ tsconfig.json
├─ .env.example          # 폴링 간격·저장소·DB 경로·API 포트
└─ src/
   ├─ index.ts           # 진입점: 저장소 생성 → API 기동 + 스케줄러 시작
   ├─ api.ts             # REST API (Fastify): /health, /api/lives, /api/debuts
   ├─ config.ts          # 환경변수 설정
   ├─ log.ts             # 타임스탬프 로거
   ├─ domain.ts          # 도메인 모델 (Platform, RawLive, LiveSnapshot)
   ├─ vtuber.ts          # 버튜버 판정(웹 레지스트리와 동일, 추후 공유 패키지로 통합)
   ├─ scheduler.ts       # 폴링 루프 (간격 실행 + 중복방지 + 안전종료)
   ├─ pipeline.ts        # ★ 한 사이클: COLLECT→NORMALIZE→STORE→DETECT
   ├─ collectors/        # [COLLECT] 플랫폼별 수집기
   │  ├─ types.ts        #   Collector 인터페이스
   │  ├─ chzzk.ts        #   치지직 수집기 (실 API 연동됨)
   │  └─ index.ts        #   활성 수집기 레지스트리
   ├─ store/             # [STORE] 저장소
   │  ├─ types.ts        #   Store 인터페이스 (saveSnapshots, markNewChannels)
   │  ├─ sqlite.ts       #   ★ 자체 DB (node:sqlite 내장) + API 읽기 쿼리
   │  ├─ memory.ts       #   인메모리 (테스트용)
   │  └─ postgres.ts     #   Postgres 스텁 (프로덕션 확장용)
   └─ detect/            # [DETECT] 감지 로직
      └─ debut.ts        #   신규 데뷔 후보 판정
```

## 3. 한 사이클의 흐름 (pipeline.ts)

스케줄러가 일정 간격으로 `runCycle()`을 호출한다. 4단계:

1. **COLLECT** — 등록된 수집기에서 **병렬로** 라이브 목록 수집(`Promise.allSettled`, 한 플랫폼 실패해도 진행).
2. **NORMALIZE** — 플랫폼별 원본(`RawLive`)을 공통 `LiveSnapshot`으로 변환 + 관측 시각(`collectedAt`).
3. **STORE** — 스냅샷을 시계열로 저장(`store.saveSnapshots`). 랭킹·급상승의 원천.
4. **DETECT** — `store.markNewChannels`가 "처음 관측된 채널"만 반환 → **신규 데뷔 후보**.

## 4. 자체 DB (SQLite)

외부 DB 없이 **node:sqlite 내장**(제로 설치)으로 자체 DB를 소유한다. `store/sqlite.ts`.

```sql
CREATE TABLE channels (
  channel_id TEXT PRIMARY KEY, platform TEXT, name TEXT,
  first_seen_at TEXT              -- 이 값이 재시작해도 유지 → 진짜 신규만 감지
);
CREATE TABLE live_snapshots (
  id INTEGER PK, channel_id, platform, channel_name,
  title, category, viewers, started_at, thumbnail_url,
  collected_at TEXT              -- 폴링 시각 (시계열의 한 점)
);
```

- **first-seen 영속성**: `markNewChannels`는 `INSERT OR IGNORE`로 새 채널만 감지. DB 파일에 남으므로 **프로세스를 재시작해도 이미 본 채널은 다시 신규로 잡히지 않는다**(검증 완료).
- **현재 방송중**: `getCurrentLives()`가 `MAX(collected_at)` 배치를 조회.
- Store 인터페이스가 동일하므로 트래픽이 커지면 `postgres.ts`를 채워 `STORE=postgres`로 전환(파이프라인 무수정).

## 5. REST API (api.ts, Fastify)

| 엔드포인트 | 반환 |
|---|---|
| `GET /health` | `{ ok, ts }` |
| `GET /api/lives` | 현재 방송중 라이브 목록 (최근 스냅샷) |
| `GET /api/debuts` | 최근 first-seen 채널(데뷔 후보) |

웹의 `lib/backend.ts`가 이 API를 호출하고, 응답을 도메인 타입으로 매핑한다. 웹은 서버사이드(서버 컴포넌트)에서 호출하므로 CORS 불필요.

## 6. 핵심 설계 — 인터페이스로 갈아끼우기

- **Collector** (`collectors/types.ts`): 새 플랫폼은 인터페이스만 구현해 `collectors/index.ts`에 등록 → SOOP·YouTube 추가 용이.
- **Store** (`store/types.ts`): `sqlite`(기본) ↔ `memory` ↔ `postgres` 를 `STORE=` 로 교체.

## 7. 실행 방법

```bash
cd server
npm install

# 자체 DB(SQLite)로 상시 폴링 + API (기본 60초 간격, 포트 4000)
npm start

# 데모: 2초 간격 3사이클 후 종료
MAX_CYCLES=3 POLL_INTERVAL_MS=2000 npm start

# 코드 수정 시 자동 재시작
npm run dev
```

웹과 함께 띄우려면: 백엔드(`server`, 4000) → 웹(`web`, 3000) 순으로 실행. 웹은 `BACKEND_URL`(기본 `http://localhost:4000`)로 백엔드를 찾고, 백엔드가 없으면 치지직 직접 조회 → 목 순으로 폴백한다.

## 8. 현재 상태 & 다음 작업

| 항목 | 상태 |
|---|---|
| 치지직 실 API 수집 | ✅ 연동됨 |
| 자체 DB(SQLite) + first-seen 영속 | ✅ 동작 |
| REST API + 웹 연동 | ✅ 엔드투엔드 확인 |
| 데뷔 페이지 실데이터 | ✅ (first-seen 채널) |

| 다음 | 내용 |
|---|---|
| SOOP·YouTube 수집기 | `collectors/`에 추가 |
| 급상승 감지 | 시계열 축적 후 규모보정 변화율(z-score/EWMA) |
| 데뷔 감지 고도화 | 개설일·데뷔 키워드·급증 다신호 결합 (지금은 first-seen 단일) |
| Postgres 전환 | 트래픽 증가 시 `store/postgres.ts` 구현 |
| 도메인 타입 공유 | `web`·`server`의 타입/버튜버 판정을 `packages/`로 추출 |

## 9. 배포 관점 (참고)

- 백엔드는 **상주 프로세스**라 서버리스 부적합 → VPS/컨테이너에서 상시 실행.
- 폴링 간격은 대상 채널 수·rate limit 보며 60~300초 조정.
- API 키·`DATABASE_URL`·자체 DB 파일은 `.env`/`data/`로 두고 **커밋 금지**(`.gitignore` 반영됨).
