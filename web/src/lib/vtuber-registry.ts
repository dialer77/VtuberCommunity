// 버튜버 판정 레지스트리 — 문서 Q4(버튜버 정의·판정)의 v1 구현.
//
// 판정 우선순위:
//   1) 채널 denylist  → 무조건 제외 (오탐 교정)
//   2) 채널 allowlist → 무조건 포함 (태그 없는 개인세/신인 커버)
//   3) 소속사 태그    → 강한 신호
//   4) 키워드         → 중간 신호
//
// 정확도를 높이는 지속적 방법은 (3)(4) 휴리스틱보다 (1)(2) 큐레이션을 늘리는 것.

/** 확실한 버튜버 채널ID (키워드/소속사 태그로 안 잡히는 경우 수동 등록) */
export const CHANNEL_ALLOWLIST = new Set<string>([
  // 예) 태그가 약한 버튜버의 channelId를 여기에 추가
  // "45e71a76e949e16a34764deb962f9d9f", // 아야츠노 유니(스텔라이브)
]);

/** 오탐으로 제외할 채널ID */
export const CHANNEL_DENYLIST = new Set<string>([]);

/** 국내 버튜버 소속사/프로젝트 태그 (강한 신호, 소문자 비교) */
export const AGENCY_TAGS = [
  "스텔라이브", "이세계아이돌", "왁타버스", "프로젝트아이", "허니즈",
  "리스텔라", "플라네타", "데네브", "몽상컴퍼니", "프리즘", "클로버클럽",
  "러블릿", "라이브온", "v&u", "츠라이브", "아카데미아", "레볼루션",
];

/** 버튜버 키워드 (중간 신호) */
export const VTUBER_KEYWORDS = [
  "버튜버", "버츄얼", "버추얼", "브이튜버", "개튜버", "vtuber", "virtual",
];

export interface ClassifyInput {
  channelId: string;
  title: string;
  tags: string[];
}

/** 라이브가 버튜버 방송으로 추정되는지 판정 */
export function isVtuber({ channelId, title, tags }: ClassifyInput): boolean {
  if (CHANNEL_DENYLIST.has(channelId)) return false;
  if (CHANNEL_ALLOWLIST.has(channelId)) return true;

  const tagsLower = tags.map((t) => t.toLowerCase());

  // 소속사 태그: 태그 중 하나라도 소속사명을 포함하면 강한 신호
  if (AGENCY_TAGS.some((a) => tagsLower.some((t) => t.includes(a)))) {
    return true;
  }

  // 키워드: 제목 또는 태그 어디든
  const hay = [title.toLowerCase(), ...tagsLower].join(" ");
  if (VTUBER_KEYWORDS.some((k) => hay.includes(k))) {
    return true;
  }

  return false;
}
