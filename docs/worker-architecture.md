# VMOA 수집 워커 (worker) — 구조 설명

> 문서 버전 v0.1 · 대상: `worker/` 폴더
> 관련 문서: [VMOA-concept-v0.1.md](./VMOA-concept-v0.1.md)

## 1. 이 워커가 왜 필요한가

"백엔드"는 사실 두 가지가 섞인 말이다.

| 역할 | 하는 일 | 어디서? |
|---|---|---|
| **API (서빙)** | 클라이언트에 데이터 내려주기 | 지금은 **Next.js 웹**이 DB를 직접 읽음 (별도 API 불필요) |
| **수집 워커** | 주기적 폴링 → 정규화 → 저장 → 감지 | **이 `worker/`** (상시 실행 프로세스) |

핵심은 **수집 워커**다. 리서치 결론이 *"플랫폼 API는 과거 통계를 주지 않으니 직접 주기적으로 폴링해서 시계열을 쌓아야 한다"* 였는데, 이건 **요청이 올 때만 도는 웹 서버로는 불가능**하다. 항상 켜져서 스스로 도는 별도 프로세스가 필요하고, 그게 이 워커다.

```
                ┌──────────── worker/ (상시 실행) ────────────┐
   치지직 API ──▶│ COLLECT → NORMALIZE → STORE → DETECT        │
   SOOP  API ──▶│                          │        │        │
   YouTube  ──▶│                          ▼        ▼        │
                └────────────────────── [ Postgres DB ] ──────┘
                                               │
                                               ▼  (읽기)
                                    ┌──────────────────────┐
                                    │  web/ (Next.js)      │  ← 사용자
                                    │  현황·데뷔·랭킹·이슈  │
                                    └──────────────────────┘
```

웹은 워커가 DB에 쌓아둔 데이터를 **읽기만** 한다. 수집과 서빙이 분리돼 있어서, 폴링이 느리거나 실패해도 웹은 멀쩡하다.

## 2. 폴더 구조

```
worker/
├─ package.json          # tsx로 TS 직접 실행 (dev/start/typecheck)
├─ tsconfig.json
├─ .env.example          # 설정 예시 (폴링 간격, 저장소 종류 등)
└─ src/
   ├─ index.ts           # 진입점: 저장소 생성 → 스케줄러 시작
   ├─ config.ts          # 환경변수 설정
   ├─ log.ts             # 타임스탬프 로거
   ├─ domain.ts          # 도메인 모델 (Platform, RawLive, LiveSnapshot)
   ├─ scheduler.ts       # 폴링 루프 (간격 실행 + 중복방지 + 안전종료)
   ├─ pipeline.ts        # ★ 한 사이클: COLLECT→NORMALIZE→STORE→DETECT
   ├─ collectors/        # [COLLECT] 플랫폼별 수집기
   │  ├─ types.ts        #   Collector 인터페이스
   │  ├─ chzzk.ts        #   치지직 수집기 (지금은 목 스텁)
   │  └─ index.ts        #   활성 수집기 레지스트리
   ├─ store/             # [STORE] 저장소
   │  ├─ types.ts        #   Store 인터페이스
   │  ├─ memory.ts       #   인메모리 (기본, DB 없이 동작)
   │  └─ postgres.ts     #   Postgres 구현 (스텁 + 스키마 주석)
   └─ detect/            # [DETECT] 감지 로직
      └─ debut.ts        #   신규 데뷔 후보 판정
```

## 3. 한 사이클의 흐름 (pipeline.ts)

스케줄러가 일정 간격으로 `runCycle()`을 호출한다. 한 사이클은 4단계:

1. **COLLECT** — 등록된 모든 수집기(`collectors`)에서 **병렬로** 라이브 목록을 가져온다. `Promise.allSettled`라 한 플랫폼이 실패해도 나머지는 진행.
2. **NORMALIZE** — 플랫폼별 원본(`RawLive`)을 공통 스키마(`LiveSnapshot`)로 변환하고 관측 시각(`collectedAt`)을 찍는다.
3. **STORE** — 스냅샷을 시계열로 저장(`store.saveSnapshots`). 이게 쌓여서 나중에 랭킹·급상승의 원천이 된다.
4. **DETECT** — `store.markChannelsSeen`이 "처음 보는 channelId"만 돌려주고, 그게 곧 **신규 데뷔 후보**가 된다.

## 4. 핵심 설계 — 인터페이스로 갈아끼우기

두 지점이 인터페이스로 추상화돼 있어서, **파이프라인을 건드리지 않고** 확장/교체할 수 있다.

- **Collector** (`collectors/types.ts`): 새 플랫폼은 이 인터페이스만 구현해서 `collectors/index.ts`에 등록. → SOOP·YouTube 추가가 쉬움.
- **Store** (`store/types.ts`): `memory` ↔ `postgres` 를 환경변수(`STORE=`)로 교체. → DB 없이 먼저 검증하고, 나중에 Postgres로 전환.

## 5. 실행 방법

```bash
cd worker
npm install

# DB 없이 인메모리로 무한 폴링 (기본 60초 간격)
npm start

# 데모: 1초 간격으로 4번만 돌고 종료
MAX_CYCLES=4 POLL_INTERVAL_MS=1000 npm start

# 코드 수정 시 자동 재시작
npm run dev
```

### 데모 출력 해석

```
#1 수집 3건 · 신규채널 3      ← 첫 관측이라 3개 모두 신규
   🎉 데뷔 후보: 달빛나리 ...
#2 수집 3건 · 신규채널 0      ← 이미 본 채널 → 신규 없음
#3 수집 4건 · 신규채널 1      ← '네온(신인)' 채널이 새로 등장
   🎉 데뷔 후보: 네온(신인) ...   → 정확히 이때만 감지 발화
#4 수집 4건 · 신규채널 0
```

## 6. 지금은 스텁인 부분 (다음 작업)

| 위치 | 현재 | 다음 |
|---|---|---|
| `collectors/chzzk.ts` | 목 데이터 반환 | 실제 치지직 API 호출로 교체 (공식 `/open/v1/lives` 또는 비공식 `home/lives`) |
| `store/postgres.ts` | 미구현 throw | `pg` 설치 + 테이블 생성 + 쿼리 구현 (파일 상단 주석에 스키마 예시 있음) |
| `collectors/index.ts` | 치지직만 | SoopCollector · YoutubeCollector 추가 |
| `detect/debut.ts` | first-seen 단일 신호 | 개설일·데뷔 키워드·급증 등 다신호 결합 |
| 급상승 감지 | 없음 | 시계열 축적 후 규모보정 변화율(z-score/EWMA)로 추가 |

## 7. 웹과의 연결 (아직 안 함)

지금 `web/`의 `lib/data.ts`는 목 데이터를 반환한다. 워커가 Postgres에 데이터를 쌓기 시작하면:

- `web/src/lib/data.ts`의 함수들을 **같은 DB를 읽는 쿼리로 교체** → 페이지 코드는 그대로, 진짜 데이터가 뜬다.
- 웹과 워커가 **도메인 모델을 공유**하도록 추후 `packages/types`로 추출 고려 (지금은 각자 정의).

## 8. 배포 관점 (참고)

- 워커는 **상주 프로세스**라 서버리스 부적합 → VPS/컨테이너에서 상시 실행 (문서 06 참고).
- 폴링 간격은 대상 채널 수·API rate limit을 보며 60~300초로 조정.
- API 키·`DATABASE_URL`은 `.env`로 주입하고 **절대 커밋하지 않는다** (`.gitignore`에 이미 제외됨).
