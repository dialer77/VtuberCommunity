# VMOA 로드맵 · 인수인계

새 세션은 이 문서부터 읽고 시작합니다. 현재 상태, 남은 설정, 다음 작업 순서, 이미 정한 결정, 작업 규칙을 모았습니다.

기준일: 2026-11-11

## 1. 한눈에 보기

**버모아(VMOA)** — https://vmoa.live · 한국 버튜버 허브. 치지직·SOOP 실시간 방송(LIVE), 랭킹, 신규 데뷔, 이슈 타임라인, 사이트 안 유튜브 플레이어, 최애·방송 시작 알림.

| 구성 | 내용 |
| --- | --- |
| `web/` | Next.js 16 · React 19, Vercel(`vtuber-community`)에 `main` 푸시 시 자동 배포 |
| `server/` | Node 24 + Fastify(tsx). 배포 PC(Windows 10)에서 실행, Cloudflare Tunnel 로 `https://api.vmoa.live` |
| 수집 데이터 | SQLite `server/data/vmoa.db` (다시 쌓을 수 있음) |
| 사용자 데이터 | Postgres `USER_DATABASE_URL` (지금은 배포 PC 의 Postgres, 나중에 외부 DB 로 이전) |
| `app/` | Flutter 스타터 (미빌드, 현재 작업 대상 아님) |

**배포 흐름**: `main` 에 푸시하면 Vercel 이 웹을 배포하고, 배포 PC 감독 스크립트가 1분마다 확인해 `server/**` 가 바뀌었으면 서버를 재시작합니다(패키지가 바뀌면 `npm ci` 포함). 서버 반영 확인은 https://api.vmoa.live/health 의 `version`(커밋 해시)으로 합니다.

| 문서 | 내용 |
| --- | --- |
| `docs/deploy-windows-tunnel.md` | 배포 PC·터널·Vercel 연결, 운영 스크립트 |
| `docs/issue-collector.md` | 이슈 자동 수집 (Claude 구독 + Claude Code 헤드리스) |
| `docs/user-accounts.md` | 로그인·최애·웹 푸시 설정, 외부 DB 이전 |
| `docs/youtube-api.md` | YouTube API 키, 공식 채널 연동(`youtube.ps1`)·키리누키(`clips.ps1`) 운영, 할당량, 지켜야 할 정책 |
| `docs/search-console.md` | Google Search Console |

## 2. 지금 상태

### 완료
- LIVE: 치지직·SOOP 수집, 태그 바(소속사·컨셉·콘텐츠), 버튜버 프로필 페이지
- 랭킹: 실시간·오늘·주간·월간 (`channel_daily` 일별 집계)
- 신규 데뷔: 감지 + 웹 수집(Claude), 이번 달·1개월·3개월 탭
- 이슈 타임라인: 3시간마다 Claude 웹 검색으로 정리, 출처 표시
- 사이트 안 유튜브 플레이어: 크게 보기·미니 플레이어, 페이지 이동해도 재생 유지
- 커뮤니티 기반: 구글 로그인, 최애, 방송 시작 웹 푸시, 내 페이지(`/me`), 탈퇴, 이용약관·개인정보처리방침
- 소속사 필터: 소속사 명단(roster) 기반 판정 (`server/src/tags/roster.ts`, `roster-seed.json`)
- V코인(`/coins`): 비공식 베타로 메뉴에서 숨김
- 유튜브 공식 채널 연동 (2단계): 채널 매핑(치지직 `socialLinks`·SOOP `link` 의 유튜브 링크로 자동 추정 + 운영자 확정 `deploy\windows\youtube.ps1`), 프로필 "공식 영상" 탭(RSS + `videos.list`, 사이트 안 재생), 유튜브 라이브 감지(LIVE 목록·프로필에만, 홈 합계·랭킹·데뷔 감지 제외), 30일 갱신·정리. 코드 `server/src/youtube/`, 운영 `docs/youtube-api.md` 3장
- 키리누키 참여 (4단계, 로그인 기반 — 사용자 DB·구글 로그인 설정 후 켜짐): 클립 좋아요(`/clips?sort=likes` 좋아요순), 내 재생목록(만들기·담기·이름 바꾸기·전체 재생 — 공식 임베드 `playlist` 매개변수), '어떤 순간' 태그 투표(찬반 2표 차이로 분류에 반영), 내 페이지 "내 재생목록"·"좋아요한 클립". 사용자 DB `userdb/clips.ts`, 합계는 수집 DB 에 복사
- 키리누키 수집·분류 (3단계): 키리누키 채널 발견(`search.list` 하루 20회, 채널 ID 만) → RSS 추적 → Claude 헤드리스 분류(누가·무엇을·어떤 순간·한 줄 요약, RSS 제목·설명만 입력) → 비슷한 클립(같은 버튜버·다른 버튜버). `/clips` 모음·태그별, `/clips/<ID>` 상세, 프로필 "키리누키" 탭(특징 태그). 코드 `server/src/clips/`, 운영 `deploy\windows\clips.ps1`, `docs/youtube-api.md` 4장

