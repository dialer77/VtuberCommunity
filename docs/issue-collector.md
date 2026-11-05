# Claude 자동 수집 — 이슈(3시간) · 신규 데뷔(6시간)

> 백엔드(`server/`)가 **Claude Code 를 헤드리스로 실행**해 웹을 검색하고 DB 에 올린다. 인증은 **Claude 구독(Pro/Max)** — API 키·종량 과금 없음.
> - **이슈** (3시간마다): 한국 버튜버 씬 이슈를 출처와 함께 정리 → 웹 `/issue`
> - **신규 데뷔** (6시간마다): 최근 30일 데뷔 + 60일 안 데뷔 예정 소식을 출처와 함께 수집 → 웹 `/debut`
>   채널 주소가 확인되면 **버튜버 확정 목록**에 넣어, 방송 태그가 없거나 시청자 순위 밖이어도 그 채널의 방송을 매분 직접 확인한다.
> - 두 작업은 동시에 돌지 않는다 (같은 구독 사용량을 나눠 씀).

## 동작 방식

```
[배포 PC]  server (SYSTEM)
  └ 이슈 스케줄러 (5분마다 점검, 마지막 실행 후 3시간 지났으면 실행 — 기록은 DB 에 남아 재시작돼도 유지)
      └ claude.exe -p  (도구: WebSearch·WebFetch 만 / 설정·플러그인·MCP 안 불러옴 / 결과는 JSON 스키마로)
          → 이슈 후보 (제목·요약·본문·태그·날짜·출처 URL)
      └ 검증: 출처 없는 것·같은 제목·이미 쓴 출처 URL → 버림
      └ 출처 미리보기 수집 (기사 대표 이미지·제목·언론사·게시일 / 유튜브는 영상 ID)
      └ SQLite issues · issue_sources 저장
[Vercel 웹]  /issue  ← GET https://api.vmoa.live/api/issues
             /issue/<slug> ← 대표 자료(유튜브 영상 또는 기사 카드) + 본문 + 출처 목록
```

수집 기준 (프롬프트: `server/src/issues/collector.ts`)
- **다룸**: 공식 발표·언론 보도·공식 채널 게시물로 확인되는 사실 — 데뷔·신규 기수, 졸업·활동 종료 공지, 소속사 발표,
  콜라보·합방·이벤트, 콘서트·굿즈, 기록 달성, 플랫폼 정책 변경
- **안 다룸**: 루머·확인 안 된 의혹, 커뮤니티 추측, 사생활·신상, 선정적 콘텐츠, 출처를 직접 확인 못 한 내용
- 자동 수집 글에는 화면에 **"AI 정리"** 표시 + 원문 확인 안내가 붙는다.

## 배포 PC 에서 켜기 (1회, 약 5분)

코드는 GitHub push 로 이미 배포 PC 에 와 있다 (자동 업데이트). **관리자 PowerShell** 에서:

```powershell
cd D:\01_Project\21_VtuberCommunity
powershell -ExecutionPolicy Bypass -File deploy\windows\setup-issues.ps1
```

스크립트가 하는 일:
1. **Claude Code 확인** — 없으면 공식 설치 스크립트(`https://claude.ai/install.ps1`)로 설치
2. **구독 토큰 발급** — `claude setup-token` 실행 → 브라우저에서 **구독 계정으로 로그인** →
   창에 표시된 `sk-ant-oat01-…` 토큰을 복사해 붙여넣기 (화면에 안 보임) → `server\.env` 에 저장
3. **설정 기록** — `CLAUDE_BIN`(claude.exe 절대 경로), `ISSUES_ENABLED=1`, `CLAUDE_CODE_GIT_BASH_PATH`,
   `.env` 권한을 SYSTEM·Administrators 전용으로
4. **시험 수집 1회** (1~3분) → 결과 JSON 출력 → **서버 재시작** → 이후 3시간마다 자동

끝나면 https://vmoa.live/issue 에서 확인.

> 서버는 SYSTEM 계정으로 돌기 때문에 개인 로그인 상태가 아니라 **토큰(`CLAUDE_CODE_OAUTH_TOKEN`)** 으로 인증한다.
> Claude 설정 폴더도 사용자 것과 분리된 `server\data\claude-home` 을 쓴다 (사용자 플러그인·설정 영향 없음).

## 관리 명령 (관리자 PowerShell)

