// IndexNow — 새 이슈 글 주소를 빙 등 IndexNow 참여 검색엔진에 바로 알린다.
//
// 키는 비밀이 아니다. 검색엔진이 https://vmoa.live/<키>.txt 를 읽어 사이트 소유를 확인하는
// 공개 값이라 web/public/ 에 같은 이름의 파일이 있어야 한다 (키를 바꾸면 그 파일도 같이).
// 켜짐 여부는 config.indexNowEnabled (기본: 이슈 수집과 같이 = 배포 PC 에서만).

import { config } from "./config";
import { log } from "./log";

export const INDEXNOW_KEY = "b8d1f73536a7198d1cefee8323bfe032";

/** paths 예: ["/issue/2026-11-26-abc123", "/issue"]. 실패해도 던지지 않는다. */
export async function notifyIndexNow(paths: string[]): Promise<void> {
  if (!config.indexNowEnabled || paths.length === 0) return;
  const site = config.siteUrl.replace(/\/$/, "");
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(site).host,
        key: INDEXNOW_KEY,
        keyLocation: `${site}/${INDEXNOW_KEY}.txt`,
        urlList: paths.map((p) => `${site}${p}`),
      }),
      signal: AbortSignal.timeout(5000),
    });
    log.info(`IndexNow ${paths.length}개 알림 — ${res.status}`);
  } catch (e) {
    // 알림 실패는 사이트 동작과 무관 — 다음 새 글 때 다시 보낸다
    log.info(`IndexNow 알림 실패: ${String(e).slice(0, 120)}`);
  }
}