### 코드는 배포됐고, 사용자가 설정해야 켜지는 것
배포 PC 작업은 RDP 로 사용자가 직접 실행합니다.

- [x] **YouTube API 키 등록** (2026-11-10 완료): 배포 PC `server\.env` 의 `YOUTUBE_API_KEY`. 교체할 때는 바탕화면 `youtube-key.txt` → `deploy\windows\setup-youtube.ps1` (`docs/youtube-api.md`). 키가 있으므로 공식 채널 연동이 자동으로 켜져 있음 (하루 보통 2,000단위 아래, 예산 8,000)
- [ ] **유튜브 매핑 정리**: 배포 후 1~2시간이면 상위 200명 1회차가 끝남. `deploy\windows\youtube.ps1 pending` 으로 후보가 여럿·다시보기만·공용 채널인 버튜버를 `set`/`none` 으로 정리, `list nolink` 중 공식 채널이 있는 버튜버는 `set` (개발 PC 시험 기준 190명 중 확인필요 13명, 링크없음 41명)
- [ ] **키리누키 확인** (배포 후 하루쯤): `deploy\windows\clips.ps1 status` 로 채널·클립이 쌓이는지, `recent 30` 으로 분류가 맞는지 보고, 클립 채널이 아닌 것은 `block`. 분류는 Claude 구독 토큰을 쓰므로 **이슈 수집 토큰 교체 전에는 실패할 수 있음** (30분 뒤 자동 재시도). 서버 `.env` 에 `ISSUES_ENABLED=1` 이 없으면 `CLIPS_ENABLED=1` 을 넣어야 켜짐
- [ ] **사용자 DB**: `deploy\windows\setup-userdb.ps1` (`docs/user-accounts.md` 1단계). 최애·알림에 더해 4단계(좋아요·재생목록·태그 투표)도 이게 있어야 켜짐
- [ ] **구글 로그인**: Google OAuth 클라이언트 발급 → Vercel 환경변수 5개 → 재배포 (`docs/user-accounts.md` 2·3단계)
- [ ] **이슈 수집 토큰 교체**: 사용자가 Claude 계정을 바꿀 예정이라 새 계정으로 다시 발급 — `deploy\windows\setup-issues.ps1 -RenewToken`

### 아직 확인하지 못한 것
- 실제 구글 계정 로그인 (위조 세션 쿠키로만 시험함). 4단계도 같은 방식으로 시험: 임시 Postgres + 위조 세션 쿠키로 좋아요·투표 반영·재생목록·남의 목록 차단·한도·탈퇴 후 합계·재시작 후 합계 복구, 로그인 화면 스크린샷
- 아이폰(홈 화면에 추가) 웹 푸시 (PC Chrome 에서는 실제 FCM 발송·표시까지 확인함)
- 로그인된 Chrome 에서 사이트 안 유튜브 재생 시 Premium 광고 제거 여부
- 유튜브 연동을 실제 API 키로 돌린 결과 — 개발 PC 에서는 실제 치지직·SOOP 링크·RSS + 가짜 YouTube API 로 시험 (매핑·영상 상세·라이브 카드·공식 영상 탭 화면). 실제 키의 라이브 감지·할당량은 배포 PC `youtube.ps1 status` 로 확인
- 키리누키 장기 운영 결과 — 배포 직후(2026-11-11) 실제 `search.list` 로 키리누키 채널을 찾아 배포 PC 의 Claude 가 첫 40개를 분류한 것까지 확인(여러 명이 나오는 합방 클립도 버튜버를 맞게 잡음). 자동 차단 규칙·30일 정리·하루 할당량 사용량은 며칠 지켜봐야 함 (`clips.ps1 status`, `youtube.ps1 status`)

## 3. 다음 작업 (순서대로)

### 2단계 — 유튜브 공식 채널 연동 ✅ 완료 (2026-11-10)

남은 것 (필요해지면):
- 유튜브 방송 시작 웹 푸시 (지금 알림은 치지직·SOOP 만) — 매핑된 버튜버를 최애로 둔 사용자에게
- 후보가 여럿일 때 자동 판정 보강 — 영상 설명에 적힌 치지직·SOOP 주소로 역확인
- 쇼츠 구분 (RSS 로는 구분 안 됨), 유튜브만 하는 버튜버(치지직·SOOP 채널이 없는 경우)
- 유튜브 라이브를 처음 하는 채널은 RSS 60분 주기라 늦게 잡힐 수 있음 (한 번 잡히면 30일간 10분 주기)

