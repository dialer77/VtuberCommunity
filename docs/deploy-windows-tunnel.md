# 백엔드 배포 — Windows PC + Cloudflare Tunnel

> `server/`(수집기 + SQLite + API)를 **사무실/집의 Windows PC**에서 상시 실행하고,
> Cloudflare Tunnel 로 `https://api.vmoa.live` 에 공개한다. 웹(`web/`)은 Vercel 그대로.
> 개발 PC 와 배포 PC 가 떨어져 있어도 **GitHub push 만 하면 배포 PC 가 알아서 업데이트**한다.

## 왜 이 방식인가

| | Fly.io / Railway | Windows PC + Tunnel |
|---|---|---|
| 수집 IP | 해외 → **SOOP 차단 위험** (Railway 에서 실제 발생) | 국내 → 문제 없음 |
| 비용 | 종량제 (카드 필요) | 무료 (전기료) |
| DB | 볼륨 따로 설정 | 로컬 디스크 그대로 |
| 약점 | — | PC 가 꺼지면 멈춤 (부팅 시 자동 복구) |

## 구성

```
[개발 PC]                         [GitHub]                    [배포 PC (Windows 10)]
 코드 수정 → git push ─────────▶  main  ◀── 5분마다 확인 ───  작업 스케줄러 'VMOA-Server' (SYSTEM)
                                    │                          └ run-server.ps1 (감독)
                                    ▼                              ├ server (node) :4000
                              Vercel 자동 배포 (web)                └ 새 커밋 → pull → 재시작
                                    │                          cloudflared (Windows 서비스)
                                    └── BACKEND_URL ──▶ https://api.vmoa.live ─┘
```

- 배포 PC 는 **나가는 연결만** 쓴다 (GitHub pull, Cloudflare 터널). 포트포워딩·공인 IP 불필요.
- 저장소가 public 이라 배포 PC 에 GitHub 인증이 필요 없다.
- GitHub Actions self-hosted runner 는 쓰지 않는다 (public 저장소에선 fork PR 코드가 배포 PC 에서 실행될 위험).

## 스크립트 (`deploy/windows/`)

| 파일 | 역할 |
|---|---|
| `setup.ps1` | 1회 설치 (재실행해도 안전) |
| `run-server.ps1` | 상주 감독 — 서버 실행·크래시 재시작·자동 업데이트 (작업 스케줄러가 실행) |
| `status.ps1` | 상태 확인 (프로세스·헬스체크·터널·버전·로그) |
| `restart.ps1` | 서버 재시작 (`-Full`: 감독까지) |
| `uninstall.ps1` | 제거 (DB·`.env` 는 남김, `-RemoveTunnel`: 터널 서비스도) |

자동 업데이트 규칙 (`run-server.ps1`):

| push 된 변경 | 배포 PC 동작 |
|---|---|
| `server/**` | 서버 중지 → pull → 재시작 (수 초 다운) |
| `server/package*.json` | 위 + `npm ci` |
| `web/**`, `docs/**` 등만 | pull 만 (재시작 없음) |
| `deploy/windows/**` | pull 후 감독 종료 → 작업 스케줄러가 5분 안에 새 버전으로 재실행 |

---

## 1. Cloudflare — 터널 (✅ 2026-11-04 개발 PC 에서 생성 완료)

개발 PC 에서 **브라우저 로그인 한 번 + CLI** 로 만들어 둔 상태. 다시 할 필요 없음.

| 항목 | 값 |
|---|---|
| 터널 | `vmoa` (`9ee8f731-a661-4a59-82e7-07c9c7f6242a`, CLI 생성 = 설정은 로컬 config.yml) |
| DNS | `api.vmoa.live` CNAME → `<터널ID>.cfargotunnel.com` (Proxied) |
| 인증 파일 | 개발 PC `server\data\seed\vmoa-tunnel.json` (git 제외 — **비밀번호처럼 취급**) |
| 관리 도구 | 개발 PC `tools\cloudflared.exe` + 로그인 인증서 `$env:USERPROFILE\.cloudflared\cert.pem` |

처음부터 다시 만들 때 (개발 PC, 저장소 루트):

