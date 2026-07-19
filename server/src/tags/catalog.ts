// VMOA 태그 시스템 — 플랫폼이 주지 않는 서브컬처 분류.
// 소속사·컨셉(퍼리/오토코노코 등)·콘텐츠 태그를 큐레이션한다.
//
// 태그 부여 = 자동 부트스트랩(스트리머 자가 태그에서 추출, 안전) + 수동 큐레이션/유저 제보.
// ⚠️ 퍼리·오토코노코 같은 캐릭터 속성은 자가 선언 또는 큐레이션된 경우에만 붙인다
//    (실존 인물에 임의 라벨링 금지).

export type TagKind = "agency" | "concept" | "content";

export interface TagDef {
  id: string;
  label: string;
  emoji: string;
  kind: TagKind;
}

export const TAG_CATALOG: TagDef[] = [
  // 소속사
  { id: "stellive", label: "스텔라이브", emoji: "⭐", kind: "agency" },
  { id: "wakta", label: "왁타버스", emoji: "🌀", kind: "agency" },
  { id: "isegye", label: "이세계아이돌", emoji: "🎤", kind: "agency" },
  { id: "ristella", label: "리스텔라", emoji: "🌙", kind: "agency" },
  { id: "planeta", label: "플라네타", emoji: "🪐", kind: "agency" },
  { id: "mongsang", label: "몽상컴퍼니", emoji: "💭", kind: "agency" },
  { id: "projecta", label: "프로젝트 아이", emoji: "🍯", kind: "agency" },
  { id: "charon", label: "카론유니버스", emoji: "🛸", kind: "agency" },
  { id: "afterlive", label: "애프터라이브", emoji: "🌆", kind: "agency" },
  { id: "grimm", label: "그림프로덕션", emoji: "🎨", kind: "agency" },

  // 컨셉 (캐릭터 속성)
  { id: "furry", label: "퍼리/수인", emoji: "🐾", kind: "concept" },
  { id: "otokonoko", label: "오토코노코", emoji: "🎀", kind: "concept" },
  { id: "beomiyuk", label: "버미육", emoji: "🍼", kind: "concept" },
  { id: "growth", label: "육성형", emoji: "🌱", kind: "concept" },

  // 콘텐츠
  { id: "song", label: "노래", emoji: "🎵", kind: "content" },
  { id: "asmr", label: "ASMR", emoji: "🎧", kind: "content" },
  { id: "rookie", label: "신인", emoji: "🐣", kind: "content" },
];

const VALID_IDS = new Set(TAG_CATALOG.map((t) => t.id));

export function tagById(id: string): TagDef | undefined {
  return TAG_CATALOG.find((t) => t.id === id);
}

// 자가 태그 키워드 → VMOA 태그 id (소문자 부분일치).
// 확신 있는 매핑만 넣는다 (모호한 것은 수동 큐레이션에 맡김).
const AUTO_MAP: Array<[string, string]> = [
  ["스텔라이브", "stellive"],
  ["왁타버스", "wakta"],
  ["이세계아이돌", "isegye"],
  ["이세돌", "isegye"],
  ["리스텔라", "ristella"],
  ["플라네타", "planeta"],
  ["데네브", "planeta"],
  ["몽상컴퍼니", "mongsang"],
  ["프로젝트아이", "projecta"],
  ["허니즈", "projecta"],
  ["카론", "charon"],
  ["애프터라이브", "afterlive"],
  ["그림프로덕션", "grimm"],
  ["퍼리", "furry"],
  ["수인", "furry"],
  ["furry", "furry"],
  ["오토코노코", "otokonoko"],
  ["男の娘", "otokonoko"],
  ["버미육", "beomiyuk"],
  ["육성", "growth"],
  ["노래", "song"],
  ["우타", "song"],
  ["asmr", "asmr"],
  ["신입", "rookie"],
  ["신인", "rookie"],
];

/** 스트리머 자가 태그에서 VMOA 태그 id를 안전하게 추출 */
export function autoTags(rawTags: string[]): string[] {
  const low = rawTags.map((t) => t.toLowerCase());
  const out = new Set<string>();
  for (const [kw, id] of AUTO_MAP) {
    if (low.some((t) => t.includes(kw.toLowerCase()))) out.add(id);
  }
  return [...out];
}

// 수동 큐레이션 / 유저 제보로 부여하는 태그. channelId → tagId[]
// (자가 태그로 안 잡히는 컨셉 속성 등을 여기서 보강)
export const MANUAL_TAGS: Record<string, string[]> = {
  // "channelIdExample": ["furry"],
};

/** 채널의 최종 VMOA 태그 id 목록 (자동 + 수동 병합, 유효 id만) */
export function resolveChannelTags(
  channelId: string,
  rawTags: string[],
): string[] {
  const ids = new Set<string>(autoTags(rawTags));
  for (const id of MANUAL_TAGS[channelId] ?? []) ids.add(id);
  return [...ids].filter((id) => VALID_IDS.has(id));
}