처음 계획 (기록용):
- **채널 매핑**: 버튜버 ↔ 유튜브 공식 채널. 자동 추정 + 운영자 수동 확정·덮어쓰기. 상위 채널부터.
  - 후보 출처: 치지직·SOOP 채널 소개의 링크, 데뷔 수집 결과, `channels.list`(`forHandle`, 1단위)
- **프로필 "공식 영상" 탭**: 최신 영상은 채널 RSS(`youtube.com/feeds/videos.xml?channel_id=…`, 할당량 0), 상세는 `videos.list` 50개 묶음(1단위). 재생은 기존 사이트 안 플레이어(`web/src/components/player/`).
- **유튜브 라이브 감지**: `server/src/collectors/youtube.ts` 골격 완성 — RSS 로 후보 발견 → `videos.list(liveStreamingDetails)` 로 확정. `YOUTUBE_API_KEY` 가 있을 때만 등록되는 구조는 이미 있음(`collectors/index.ts`).
- **정책 반영** (`docs/youtube-api.md`):
  - API 로 받은 데이터는 30일 안에 갱신하거나 삭제 → 저장 시 `fetched_at` 을 두고 주기적으로 갱신
  - 여러 채널의 유튜브 수치를 합산하지 않음 → 랭킹과 홈의 시청자 합계에는 유튜브를 넣지 않고 LIVE 목록에만 표시

### 3단계 — 키리누키 수집·분류 ✅ 완료 (2026-11-11)

남은 것 (필요해지면):
- 비슷한 클립에 신경망 임베딩(예: multilingual-e5, 로컬 ONNX) — 지금은 분류 태그 + 글자 2-gram. 클립이 수천 개 쌓인 뒤 결과를 보고 판단
- 버튜버 이름 별칭(예: "리코" → 유즈하 리코) 사전 (태그 투표는 4단계에서 화면 분류에 반영됨)
- 키리누키 채널 발견을 검색 외에 영상 설명의 원본 링크로 넓히기

처음 계획 (기록용):
- 목표: "A 클립이 재밌다 → 같은 버튜버의 비슷한 클립 / 다른 버튜버의 비슷한 클립"을 찾아 주기
- 키리누키 채널 발견: `search.list`(하루 100회 별도 한도)로 버튜버 이름 검색 → 채널을 등록해 두고 이후 새 영상은 RSS 로 추적
- 분류: 누가 / 무엇을 / 어떤 순간 / 한 줄 요약 태그. Claude 헤드리스(구독)로 생성
  - **정책 주의**: API 로 받은 데이터로 파생 데이터를 만들면 안 됨(III.E.4.h). 분류 입력은 RSS 제목·설명과 사용자 참여(투표·태그)로 하고, 화면에는 "버모아 분류"로 표시
- 비슷한 클립: 태그 + 로컬 임베딩
- 주제별 모음 페이지, 버튜버별 특징 태그
- 범위: 상위 100~200명부터

### 4단계 — 키리누키 참여 (로그인 기반) ✅ 완료 (2026-11-11)
좋아요, 내 재생목록, 태그 투표. 사용자 DB·구글 로그인 설정이 끝나면 켜짐

남은 것 (필요해지면):
- 재생목록 순서 바꾸기 (지금은 담은 순서), 카드에서 바로 좋아요
- 태그 투표 반영 기준(2표)을 이용자 수에 맞춰 조정, 도배 방지는 6단계 운영 도구와 함께

### 5단계 — 모아 보기·놀이 ← 다음 작업
공개 재생목록, 주간 베스트 클립 투표, 클립 월드컵, 프로필 수정 제안(관리자 승인)

### 6단계 — 짧은 글
데뷔 축하, 응원, 클립 댓글. **첫 사용자 글 기능과 함께 운영 도구를 반드시 같이 낼 것**: 신고, 숨김, 계정 정지, 도배 방지, 금칙어. 이용약관 금지 행위 조항도 함께 점검.

### 이후
게시판(통합·소속사 단위), 같이 보기·멀티뷰

### 보류 (당분간 하지 않음)
이슈 댓글(대신 이모지 반응), 실시간 채팅, 버튜버끼리 대결 투표

### 인프라
- 사용자 DB 외부 이전: `pg_dump` → 복원 → `USER_DATABASE_URL` 교체 (`docs/user-accounts.md`)
- 이전 전까지 사용자 DB 정기 백업 방법 마련 (배포 PC 디스크 장애 대비)

## 4. 이미 정한 것 (바꾸려면 사용자 확인)

