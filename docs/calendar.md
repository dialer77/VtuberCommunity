# 기념일 캘린더 · 공식 SNS·팬아트 태그

버튜버 생일, 데뷔 n주년·n일, 데뷔 예정, 새 오리지널곡을 날짜별로 보여 줍니다. 2026-11-17 추가.

| 화면 | 내용 |
| --- | --- |
| `/calendar` | 한 달 달력(넓은 화면) · 날짜별 목록(좁은 화면). 종류 거르기(생일·데뷔 기념일·데뷔 예정·오리지널곡), 이전·다음 달 |
| 홈 "다가오는 기념일" | 오늘부터 7일 (노래 공개는 빼고 사람 기념일만) |
| 프로필 머리 | 🎂 생일 · 🌱 데뷔일, 30일 안의 기념일은 D-day. 검색 설명문에도 생일·데뷔일 |

## 재료

| 재료 | 어디서 |
| --- | --- |
| 생일(월-일)·데뷔일 | **웹 수집** — Claude(구독, 웹 검색)가 공식 프로필·위키·기사에서 찾음. 출처 없는 값은 버림 |
| 데뷔일 (웹 수집으로 못 찾았을 때) | 신규 데뷔 웹 수집(`debut_reports`)의 데뷔 완료 기록 |
| 데뷔 예정 | 신규 데뷔 웹 수집의 예정 기록 (채널을 알면 프로필로 연결) |
| 오리지널곡 공개 | 공식 채널 노래 모음(`yt_songs`)의 오리지널곡, 올라온 날 (`docs/youtube-api.md` 6장) |

- 데뷔 n일은 데뷔한 날을 1일로 셉니다 (100일 = 데뷔일 + 99일). 100·500·1,000·2,000·3,000일만.
- 2월 29일 생일·데뷔일은 윤년이 아닌 해에는 2월 28일에 표시합니다.
- 생일은 캐릭터(활동) 공식 생일의 월·일만 받습니다. 실제 생년·나이·실명 같은 사적인 정보는 받지 않습니다.

## 웹 수집

| 항목 | 값 |
| --- | --- |
| 대상 | 월간 시청시간 상위 `FACTS_TOP`(300) → 유튜브 전용 버튜버 → 확정 목록 |
| 주기 | `FACTS_INTERVAL_MIN`(720 = 12시간)마다 `FACTS_BATCH`(20)명. 찾을 사람이 없으면 Claude 를 부르지 않음 |
| 다시 찾기 | 둘 다 못 찾음 → 60일 뒤, 하나만 찾음 → 180일 뒤, 둘 다 찾음 → 다시 안 찾음 |
| 켜는 조건 | `FACTS_ENABLED=1` (기본은 `CLIPS_ENABLED`·`ISSUES_ENABLED` 를 따라감 — Claude 를 쓰는 기능이 켜져 있으면) |

개발 PC 시험(2026-11-17): 운영 상위 버튜버 14명 + 유튜브 전용 2명 → 101초, 생일 15명·데뷔일 16명. 출처는 대부분 나무위키.

YouTube API 는 쓰지 않습니다 (할당량 0).

## 공식 SNS·팬아트 태그 (2026-11-18)

프로필 머리에 공식 SNS 줄, **SNS·팬아트** 탭에 공식 링크·커뮤니티 바로가기·팬아트 태그·X 최근 게시물을 모읍니다.

| 재료 | 어디서 |
| --- | --- |
| 공식 SNS 링크 | 치지직 채널 정보의 `socialLinks`, SOOP 방송국 `link` (본인이 걸어 둔 링크). 10분마다 25명, 7일마다 다시 (`SOCIAL_SYNC=0` 이면 끔). 유튜브 매핑이 받을 때도 저장 |
| 링크 보충·팬아트 태그 | 생일·데뷔일 웹 수집(Claude)이 같은 호출에서 본인 공식 SNS 주소와 **공식 해시태그**(팬아트·클립·방송)를 찾음 |
| 커뮤니티 바로가기 | 유튜브 커뮤니티 탭(`/channel/UC…/posts`), 치지직 커뮤니티, 팬카페 — 정해진 주소 |
| X 최근 게시물 | X 공식 타임라인 위젯. **누를 때만** 불러오고, 로그인하지 않은 방문자에게는 X 가 고른 인기 게시물이 보이거나 안 보일 수 있음 |

- **팬아트·게시물은 옮겨 오지 않습니다.** 작가·버튜버의 저작물이고, X·인스타그램·커뮤니티 사이트는 긁어 오기를 약관으로 막고 있어서, 팬아트 태그를 누르면 X 의 그 태그 이미지 검색(로그인 필요)으로 연결합니다. 유튜브 커뮤니티 게시물은 API 가 없어 커뮤니티 탭으로 연결합니다.
- 나중에 로그인·신고 도구가 갖춰지면 작가가 직접 자기 팬아트 게시물 주소를 올리고 공식 임베드로 보여 주는 방식을 검토합니다.
- 개인정보처리방침 4항에 X 위젯 안내를 넣었습니다.

## 관리 (배포 PC)

```powershell
cd D:\01_Project\21_VtuberCommunity
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 status                      # 찾은 수 · 남은 대상 · 마지막 수집
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 list found 50               # 찾은 것 (최근 바뀐 순)
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 list missing 50             # 못 찾은 것 (상위부터)
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 show "버튜버 이름"            # 값과 출처
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 set "버튜버 이름" birthday 03-05      # 생일 고치기 (none = 없음으로 확정)
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 set "버튜버 이름" debut 2023-04-01    # 데뷔일 고치기 (none = 없음으로 확정)
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 auto "버튜버 이름"            # 운영자 입력 해제 → 다시 자동으로
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 run 20                      # 지금 바로 웹 수집 (Claude, 2~5분)
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 month 2026-12               # 그 달의 기념일
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 upcoming 14                 # 오늘부터 다가오는 기념일
```

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 links "버튜버 이름"                    # 프로필에 보일 링크·커뮤니티·태그
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 link-add "버튜버 이름" https://x.com/계정   # 공식 링크 추가 (link-del 로 빼기)
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 tag-add "버튜버 이름" "#리코아트" fanart     # 공식 해시태그 추가 (tag-del 로 빼기)
powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 social-auto "버튜버 이름"              # 링크·태그 수정 해제 → 다시 자동으로
```

운영자가 정한 값은 웹 수집이 덮어쓰지 않습니다. 이름이 여럿이면 `chzzk:<채널ID>` · `soop:<아이디>` · `youtube:UC…` 로 적습니다.