```powershell
tools\cloudflared.exe tunnel login                       # 브라우저 → vmoa.live 선택 → Authorize
tools\cloudflared.exe tunnel create vmoa                 # $env:USERPROFILE\.cloudflared\<ID>.json 생성
tools\cloudflared.exe tunnel route dns vmoa api.vmoa.live
Copy-Item "$env:USERPROFILE\.cloudflared\<ID>.json" server\data\seed\vmoa-tunnel.json
```

> ⚠️ 같은 터널을 **두 PC 에서 동시에 실행하지 말 것** — 트래픽이 양쪽으로 나뉘어, 서버가 없는 쪽으로 간 요청은 502 가 된다.
> (개발 PC 에서 테스트로 `tunnel run` 했다면 반드시 끄기)

## 2. 배포 PC — 설치 (원격 데스크톱 접속 후)

**관리자 PowerShell** 을 연다 (시작 메뉴 → PowerShell 우클릭 → 관리자 권한으로 실행).

```powershell
# Git 이 없으면 먼저 설치 (설치 후 PowerShell 창을 새로 열 것)
winget install --id Git.Git -e

# 저장소 받기 — 사용자 폴더가 아닌 고정 위치 권장
git clone https://github.com/dialer77/VtuberCommunity.git C:\vmoa
cd C:\vmoa
```

**파일 2개 옮기기** — 개발 PC 의 `server\data\seed\` 에서 원격 데스크톱 창으로 **복사 → 배포 PC 바탕화면에 붙여넣기**:

| 파일 | 용도 |
|---|---|
| `vmoa-seed.db` | 기존 채널 목록 4천여 개 — 없으면 처음 보는 채널이 전부 "신규 데뷔"로 잡힘 |
| `vmoa-tunnel.json` | 터널 인증 — setup 이 `C:\ProgramData\vmoa\cloudflared\` 로 옮기고 권한을 잠근다 |

설치 실행:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\setup.ps1 `
  -SeedDb "$env:USERPROFILE\Desktop\vmoa-seed.db" `
  -TunnelCredFile "$env:USERPROFILE\Desktop\vmoa-tunnel.json"
```

설치가 끝나면 바탕화면의 두 파일은 지워도 된다 (특히 `vmoa-tunnel.json`).

setup 이 하는 일: Node 24+ 확인(없으면 winget 설치) → `server\.env` 생성(`INTERNAL_SECRET` 자동 생성)
→ 시드 DB 복사 → `npm ci` → 절전 끔 → 작업 스케줄러 등록·시작 → cloudflared 설치·터널 서비스 등록 → 헬스체크 (로컬 + `https://api.vmoa.live`).

마지막에 출력되는 **`INTERNAL_SECRET`** 값을 복사해 둔다 (3단계에서 사용).

## 3. Vercel — 웹 도메인 + 백엔드 주소 연결 (한 번만)

**도메인 연결** — Vercel → 프로젝트 → **Settings → Domains** → `vmoa.live` 추가 (www 리다이렉트 제안은 수락).
Vercel 이 보여주는 DNS 레코드를 Cloudflare → `vmoa.live` → **DNS → Records** 에 그대로 추가:

| 이름 | 종류 / 값 | 프록시 |
|---|---|---|
| `vmoa.live` (`@`) | Vercel 화면에 나온 A 레코드 | **DNS only (회색 구름)** |
| `www` | Vercel 화면에 나온 CNAME | **DNS only (회색 구름)** |
| `api` | 터널이 자동 생성 — 건드리지 말 것 | Proxied (주황 구름) |

- Vercel 레코드를 주황 구름(Proxied)으로 두면 인증서 발급·캐시가 꼬일 수 있으므로 **반드시 회색**.
- Vercel Domains 화면에 `Valid Configuration` 이 뜨면 완료 (HTTPS 인증서 자동 발급, 수 분).

**환경변수** — **Settings → Environment Variables** (Production):

| Key | Value |
|---|---|
| `BACKEND_URL` | `https://api.vmoa.live` |
| `SITE_URL` | `https://vmoa.live` (sitemap·robots·OG·canonical 에 사용) |
| `INTERNAL_SECRET` | setup 출력값 (계정/즐겨찾기 기능용 — 지금 넣어둬도 무방) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | (선택) `contact@vmoa.live` — Cloudflare **Email Routing** 으로 개인 메일에 전달 가능 |

