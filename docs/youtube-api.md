# YouTube Data API 키 발급 · 등록

공식 채널 연동(2단계)과 키리누키 수집(3단계)에 씁니다. 키는 **배포 PC 의 `server\.env` 에만** 둡니다. 웹(Vercel)에는 넣지 않습니다.

무료입니다. 결제 계정을 연결하지 않아도 됩니다.

## 1. 키 발급 (Google Cloud Console)

[Google Cloud Console](https://console.cloud.google.com/) 에서 진행합니다.

1. **프로젝트**: 구글 로그인용으로 만든 프로젝트를 그대로 고릅니다. YouTube 정책상 서비스 하나에는 API 프로젝트 하나만 써야 합니다 (III.D.1).
2. **API 사용 설정**: API 및 서비스 → 라이브러리 → `YouTube Data API v3` 검색 → **사용**.
3. **키 만들기**: API 및 서비스 → 사용자 인증 정보 → **+ 사용자 인증 정보 만들기** → **API 키**.
4. **키 제한** (만든 키의 수정 화면):
   - **API 제한사항**: `키 제한` → `YouTube Data API v3` 만 선택.
   - **애플리케이션 제한사항**: `없음`. 서버에서 호출하므로 `웹사이트(HTTP 리퍼러)` 를 고르면 동작하지 않습니다. 배포 PC 공인 IP 가 고정이라면 `IP 주소` 로 제한해도 됩니다.
   - 저장.
5. 키를 복사합니다 (보통 `AIza` 로 시작하는 39자).

키를 채팅에 붙여넣거나 저장소에 커밋하지 마세요. 저장소가 공개라서 노출되면 바로 도용됩니다 (정책상으로도 공개 프로젝트에 키를 넣으면 안 됨, III.D.1).

## 2. 배포 PC 에 등록

RDP 로 배포 PC 에 접속해서 진행합니다.

1. 메모장에 키 한 줄을 붙여넣고 **바탕화면에 `youtube-key.txt`** 로 저장합니다.
2. **관리자 PowerShell** 에서 실행합니다.

```powershell
cd D:\01_Project\21_VtuberCommunity
powershell -ExecutionPolicy Bypass -File deploy\windows\setup-youtube.ps1
```

스크립트가 바탕화면의 키 파일을 읽어 YouTube 에 시험 요청을 1회 보내고, 키와 제한 설정을 확인한 뒤 `server\.env` 에 저장하고 서버를 재시작합니다. 등록에 성공하면 **키 파일은 자동으로 지웁니다.** 실패하면 원인(사용 설정 안 됨, 리퍼러 제한, IP 제한 등)을 알려주고 키 파일은 남겨 둡니다.

- 키 파일이 없으면 직접 입력을 받습니다. 붙여넣기는 마우스 오른쪽 클릭으로 합니다 (Ctrl+V 는 안 될 수 있음).
- 다른 위치의 파일: `-KeyFile "경로"` / 클립보드: `-FromClipboard`
- 키 교체: 새 키로 같은 방법을 반복
- 연동 끄기: `-Disable`

## 3. 공식 채널 연동 (2단계)

키를 등록하면 서버가 재시작되면서 자동으로 켜집니다. 따로 할 일은 아래 **확인이 필요한 채널**을 가끔 정리하는 것뿐입니다.

### 하는 일

| 작업 | 주기 | 할당량 |
| --- | --- | --- |
| **채널 매핑** — 치지직 채널 정보의 `socialLinks`, SOOP 방송국의 `link` 에 걸린 유튜브 링크로 공식 채널 추정. 월간 시청시간 상위 200명 → 지금 방송 중 → 확정 목록 순 | 10분마다 30명. 자동 연결은 7일, 링크 없음은 3일마다 다시 확인 | `@핸들` 변환 1단위 (`channels.list forHandle`) |
| **최신 영상** — 채널 RSS 15개 (제목·게시 시각) | 최근 30일 안에 유튜브 라이브가 있던 채널 10분, 나머지 60분 | 0 |
| **영상 상세** — 라이브 여부·예정 시각·길이 | 새 영상 발견 시, 방송 중·15분 안에 시작할 예정 영상은 매분 | 50개당 1단위 (`videos.list`) |
| **30일 정리** — API 로 받은 값은 20일이 지나면 다시 받고, 30일이 넘은 값은 지움 | 30분·6시간마다 | 50개당 1단위 |

하루 사용량은 보통 2,000단위 아래입니다 (방송 중 확인이 하루 최대 1,440). `YOUTUBE_DAILY_BUDGET`(기본 8,000)의 80% 를 넘으면 방송 중 확인만 계속하고, YouTube 가 할당량 초과를 알려 오면 태평양 자정까지 멈춥니다.

화면에서는 프로필의 **공식 영상** 탭(사이트 안 플레이어로 재생)과, 유튜브에서 방송 중이면 LIVE 목록·프로필 머리에 나옵니다. 유튜브 시청자 수는 LIVE 카드에만 보이고 **홈의 시청자 합계·랭킹·데뷔 감지에는 들어가지 않습니다** (수집 스냅샷과 따로 저장).

### 매핑 확인·수정 (배포 PC)

자동 추정은 링크 이름으로 고릅니다. 다시보기·클립·ASMR·노래 채널, 다른 이름(소속사·다른 멤버)이 붙은 링크는 감점하고, 동점이거나 보조 채널만 있으면 **확인필요**로 남겨 운영자에게 넘깁니다.

```powershell
cd D:\01_Project\21_VtuberCommunity
powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 status            # 상태별 개수 · 오늘 할당량 · 방송 중
powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 pending           # 확인이 필요한 채널과 후보
powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 list auto 50      # 자동 연결 결과 (상위부터)
powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 show "구슬요"
powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 set "구슬요" https://www.youtube.com/@beadyo97
powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 none "모라라"      # 공식 채널 없음 (자동 연결 안 함)
powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 auto "모라라"      # 확정 해제 → 다시 자동 추정
```

- 대상은 버튜버 이름 또는 `chzzk:<채널ID>` · `soop:<아이디>`. 같은 이름이 여럿이면 후보를 보여 줍니다.
- 주소는 `youtube.com/channel/UC…`, `youtube.com/@핸들`, `UC…` 모두 됩니다. `/c/`·`/user/` 예전 주소는 채널 페이지의 `channel/UC…` 주소로 적습니다.
- `set`·`none` 으로 정한 것은 자동 확인이 덮어쓰지 않습니다. 바로 사이트에 반영됩니다.

| 상태 | 뜻 |
| --- | --- |
| 자동 (`auto`) | 링크로 자동 연결. 프로필에 "자동 추정이라 틀릴 수 있어요" 표시 |
| 확정 (`manual`) | 운영자가 지정 |
| 없음 (`none`) | 운영자가 "공식 채널 없음/연결 안 함"으로 지정 |
| 확인필요 (`pending`) | 후보가 여럿, 보조 채널만 있음, 예전 주소, `@핸들` 변환 실패, 다른 버튜버와 같은 채널(소속사·그룹 공용 채널일 수 있음 — 맞는 한 명만 `set`) |
| 링크없음 (`nolink`) | 채널 정보에 유튜브 링크가 없음 — 공식 채널이 있으면 `set` 으로 지정 |

## 4. 키리누키 수집·분류 (3단계)

팬이 방송을 잘라 올린 클립을 모아 **누가 · 무엇을 · 어떤 순간 · 한 줄 요약**으로 분류하고, 클립마다 같은 버튜버·다른 버튜버의 비슷한 클립을 이어 줍니다. 화면은 `/clips`(모음·태그별), `/clips/<영상 ID>`(분류·비슷한 클립), 프로필의 **키리누키** 탭(클립으로 본 특징 태그 포함).

켜는 조건: `CLIPS_ENABLED=1`(기본값은 `ISSUES_ENABLED` 를 따라감) + YouTube 키. 분류는 이슈 수집과 같은 Claude 구독 토큰을 씁니다.

| 작업 | 주기 | 할당량 |
| --- | --- | --- |
| **채널 찾기** — 월간 시청시간 상위 150명 순서로 "이름 키리누키" 검색 (`search.list`). 결과에서 **채널 ID 만** 씀. 같은 채널 영상이 2개 이상이거나 채널 이름이 클립 채널 같으면 등록. 공식 채널·다시보기 채널은 제외. 버튜버당 30일에 한 번 | 15분마다 1회, 하루 `CLIPS_SEARCH_PER_DAY`(기본 20)회 | 1회 100단위로 셈 (하루 최대 2,000) |
| **새 클립** — 키리누키 채널 RSS | 채널마다 3시간 | 0 |
| **분류** — Claude 헤드리스(구독, 도구 없음)가 RSS 제목·설명만 보고 분류. 분류가 끝나면 설명은 지움 | 30분마다 50개 (대기 클립이 있을 때만) | 0 |
| **남아 있는지 확인** — RSS 에서 빠진 지 20일 넘은 클립을 `videos.list` 로 확인, 없어졌으면 삭제. 30일 넘게 확인 못 한 클립도 삭제 | 30분마다 | 50개당 1단위 |

- **정책**: 분류 입력은 RSS 제목·설명뿐입니다 (API 로 받은 데이터로 파생 데이터를 만들지 않음, III.E.4.h). 화면의 분류·요약에는 "버모아 분류 — YouTube 정보가 아님"을 표시합니다.
- **자동 차단**: 자동 등록 채널에서 분류한 영상이 8개 이상이고 70% 넘게 클립이 아니면 차단합니다. 나중에 공식 채널로 연결된 채널도 빠집니다.
- **비슷한 클립**: 주제(게임 이름 등)·카테고리·순간 태그가 겹치는 정도 + 제목·요약의 글자 2-gram 유사도. 서버 안에서 계산합니다 (별도 모델·패키지 없음).

### 관리 (배포 PC)

```powershell
cd D:\01_Project\21_VtuberCommunity
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 status            # 채널·클립 개수, 오늘 검색 횟수, 마지막 분류
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 channels auto      # 자동 등록 채널 (클립/클립 아님 개수 포함)
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 recent 30          # 최근 분류 결과 확인
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 block "채널 이름"   # 클립 채널이 아니면 차단
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 add https://www.youtube.com/@채널 "유즈하 리코"   # 아는 키리누키 채널 직접 추가
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 enrich              # 예전 분류 보강 1회 (대표 순간·주제 통일·사건). 새 클립이 없으면 30분마다 자동
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 topics 80           # 많이 쓰인 주제 이름 — 같은 게임이 다른 이름으로 갈렸는지
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 alias 마크 마인크래프트   # 주제 이름 통일 (기존 클립에도 반영)
powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 events 14           # 최근 사건·밈 이름과 클립 수
```

분류 2판(2026-11-12): 대표 순간 1개 + 보조 순간, 주제 정식 이름(이미 쓰는 이름·별칭 사전), 사건·밈 이름, 원본 방송(설명의 치지직·SOOP 다시보기 링크·날짜). 분류 입력은 계속 RSS 제목·설명뿐이고, 기존 클립 보강은 RSS 로 만든 기존 분류(요약·주제)와 videos.list 로 바뀐 적 없는 제목만 쓴다.

## 할당량

| 항목 | 하루 기본 한도 |
| --- | --- |
| `search.list` (검색) | **100회** (별도 한도) |
| 그 밖의 조회 (`videos.list`, `channels.list`, `playlistItems.list` 등) | 합계 **10,000 단위**, 호출당 보통 1 |

- 초기화: 태평양 시간 자정 (한국 기준 오후 4시, 서머타임 해제 시 오후 5시).
- 실패한 요청도 1 단위를 씁니다.
- 영상 50개까지는 `videos.list` 한 번(1 단위)에 조회됩니다.

버모아는 다음처럼 아껴 씁니다.

- 새 영상 발견은 채널 RSS(`youtube.com/feeds/videos.xml?channel_id=…`)로 합니다. 할당량을 쓰지 않습니다.
- 라이브 여부, 조회수 같은 상세 정보만 `videos.list` 로 50개씩 묶어 확인합니다.
- `search.list` 는 하루 100회뿐이라 새 키리누키 채널을 찾는 데에만 씁니다.

한도가 모자라면 Cloud Console 의 할당량 화면에서 증설을 신청할 수 있습니다. 이때 YouTube API 준수 감사를 받습니다.

## 지켜야 할 정책 (YouTube API Services 개발자 정책)

전문: https://developers.google.com/youtube/terms/developer-policies

| 정책 | 버모아의 대응 |
| --- | --- |
| 이용약관에 YouTube 서비스 약관 링크와 동의 문구 (III.A.1) | `/terms` 6항 |
| 개인정보처리방침에 YouTube API 사용과 Google 개인정보처리방침 링크 (III.A.2) | `/privacy` 4항 |
| API 로 받은 데이터는 30일 안에 갱신하거나 삭제 (III.E.4) | 저장한 영상 정보는 30일이 지나기 전에 다시 조회해 갱신 |
| 여러 채널의 API 데이터를 합산하지 않음 (III.E.2) | 유튜브 조회수·시청자 수를 합계나 순위 집계에 넣지 않음 |
| API 데이터로 새 지표·파생 데이터를 만들지 않음. 자체 정보는 YouTube 정보가 아님을 표시 (III.E.4.h) | 분류·태그·투표는 RSS·사용자 참여 기반 자체 정보로 만들고 "버모아 분류" 로 표시 |
| 플레이어를 고치거나 광고를 막지 않음 (III.I) | 공식 임베드 그대로 사용. 재생 버튼을 누르기 전에는 불러오지 않음 |
| 90일 동안 쓰지 않으면 접근이 제한될 수 있음 (III.D.4) | 키를 등록하면 상시 사용 |
