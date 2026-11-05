// 버튜버 판정 (문서 Q4 v1) — worker 로컬 사본.
// TODO: web/src/lib/vtuber-registry.ts 와 함께 packages/ 공유 모듈로 통합.

const CHANNEL_ALLOWLIST = new Set<string>([]);
// 버튜버 확정 목록(DB vtuber_registry) — 웹 데뷔 소식 등으로 확인된 채널. 매 사이클 갱신.
let REGISTRY = new Set<string>();
export function setRegistryAllowlist(ids: Iterable<string>): void {
  REGISTRY = new Set(ids);
}
const CHANNEL_DENYLIST = new Set<string>([]);

export const AGENCY_TAGS = [
  "스텔라이브", "이세계아이돌", "왁타버스", "프로젝트아이", "허니즈",
  "리스텔라", "플라네타", "데네브", "몽상컴퍼니", "프리즘", "클로버클럽",
  "러블릿", "라이브온", "v&u", "츠라이브", "아카데미아", "레볼루션",
];

const VTUBER_KEYWORDS = [
  "버튜버", "버츄얼", "버추얼", "브이튜버", "개튜버", "vtuber", "virtual",
];

export function isVtuber(input: {
  channelId: string;
  title: string;
  tags: string[];
}): boolean {
  if (CHANNEL_DENYLIST.has(input.channelId)) return false;
  if (CHANNEL_ALLOWLIST.has(input.channelId) || REGISTRY.has(input.channelId)) return true;

  const tagsLower = input.tags.map((t) => t.toLowerCase());
  if (AGENCY_TAGS.some((a) => tagsLower.some((t) => t.includes(a)))) return true;

  const hay = [input.title.toLowerCase(), ...tagsLower].join(" ");
  return VTUBER_KEYWORDS.some((k) => hay.includes(k));
}