| 명령 | 하는 일 |
|---|---|
| `deploy\windows\issues.ps1 status` | 켜짐 여부, 마지막 실행 시각·결과(추가/건너뜀 목록·소요 시간) |
| `deploy\windows\issues.ps1 list [개수]` | 최근 이슈 목록 (숨김 포함, slug 확인용) |
| `deploy\windows\issues.ps1 hide <slug>` | 사이트에서 **즉시 숨김** (잘못 정리된 글) |
| `deploy\windows\issues.ps1 show <slug>` | 다시 공개 |
| `deploy\windows\issues.ps1 run [시간]` | 지금 바로 수집 (기본: 마지막 실행 이후 분량) |
| `deploy\windows\issues.ps1 debuts-run` | 지금 바로 신규 데뷔 소식 수집 |
| `deploy\windows\issues.ps1 debuts-list [개수]` | 데뷔 소식 목록 (번호 확인용, 숨김 포함) |
| `deploy\windows\issues.ps1 debuts-hide <번호>` / `debuts-show <번호>` | 데뷔 소식 숨김 / 다시 공개 |
| `deploy\windows\issues.ps1 registry-list` | 버튜버 확정 목록 (직접 방송 확인 대상) |
| `deploy\windows\setup-issues.ps1 -Disable` | 자동 수집 끄기 |
| `deploy\windows\setup-issues.ps1 -RenewToken` | 토큰 재발급 (만료·계정 변경 시) |

(모두 `powershell -ExecutionPolicy Bypass -File …` 로 실행)

숨긴 글의 출처 URL 은 계속 기록돼 있어서 같은 소식이 다시 올라오지 않는다.

## 설정값 (`server\.env`)

| 키 | 기본 | 설명 |
|---|---|---|
| `ISSUES_ENABLED` | `0` | `1` 이면 자동 수집 |
| `ISSUES_INTERVAL_MIN` | `180` | 수집 주기(분) |
| `ISSUES_MAX_PER_RUN` | `5` | 한 번에 올릴 최대 이슈 수 |
| `DEBUTS_ENABLED` | (`ISSUES_ENABLED` 따름) | `1` 이면 신규 데뷔 웹 수집 |
| `DEBUTS_INTERVAL_MIN` | `360` | 데뷔 수집 주기(분) |
| `DEBUTS_MAX_PER_RUN` | `15` | 1회 최대 데뷔 소식 수 |
| `CLAUDE_BIN` | (자동 탐색) | claude.exe 절대 경로 — 배포 PC 에선 필수 (setup-issues 가 기록) |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | 구독 토큰 (`claude setup-token`) |
| `CLAUDE_MODEL` | (계정 기본) | 모델 고정이 필요할 때 (예: `opus`, `sonnet`) |
| `CLAUDE_TIMEOUT_MS` | `900000` | 1회 실행 제한 (15분) |

값을 바꾼 뒤에는 `deploy\windows\restart.ps1`.

## 사용량 · 주의

- 1회 실행에 약 1~3분, 웹 검색 몇 번 정도. 하루 8회. **구독 사용 한도를 같은 계정의 다른 사용(Claude 앱·Claude Code)과 공유**한다.
  한도에 걸리면 그 회차는 실패로 기록되고 30분 뒤 다시 시도한다.
- 토큰 유효기간은 약 1년. 만료되면 `issues.ps1 status` 의 lastResult 에 인증 오류가 보인다 → `setup-issues.ps1 -RenewToken`.
- 구독 계정을 서비스 자동화에 쓰는 것이 이용 약관상 허용되는 범위인지는 계정 유형(개인/팀)에 따라 다를 수 있으니
  Anthropic 약관을 한 번 확인할 것. 필요하면 나중에 API 키 방식으로 바꿀 수 있다 (`server/src/issues/claude.ts` 만 교체).
- 개발 PC 에서 시험할 때는 토큰 없이 로그인된 계정으로 돈다:
  `cd server; npm run issues -- run 72` (DB 는 `DB_PATH` 로 임시 파일을 지정할 것).

## 문제 해결

| 증상 | 확인 / 조치 |
|---|---|
| `status` 의 lastResult 에 `claude 실행 파일을 찾을 수 없음` | `CLAUDE_BIN` 경로 확인 → `setup-issues.ps1` 재실행 |
| 인증 오류 (401, `Invalid API key`, `OAuth`) | `setup-issues.ps1 -RenewToken` |
| `git-bash` 관련 오류 | Git for Windows 설치 확인 → `setup-issues.ps1` 재실행 (`CLAUDE_CODE_GIT_BASH_PATH` 기록) |
| 시간 초과 | `CLAUDE_TIMEOUT_MS` 를 늘리거나 `ISSUES_MAX_PER_RUN` 을 줄이기 |
| 계속 `added: []` | 정상일 수 있음 (새 소식 없음 / 중복). `run 168` 로 1주일 범위 수집해 보기 |
| 이상한 글이 올라옴 | `issues.ps1 hide <slug>` → 반복되면 `collector.ts` 의 수집 기준 문구 보강 |
