# 검색엔진 등록 — Google Search Console (+ 네이버 서치어드바이저)

> 대상: `https://vmoa.live` (웹, Vercel). 한국 사용자 대상이라 네이버 등록도 권장.

## 사이트 쪽 준비 상태

| 항목 | 상태 |
|---|---|
| `https://vmoa.live/robots.txt` | 전체 허용 + `Sitemap: https://vmoa.live/sitemap.xml` |
| `https://vmoa.live/sitemap.xml` | 요청 시 생성 — 메인·이슈·데뷔·랭킹·소개/문의/개인정보 + **이슈 상세 전부(lastModified=게시 시각)**. 새 이슈가 올라오면 자동 포함 |
| 대표 주소 | `vmoa.live` 하나로 통일 — `www.vmoa.live` 는 308 리다이렉트 |
| 메타데이터 | 페이지별 title/description, `lang="ko"`, OG·트위터 카드, 이슈 상세는 canonical·대표 이미지·Article JSON-LD |
| 검색 제외 | `/coins`(베타) `noindex` · `api.vmoa.live`(JSON API) 응답 전체 `X-Robots-Tag: noindex` · 없는 페이지 `noindex` |
| 소유 확인 태그 | 필요 시 Vercel 환경변수 `GOOGLE_SITE_VERIFICATION` / `NAVER_SITE_VERIFICATION` 로 `<meta>` 출력 |

## 1. Google Search Console 등록

1. https://search.google.com/search-console 접속 (사이트를 관리할 Google 계정)
2. **속성 추가 → 도메인** 선택 → `vmoa.live` 입력 → 계속
   (도메인 속성 = `vmoa.live`·`www`·하위 도메인·http/https 를 한 번에. URL 접두어 속성보다 권장)
3. **소유권 확인 (DNS TXT)** — 둘 중 편한 쪽:
   - **자동**: 화면에 Cloudflare 로 확인하는 버튼(“인증 시작”)이 보이면 클릭 → Cloudflare 로그인 → 승인 → 끝
   - **수동**: 화면의 `google-site-verification=…` 값을 복사 → Cloudflare DNS 에 TXT 레코드 추가
     (이름 `@`, 값 그대로) → Search Console 에서 **확인**.
     개발 PC 의 Claude 에게 값을 주면 Cloudflare API 로 대신 추가할 수 있다.
4. 확인되면 왼쪽 **Sitemaps** → `https://vmoa.live/sitemap.xml` 입력 → **제출**
5. 상단 **URL 검사** → `https://vmoa.live/` 와 `https://vmoa.live/issue` 를 각각 넣고 **색인 생성 요청**

> TXT 레코드는 확인 후에도 **지우지 말 것** (Google 이 주기적으로 재확인).

## 2. 네이버 서치어드바이저 (권장)

1. https://searchadvisor.naver.com → 웹마스터 도구 → 사이트 등록 → `https://vmoa.live`
2. 소유 확인 → **HTML 태그** 선택 → `<meta name="naver-site-verification" content="XXXX">` 의 `XXXX` 복사
3. Vercel → Settings → Environment Variables → `NAVER_SITE_VERIFICATION=XXXX` (Production) → Redeploy
   (또는 DNS TXT 방식이 보이면 그쪽도 가능 — Cloudflare 에 TXT 추가)
4. 확인 후 **요청 → 사이트맵 제출** → `https://vmoa.live/sitemap.xml`

## 3. 등록 후 확인할 것

- Search Console **페이지(색인 생성)** 보고서: 처음 며칠은 “발견됨 – 현재 색인이 생성되지 않음”이 정상. 1~2주 지켜보기
- 이슈 글이 쌓이면서 색인 수가 늘어나는지 (이슈 상세가 검색 유입의 주력 — 자체 텍스트 + 출처)
- **알려진 점**: 없는 주소는 “찾을 수 없음” 화면이 HTTP 200 으로 나간다(사이트 전체 로딩 화면 때문에 스트리밍이 먼저 시작됨).
  `noindex` 가 붙어 있어 색인되지는 않지만 Search Console 에 “소프트 404”로 보일 수 있다. 문제 되면 루트 `loading.tsx` 를 페이지별로 옮겨 해결.
