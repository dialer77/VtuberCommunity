# 로그인 · 최애 · 방송 시작 알림 · 클립 참여 설정

사용자 데이터는 방송 수집 DB(SQLite)와 분리해 **Postgres** 에 저장합니다. 지금은 배포 PC 의 Postgres 를 임시로 쓰고, 나중에 외부 DB 로 옮깁니다.

아래 값이 모두 채워지기 전까지 사이트에는 로그인 버튼이 나타나지 않습니다. 코드를 먼저 배포해도 기존 기능에는 영향이 없습니다.

## 저장하는 정보

| 테이블 | 내용 |
| --- | --- |
| `users` | 구글 계정 식별값, 이름, 프로필 사진 (**이메일은 받지 않음**) |
| `favorites` | 최애 채널, 채널별 알림 설정 |
| `push_subscriptions` | 브라우저 푸시 구독 정보 |
| `notifications_sent` | 중복 알림 방지 기록 (30일 뒤 자동 삭제) |
| `clip_likes` | 클립 좋아요 (유튜브 영상 ID). 사용자당 5,000개 |
| `playlists` · `playlist_items` | 내 재생목록 (본인만 봄). 사용자당 30개, 목록당 200개 |
| `clip_tag_votes` | 클립 '어떤 순간' 태그 투표 (맞아요/아니에요) |
| `watch_history` | 본 클립 (영상 ID·본 시각). 여러 기기에서 같은 추천을 받으려고. 사용자당 최근 2,000개 |
| `user_clip_prefs` | 클립 취향 설정 (관심 없음·숨긴 키리누키 채널·덜 볼 주제·좋아하는 순간) |

좋아요 수와 태그 투표 **합계**는 서버가 수집 DB(SQLite `clip_stats`·`clip_vote_tags`)에도 복사해 목록·정렬·비슷한 클립 계산에 씁니다. 서버를 시작할 때마다 사용자 DB 기준으로 다시 맞추므로, 수집 DB 를 새로 만들어도 합계는 복구됩니다. 태그는 찬반이 2표 이상 차이 나면 분류에 반영됩니다 (Claude 태그는 빠지고, 없던 태그는 붙음).

이제 사용자 DB 에 직접 만든 데이터(재생목록 등)가 쌓이므로, 외부 DB 로 옮기기 전까지 정기 백업이 더 중요합니다 (아래 "외부 DB 로 옮기기"의 `pg_dump`).

탈퇴하면 해당 사용자의 데이터는 모두 바로 삭제됩니다.

## 1. 배포 PC — 사용자 DB 준비

RDP 로 접속해 **관리자 PowerShell** 에서 실행합니다. Postgres 관리자(`postgres`) 비밀번호를 물어봅니다.

```powershell
cd D:\01_Project\21_VtuberCommunity
powershell -ExecutionPolicy Bypass -File deploy\windows\setup-userdb.ps1
```

전용 계정 `vmoa_app` 과 DB `vmoa_users` 를 만들고, `server\.env` 에 접속 주소와 VAPID 키를 기록한 뒤 서버를 재시작합니다. 같은 Postgres 의 다른 DB 는 건드리지 않습니다. 끝에 `INTERNAL_SECRET` 값이 표시되니 3단계에서 씁니다.

- 포트가 5432 가 아니면 `-PgPort 5433`, psql 을 못 찾으면 `-Psql "C:\...\bin\psql.exe"` 를 붙입니다.
- `서버 패키지 ... 가 아직 없습니다` 가 나오면 자동 업데이트가 끝나도록 1~2분 뒤 다시 실행합니다.

## 2. Google 로그인 키 발급

