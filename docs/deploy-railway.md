# 백엔드 Railway 배포 가이드

> 목적: `server/`(수집기 + SQLite + API)를 Railway에 상주 배포 → 주소 고정,
> PC 불필요, 자동 재시작. 이후 Vercel `BACKEND_URL`을 한 번만 설정하면 끝.

## 사전 준비 (코드는 이미 반영됨)
- 서버가 호스팅이 주는 `PORT`를 읽음 (config.ts)
- `tsx`를 runtime 의존성으로 (프로덕션 실행)
- SQLite는 `DB_PATH`로 경로 지정 → **볼륨**에 저장해 영구 보존

## 단계

### 1. 프로젝트 생성
1. [railway.app](https://railway.app) 가입 (GitHub 로그인 권장). 결제수단 등록이 필요할 수 있음(무료 크레딧 제공).
2. **New Project → Deploy from GitHub repo → `VtuberCommunity`** 선택.

### 2. 서비스 설정 (모노레포라 루트 지정 필수)
서비스 → **Settings**:
- **Root Directory: `server`** ← 꼭 설정 (이거 안 하면 빌드 실패)
- **Start Command**: `npm start` (보통 자동 감지됨)
- Build는 Nixpacks가 `npm install` 자동 수행

### 3. 볼륨 추가 (SQLite 영구 저장)
서비스 → **Variables/Settings → Volumes → New Volume**:
- **Mount path: `/data`**
(볼륨이 없으면 재배포 때마다 수집 데이터가 초기화됨)

### 4. 환경변수 (Variables)
| Key | Value |
|---|---|
| `DB_PATH` | `/data/vmoa.db` |
| `CHZZK_PAGES` | `8` (선택) |
| `RETENTION_DAYS` | `7` (선택) |

`PORT`는 Railway가 자동 주입하므로 넣지 않는다.

### 5. 배포 & 공개 도메인
1. 배포가 끝나면 서비스 → **Settings → Networking → Generate Domain** 클릭.
2. `https://xxxx.up.railway.app` 주소가 생김.
3. 확인: `https://xxxx.up.railway.app/health` → `{"ok":true,...}`
   `https://xxxx.up.railway.app/api/coins?limit=3` → 코인 데이터

### 6. Vercel 연결 (한 번만, 영구)
Vercel → Settings → Environment Variables:
- `BACKEND_URL` = `https://xxxx.up.railway.app`
- Save → Deployments → Redeploy

이후 **주소가 고정**이라 다시 건드릴 필요 없음. PC/터널/ngrok 전부 불필요.

## 참고
- 데이터 수집은 Railway 서버에서 24/7 돌아감(치지직·SOOP 폴링).
- 무료 크레딧 소진 후에는 소액 과금이 발생할 수 있음(임시 배포엔 트라이얼로 충분).
- 로그는 Railway 서비스 → Deployments/Logs 에서 확인.
- 로컬 개발은 그대로: `cd server && npm start` (기본 4000).
