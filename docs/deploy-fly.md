# 백엔드 Fly.io 배포 가이드

> `server/`(수집기 + SQLite + API)를 Fly.io에 상주 배포. 도쿄 리전, 24/7 유지,
> SQLite는 볼륨에 영구 저장. 소규모라 월 ~$2 수준(종량제, 카드 필요).

배포 설정 파일은 이미 `server/`에 있음: `Dockerfile`, `fly.toml`, `.dockerignore`.

## 1. flyctl 설치 (Windows PowerShell)
```powershell
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
```
설치 후 새 터미널에서 `fly version` 확인.

## 2. 로그인 / 가입
```bash
fly auth signup   # 또는 fly auth login
```
(카드 등록이 필요할 수 있음 — 종량제)

## 3. 앱 생성 (배포는 아직 X)
`server/` 폴더에서:
```bash
cd server
fly launch --no-deploy
```
- 기존 `fly.toml` 을 쓸지 물으면 **Yes(사용)**.
- **앱 이름**: `vmoa-server`가 이미 있으면(전역 고유) `vmoa-server-본인닉` 처럼 유니크하게. → 이 이름이 주소가 됨: `https://<앱이름>.fly.dev`
- 리전: **nrt(도쿄)** 유지.
- Postgres/Redis 붙일지 물으면 **No**.

## 4. 볼륨 생성 (SQLite 영구 저장)
```bash
fly volumes create vmoa_data --region nrt --size 1
```
- 이름 `vmoa_data` 은 `fly.toml` 의 `[[mounts]] source` 와 **일치해야** 함.
- 리전도 `nrt` 로 맞출 것.

## 5. 시크릿 주입 (유저 API 보호용)
```bash
fly secrets set INTERNAL_SECRET=여기에_생성한_값
```
생성: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 6. 배포
```bash
fly deploy
```
로그에 `스케줄러 시작` / `API http://...` 뜨면 성공.

## 7. 확인
```bash
fly status
```
- 주소: `https://<앱이름>.fly.dev`
- `https://<앱이름>.fly.dev/health` → `{"ok":true}`
- `https://<앱이름>.fly.dev/api/coins?limit=3` → 데이터

## 8. Vercel 연결 (한 번만)
Vercel → Settings → Environment Variables:
- `BACKEND_URL` = `https://<앱이름>.fly.dev`
- (계정 기능 시) `INTERNAL_SECRET` = 5번과 동일 값
- Save → **Redeploy**

## 참고
- `auto_stop_machines=false` + `min_machines_running=1` 로 **항상 켜둠**(폴링 안 멈추게).
- 메모리 256MB에서 OOM 나면 `fly.toml` 의 `memory = "512mb"` 로 올리고 재배포.
- 로그: `fly logs`
- 재배포: 코드 수정 후 `fly deploy` (또는 GitHub 연동 시 자동).
- 비용: `fly dashboard` 에서 사용량 확인.
