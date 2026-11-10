// 버모아 클립 분류 어휘 (키리누키). Claude 가 이 안에서만 고르게 해서 모음 페이지·비슷한 클립의 기준이 흔들리지 않게 한다.
//  category  무엇을 하는 방송인지 (하나)
//  moment    어떤 순간인지 (최대 3개)

export type ClipTagKind = "category" | "moment";

export interface ClipTagDef {
  id: string;
  label: string;
  emoji: string;
  kind: ClipTagKind;
  /** 분류 프롬프트에 넣는 설명 */
  hint: string;
}

export const CLIP_TAGS: ClipTagDef[] = [
  // ---- 무엇을 (category)
  { id: "game", label: "게임", emoji: "🎮", kind: "category", hint: "게임 플레이 장면" },
  { id: "horror", label: "공포게임", emoji: "👻", kind: "category", hint: "공포·호러 게임" },
  { id: "talk", label: "저챗", emoji: "💬", kind: "category", hint: "잡담·토크·시청자와 대화" },
  { id: "song", label: "노래", emoji: "🎤", kind: "category", hint: "노래 방송·가라오케·커버" },
  { id: "collab", label: "합방", emoji: "🤝", kind: "category", hint: "여러 명이 함께하는 방송이 중심" },
  { id: "reaction", label: "리액션", emoji: "📺", kind: "category", hint: "영상·밈·방송을 같이 보며 반응" },
  { id: "asmr", label: "ASMR", emoji: "🎧", kind: "category", hint: "ASMR·속삭임" },
  { id: "food", label: "먹방·요리", emoji: "🍜", kind: "category", hint: "먹방·요리" },
  { id: "art", label: "그림", emoji: "🎨", kind: "category", hint: "그림·창작" },
  { id: "event", label: "행사·기념", emoji: "🎉", kind: "category", hint: "생일·기념일·데뷔·콘서트·발표" },
  { id: "etc", label: "기타", emoji: "📦", kind: "category", hint: "위에 없는 것" },

  // ---- 어떤 순간 (moment)
  { id: "funny", label: "웃음", emoji: "😂", kind: "moment", hint: "빵 터지는 웃긴 장면" },
  { id: "scream", label: "비명", emoji: "😱", kind: "moment", hint: "놀라거나 소리 지르는 장면" },
  { id: "fail", label: "사고·실수", emoji: "💥", kind: "moment", hint: "방송 사고·실수·말실수" },
  { id: "legend", label: "레전드", emoji: "🏆", kind: "moment", hint: "명장면·슈퍼플레이·승리" },
  { id: "cute", label: "귀여움", emoji: "🥰", kind: "moment", hint: "귀엽거나 애교" },
  { id: "chaos", label: "광기", emoji: "🌀", kind: "moment", hint: "텐션 폭발·광기·혼돈" },
  { id: "banter", label: "티키타카", emoji: "🗯️", kind: "moment", hint: "주고받는 말싸움·드립 대결" },
  { id: "touching", label: "감동", emoji: "🥹", kind: "moment", hint: "감동·눈물·진지한 이야기" },
  { id: "singing", label: "명곡", emoji: "🎶", kind: "moment", hint: "노래를 잘 부른 장면" },
  { id: "rage", label: "분노", emoji: "😤", kind: "moment", hint: "화내거나 억울해함" },
  { id: "flirt", label: "설렘", emoji: "💘", kind: "moment", hint: "설레는 대사·연애 상황극" },
  { id: "story", label: "썰", emoji: "📖", kind: "moment", hint: "에피소드·썰 풀기" },
];

const BY_ID = new Map(CLIP_TAGS.map((t) => [t.id, t]));

export function clipTagById(id: string): ClipTagDef | undefined {
  return BY_ID.get(id);
}

export const CATEGORY_IDS = CLIP_TAGS.filter((t) => t.kind === "category").map((t) => t.id);
export const MOMENT_IDS = CLIP_TAGS.filter((t) => t.kind === "moment").map((t) => t.id);