[Google Cloud Console](https://console.cloud.google.com/) 에서 프로젝트를 만들거나 고른 뒤 **Google Auth Platform** 으로 들어갑니다.

1. **브랜딩**: 앱 이름 `버모아`, 지원 이메일 입력. 앱 도메인은 `https://vmoa.live`, 개인정보처리방침 `https://vmoa.live/privacy`, 서비스 약관 `https://vmoa.live/terms`.
2. **대상**: 사용자 유형 `외부`, 게시 상태를 **프로덕션**으로 전환합니다. 테스트 상태로 두면 등록한 테스트 사용자만 로그인할 수 있습니다.
3. **데이터 액세스**: `openid`, `.../auth/userinfo.profile` 만 사용합니다. 추가 범위는 필요 없습니다.
4. **클라이언트 → 클라이언트 만들기**: 유형 `웹 애플리케이션`.
   - 승인된 JavaScript 원본: `https://vmoa.live`
   - 승인된 리디렉션 URI: `https://vmoa.live/api/auth/callback/google`
5. 표시되는 **클라이언트 ID** 와 **클라이언트 보안 비밀번호** 를 3단계에서 씁니다.

## 3. Vercel 환경변수

Vercel 프로젝트 `vtuber-community` → Settings → Environment Variables 에 **Production** 으로 입력합니다.

| 이름 | 값 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | 2단계의 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | 2단계의 클라이언트 보안 비밀번호 |
| `NEXTAUTH_SECRET` | 임의의 긴 값. 생성: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `NEXTAUTH_URL` | `https://vmoa.live` |
| `INTERNAL_SECRET` | 1단계 끝에 표시된 값 (배포 PC 의 `server\.env` 와 동일해야 함) |

입력한 뒤 **재배포**해야 로그인 버튼이 나타납니다 (Deployments → 최신 배포 → Redeploy). 로그인 표시 여부는 빌드할 때 결정됩니다.

비밀 값은 채팅이나 저장소에 올리지 말고 Vercel 화면에 직접 입력하세요.

## 4. 동작 확인

1. https://vmoa.live 우측 위의 **로그인** → 구글 계정 선택.
2. LIVE 카드의 ☆ 를 눌러 최애 등록 → 홈 상단에 "내 최애 방송" 표시.
3. 프로필 사진 → **내 페이지** → "이 기기에서 알림 받기" 허용.
4. 최애가 방송을 시작하면 알림이 옵니다. 알림은 방송 시작 후 15분 이내에 감지된 경우에만, 같은 채널은 30분에 한 번만 보냅니다.
5. 클립 페이지(`/clips/<영상 ID>`)에서 ♡ 좋아요, **재생목록에 담기**, '어떤 순간' 태그 투표 → 내 페이지에 "내 재생목록"·"좋아요한 클립" 표시, 재생목록의 **전체 재생**으로 이어서 재생.

아이폰은 Safari 공유 메뉴의 **홈 화면에 추가** 로 설치한 앱에서만 알림을 켤 수 있습니다 (iOS 16.4 이상).

## 외부 DB 로 옮기기

접속 주소만 바꾸면 되도록 만들어 두었습니다. 알림 키(VAPID)는 그대로 둡니다 — 바꾸면 모든 기기의 구독이 끊어집니다.

```powershell
# 배포 PC 에서 백업 (경로는 설치된 Postgres 에 맞게)
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h localhost -U postgres -Fc -f vmoa_users.dump vmoa_users

# 새 DB 로 복원 (소유자·권한은 새 DB 계정 기준)
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --no-owner --no-privileges -d "<새 DB 접속 주소>" vmoa_users.dump
```

`server\.env` 의 `USER_DATABASE_URL` 을 새 주소로 바꾸고 (`?sslmode=require` 필요 시 추가) `deploy\windows\restart.ps1` 을 실행합니다.

옮기기 전까지는 배포 PC 디스크 장애에 대비해 위 `pg_dump` 백업을 가끔 다른 곳에 보관하세요.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| 로그인 버튼이 안 보임 | Vercel 환경변수 5개 입력 후 재배포했는지 |
| 로그인 시 `redirect_uri_mismatch` | Google 클라이언트의 리디렉션 URI 가 위와 정확히 같은지 |
| 로그인은 되는데 최애 저장 실패 | `INTERNAL_SECRET` 이 양쪽에서 같은지, 배포 PC 에서 `setup-userdb.ps1` 을 실행했는지 |
| "알림 기능이 아직 준비되지 않았어요" | `server\.env` 의 VAPID 키, `/api/push/public-key` 의 `enabled` |
