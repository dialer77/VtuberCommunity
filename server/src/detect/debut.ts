import type { LiveSnapshot } from "../domain";

/**
 * 신규 데뷔 후보 판정.
 *
 * first-seen(처음 관측된 채널)만으로는 "오래된 스트리머를 이제 추적 시작"과
 * "진짜 데뷔"를 구분 못 한다. 그래서 제목의 데뷔 키워드를 보조 신호로 결합한다.
 * (개설일·구독 급증 등은 추가 API 호출이 필요 → 다음 단계)
 */

const DEBUT_KEYWORDS = [
  "데뷔", "첫방송", "첫 방송", "初配信", "debut", "자기소개", "신입버튜버",
];

/** 제목에 데뷔 방송 신호가 있는지 */
export function hasDebutSignal(title: string): boolean {
  const t = title.toLowerCase();
  return DEBUT_KEYWORDS.some((k) => t.includes(k.toLowerCase()));
}

export function debutCandidates(newlySeen: LiveSnapshot[]): LiveSnapshot[] {
  return newlySeen;
}