| 주제 | 결정 |
| --- | --- |
| 랭킹 | 누적 랭킹 없음 — 수집 시작 시점이 기준이라 의미가 왜곡됨 |
| 신규 데뷔 | 기간 안(이번 달·1개월·3개월)만 표시. 하루라도 지나면 제외 |
| 이슈·기사 | 출처 필수. 기사는 링크·출처로만 — 보도사진·기사 요약문은 저장·표시하지 않음 |
| LLM | Anthropic API 키를 쓰지 않음. 배포 PC 의 Claude 구독 + Claude Code 헤드리스(`claude -p`) |
| 소속사 태그 | 방송 하나의 자가 태그가 아니라 소속사 명단 기준 |
| 버튜버 정보 | 나무위키 같은 정리 정보로 보고, 잘못된 내용은 운영자가 직접 걸러냄 |
| 로그인 | 구글만. 이메일은 받지 않음(`openid profile`). 만 14세 미만 가입 불가 |
| 알림 | 웹 푸시. 방송 시작 15분 이내 감지 시에만, 같은 채널은 30분에 한 번 |
| 유튜브 재생 | `youtube.com/embed` (로그인 계정의 Premium 인식). 재생 버튼 전에는 불러오지 않음. 플레이어 수정·광고 차단 금지 |
| YouTube 키 | 서버(배포 PC `server\.env`)에만. 웹·저장소에 넣지 않음 |

## 5. 작업 규칙 (새 세션 필독)

- 사용자에게는 한국어로 답한다.
- 검증한 뒤에는 묻지 않고 `main` 에 커밋·푸시한다 (사용자 상시 허락). 커밋 메시지 끝에 `Co-Authored-By` 줄.
- **web**: Next.js 16 은 예전 지식과 다르다. 코드를 쓰기 전에 `web/node_modules/next/dist/docs/` 의 해당 가이드를 읽는다 (`web/AGENTS.md`).
- **배포 PC는 직접 조작할 수 없다.** 사용자가 RDP 로 실행할 스크립트·명령을 제공한다. 배포 PC 에서 코드를 고치게 하지 않는다. SSH 원격 관리는 제안하지 않는다.
- **PowerShell 스크립트**(`deploy/windows/`): Windows PowerShell 5.1 호환, **UTF-8 BOM + CRLF** 로 저장. 한글 바로 앞에 `$변수` 를 붙여 쓰지 말고 `-f` 포맷을 쓴다. 공통 함수는 `_common.ps1`(`Set-EnvValue`, `Get-EnvValue`, `Invoke-Native`, `Stop-ServerProcess` 등). `server\.env` 는 BOM 없는 UTF-8.
- **비밀 값**(토큰·키·시크릿·DB 비밀번호)은 출력하거나 커밋하지 않는다. 저장소는 공개다. 사용자에게도 채팅에 붙여넣지 말고 파일이나 각 서비스 화면에 직접 넣으라고 안내한다. 기본 PowerShell 창의 숨김 입력은 Ctrl+V 가 안 되므로 키 입력은 파일 방식을 우선한다.
- **Cloudflare**: 터널 `vmoa` 만 다룬다. 같은 계정의 다른 터널은 건드리지 않는다. 같은 터널을 두 PC 에서 동시에 실행하지 않는다.
- **새 서버 기능은 설정이 없으면 꺼지게** 만든다 (기존 예: `YOUTUBE_API_KEY`, `USER_DATABASE_URL`, VAPID 키, `ISSUES_ENABLED`, `DEBUTS_ENABLED`). 웹 로그인 UI 는 빌드 시 `NEXT_PUBLIC_AUTH_ENABLED` 로 결정된다.

## 6. 검증 방법 (이전 작업에서 쓴 것)

- 타입·린트: `server`·`web` 에서 `npx tsc --noEmit`, 바꾼 파일만 `npx eslint <파일>`
- 사용자 DB: `embedded-postgres` 로 임시 Postgres 를 띄우고 `USER_DATABASE_URL` 을 지정해 서버 실행
- 로그인이 필요한 웹 라우트: `next-auth/jwt` 의 `encode` 로 세션 쿠키를 만들어 `/api/me/*` 호출
- 화면·푸시: 헤드리스 Chrome(CDP)에 쿠키를 넣고 스크린샷. 실제 FCM 구독 → 발송 → 알림 표시까지 확인 가능
- 저장소 밖 시험 스크립트에서 top-level await 를 쓰면 `.mts` 로 만든다 (tsx)
- 배포 확인: `https://api.vmoa.live/health` 의 `version`, 웹은 `vercel ls`

## 7. 알려진 문제·정리 대상

- `web/src/components/theme-toggle.tsx` 에 예전부터 있던 lint 오류 (기능과 무관)
- `docs/deploy-fly.md`, `docs/deploy-railway.md`, `docs/backend-architecture.md` 는 예전 계획. 현재 배포는 Windows PC + Cloudflare Tunnel
