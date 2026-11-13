// 검색 노출(SEO) 도우미 — 프로필 노출 기준·"주로 하는 방송" 요약·설명문
import { PLATFORMS, type ChannelProfile, type Broadcast } from "@/types";

/** 노출 기준: 방송 3회 이상, 최근 90일 안에 방송, 또는 지금 방송 중. 백엔드 /api/sitemap 기준과 같게 유지 */
export const INDEX_MIN_BROADCASTS = 3;
export const INDEX_RECENT_DAYS = 90;

export function isIndexableProfile(p: ChannelProfile): boolean {
  // 유튜브 전용 버튜버: 노래가 있거나 키리누키가 3개 이상 (서버 /api/sitemap 기준과 같게)
  if (p.ytOnly) return (p.songs?.total ?? 0) > 0 || (p.clips?.total ?? 0) >= 3;
  if (p.isLive || p.broadcastCount >= INDEX_MIN_BROADCASTS) return true;
  const last = p.broadcasts[0]?.startedAt;
  return !!last && Date.now() - Date.parse(last) < INDEX_RECENT_DAYS * 86_400_000;
}

// 방송 카테고리 → 표시 이름. null 은 너무 일반적이라 뺀다
const CATEGORY_LABEL: Record<string, string | null> = {
  talk: "토크",
  "음악/노래": "노래",
  버추얼: null,
  기타: null,
  etc: null,
  ETC: null,
};

// 방송 제목 키워드 → 주제. 실사·코스프레 노출 같은 민감한 방송 종류는 일부러 넣지 않는다
const TITLE_TOPICS: [RegExp, string][] = [
  [/노래|노래방|싱잉|커버곡|가라오케/, "노래"],
  [/asmr/i, "ASMR"],
  [/합방|콜라보/, "합방"],
  [/저챗|잡담|토크/, "토크"],
  [/공포/, "공포게임"],
  [/종겜|종합게임/, "종합게임"],
  [/그림|드로잉|일러스트/, "그림"],
  [/먹방/, "먹방"],
  [/요리|쿡방/, "요리"],
  [/마크|마인크래프트/, "마인크래프트"],
];

/** 최근 방송(제목·카테고리)에서 자주 하는 방송 종류 (많은 순) */
export function profileTopics(broadcasts: Broadcast[], max = 5): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const b of broadcasts) {
    const labels = new Set<string>();
    if (b.category) {
      const mapped = b.category in CATEGORY_LABEL ? CATEGORY_LABEL[b.category] : b.category;
      if (mapped) labels.add(mapped);
    }
    for (const [re, label] of TITLE_TOPICS) if (b.title && re.test(b.title)) labels.add(label);
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  // 방송이 적으면 한 번만 한 것도, 많으면 두 번 이상 한 것만
  const min = broadcasts.length >= 4 ? 2 : 1;
  return [...counts.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([label, count]) => ({ label, count }));
}

/** 방송 날짜 (KST YYYY-MM-DD) */
function kstDay(b: Broadcast): string {
  return b.day ?? new Date(Date.parse(b.startedAt) + 9 * 3_600_000).toISOString().slice(0, 10);
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** 프로필 검색 결과 설명문 (방송 제목은 넣지 않는다 — 민감한 문구가 검색 결과에 그대로 나가지 않게) */
export function profileDescription(p: ChannelProfile): string {
  if (p.ytOnly) {
    const parts = [
      `${p.name} — 유튜브에서 활동하는 버튜버${p.ytOnly.group ? `, ${p.ytOnly.group}` : ""}.`,
      p.isLive ? "지금 유튜브에서 방송 중." : "",
      p.songs?.total ? `커버·오리지널 노래 ${p.songs.total}곡.` : "",
      p.clips?.total ? `키리누키 ${p.clips.total}개.` : "",
      "공식 영상과 노래를 사이트 안에서 바로 재생.",
    ];
    return clip(parts.filter(Boolean).join(" "), 160);
  }
  const agency = p.tags.find((t) => t.kind === "agency")?.label;
  const topics = profileTopics(p.broadcasts, 3).map((t) => t.label);
  const parts = [
    `${p.name} — ${PLATFORMS[p.platform].label} 버튜버${agency ? `, ${agency} 소속` : ""}.`,
    topics.length ? `주로 ${topics.join("·")} 방송.` : "",
    p.isLive ? "지금 방송 중." : p.broadcasts[0] ? `최근 방송 ${kstDay(p.broadcasts[0])}.` : "",
    `방송 기록 ${p.broadcastCount}회, 최고 동접 ${p.peakViewers.toLocaleString("ko-KR")}명.`,
    p.clips?.total ? `키리누키 ${p.clips.total}개.` : "",
    p.songs?.total ? `노래 ${p.songs.total}곡.` : "",
  ];
  return clip(parts.filter(Boolean).join(" "), 160);
}
