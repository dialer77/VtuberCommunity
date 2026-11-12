// 키리누키 주제(게임·콘텐츠 이름) 통일 — "마크"·"마인크래프트"·"Minecraft" 처럼 갈라지면 비슷한 클립·모음이 흩어진다.
//  1) 분류 프롬프트에 이미 쓰는 주제 이름을 보여 주고 그대로 쓰게 한다 (classify.ts)
//  2) 그래도 갈라진 이름은 별칭 사전(clip_topic_alias + 아래 기본값)으로 정식 이름에 맞춘다
//  3) 운영자가 clips.ps1 alias <별칭> <정식 이름> 으로 고치면 기존 클립에도 바로 반영된다

/** 비교용: 소문자, 공백·문장부호·기호 제거 */
export function topicKey(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 기본 별칭 (자주 쓰는 줄임말 → 정식 이름) */
export const SEED_TOPIC_ALIASES: Record<string, string> = {
  마크: "마인크래프트",
  minecraft: "마인크래프트",
  롤: "리그 오브 레전드",
  lol: "리그 오브 레전드",
  리그오브레전드: "리그 오브 레전드",
  롤토체스: "전략적 팀 전투",
  tft: "전략적 팀 전투",
  발로: "발로란트",
  valorant: "발로란트",
  배그: "배틀그라운드",
  pubg: "배틀그라운드",
  pubg배틀그라운드: "배틀그라운드",
  옵치: "오버워치",
  overwatch: "오버워치",
  오버워치2: "오버워치",
  로아: "로스트아크",
  메이플: "메이플스토리",
  스타: "스타크래프트",
  스타1: "스타크래프트",
  이리: "이터널 리턴",
  이터널리턴: "이터널 리턴",
  데바데: "데드 바이 데이라이트",
  deadbydaylight: "데드 바이 데이라이트",
  블아: "블루 아카이브",
  블루아카이브: "블루 아카이브",
  레데리: "레드 데드 리뎀션 2",
  레데리2: "레드 데드 리뎀션 2",
  원신: "원신",
  팰월드: "팰월드",
  palworld: "팰월드",
  철권8: "철권 8",
  철권: "철권 8",
  노래: "노래 방송",
  노래방: "노래 방송",
  가라오케: "노래 방송",
  저챗: "저스트 채팅",
  잡담: "저스트 채팅",
  justchatting: "저스트 채팅",
};

// 너무 일반적인 주제 — 같아도 "같은 게임·콘텐츠"라고 하기 어렵다 (추천 근거로 약하게만 쓴다)
const GENERIC = new Set(
  ["저스트 채팅", "저챗", "잡담", "토크", "노래 방송", "노래", "합방", "방송", "게임", "시청자 사연", "리액션", "먹방", "그림", "ASMR", "종합게임", "기타"].map(topicKey),
);

export function isGenericTopic(topic: string | null): boolean {
  return !topic || GENERIC.has(topicKey(topic));
}

/** 주제 → 정식 이름 (별칭 사전 우선, 없으면 그대로) */
export function canonicalTopic(raw: string | null, aliases: Map<string, string>): string | null {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const k = topicKey(t);
  return aliases.get(k) ?? SEED_TOPIC_ALIASES[k] ?? t;
}