저장 → **Deployments → Redeploy**.

## 4. 확인

- 브라우저: `https://vmoa.live` → 사이트 (www.vmoa.live 는 자동으로 vmoa.live 로 이동)
- 브라우저: `https://api.vmoa.live/health` → `{"ok":true,...}`
- 브라우저: `https://api.vmoa.live/api/lives` → 치지직·SOOP 라이브 목록
- 배포 PC: `powershell -ExecutionPolicy Bypass -File deploy\windows\status.ps1`
- 웹 사이트에서 **SOOP 방송이 보이는지** 확인 — 웹은 백엔드가 안 되면 치지직 직접 조회로 폴백하므로,
  치지직만 보이면 백엔드 연결이 안 된 것.

---

## 운영

**코드 업데이트**: 개발 PC 에서 `git push` 만 하면 끝. 배포 PC 는 5분 안에 반영 (`status.ps1` 의 "코드 버전"으로 확인).

**설정(`.env`) 변경**: 배포 PC 에서 `C:\vmoa\server\.env` 수정 → `restart.ps1` 실행. (`.env` 는 git 에 안 올라감)

**파일 위치** (배포 PC, 전부 git 무시 대상):

| 경로 | 내용 |
|---|---|
| `server\.env` | 운영 설정 (포트·폴링 간격·시크릿 등) |
| `server\data\vmoa.db` | 자체 DB (스냅샷은 7일 보존, 채널 목록은 영구) |
| `server\data\logs\supervisor.log` | 감독 로그 (시작·업데이트·크래시) |
| `server\data\logs\server-*.log` | 서버 로그 (실행마다 1개, 최근 10회분 보관) |
| `server\data\deploy.json` | setup 이 기록한 node/git 경로 |

**주의**
- 배포 PC 의 `C:\vmoa` 에서 **코드를 직접 수정하지 말 것** — 자동 업데이트(fast-forward pull)가 막힌다.
  막히면 `supervisor.log` 에 "pull 실패" 가 남음 → `git status` 로 확인 후 `git checkout -- .` 로 되돌리기.
- Windows 업데이트 재부팅은 괜찮다 — 작업 스케줄러가 **로그인 없이** 부팅 시 자동 시작.
  다만 재부팅 동안은 수집이 끊기므로 *설정 → 업데이트 → 사용 시간* 을 운영 시간 밖으로 잡아둘 것.
- 터널 인증 파일(`vmoa-tunnel.json`)은 비밀번호와 같다. 노출되면 개발 PC 에서 터널을 지우고(`tools\cloudflared.exe tunnel delete -f vmoa`) 1장 절차로 다시 만든 뒤 setup 재실행.

## 문제 해결

| 증상 | 확인 / 조치 |
|---|---|
| `status.ps1` 에서 서버 "실행 중 아님" | `supervisor.log` · `server-*.err.log` 확인 → 원인 수정 후 `restart.ps1` |
| 로컬 OK, `https://api.vmoa.live` FAIL | 배포 PC: `Get-Service cloudflared` 가 Running 인지, `C:\ProgramData\vmoa\cloudflared\config.yml` 의 포트. 개발 PC: `tools\cloudflared.exe tunnel info vmoa` 로 연결(CONNECTIONS) 확인 |
| 브라우저에선 API OK, 웹에는 치지직만 보임 | Vercel `BACKEND_URL` 오타/Redeploy 누락. 또는 Cloudflare **Security → Bots → Bot Fight Mode** 가 Vercel 서버의 요청을 막는 경우 — Security Events 에서 차단 기록 확인, 있으면 Bot Fight Mode 끄기 (Free 플랜은 호스트별 예외 불가) |
| 사내망에서 터널이 안 붙음 | 방화벽이 cloudflared 의 아웃바운드 7844 포트(QUIC/TCP)를 막는지 IT 확인 |
| 업데이트가 반영 안 됨 | `supervisor.log` 의 `git fetch 실패` / `pull 실패` 확인 |
| 감독 스크립트를 고친 직후 바로 적용하고 싶음 | `restart.ps1 -Full` |
