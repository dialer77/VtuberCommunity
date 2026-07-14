import type { LiveSnapshot } from "../domain";

/**
 * 신규 데뷔 후보 판정.
 *
 * 지금은 first-seen(처음 관측된 채널) 스냅샷을 그대로 후보로 본다.
 * TODO(문서 07 감지 로직): 단일 신호 금지 → 아래를 가중 결합해 정밀도를 높인다.
 *   - 채널 개설일 (신규성)
 *   - 데뷔 키워드 (제목/태그: "데뷔", "첫방송", "初配信", "debut")
 *   - 과거 방송 이력 부재
 *   - 구독자·동접 급증
 */
export function debutCandidates(newlySeen: LiveSnapshot[]): LiveSnapshot[] {
  return newlySeen;
}
