// 버모아(VMOA) 핵심 도메인 모델.
// 플랫폼 응답을 이 공통 스키마로 정규화(NORMALIZE 단계)해서 저장/서빙한다.

export type Platform = "chzzk" | "soop" | "youtube";

export interface PlatformMeta {
  id: Platform;
  label: string;
  /** 브랜드 컬러 (배지 등에 사용) */
  color: string;
}

export const PLATFORMS: Record<Platform, PlatformMeta> = {
  chzzk: { id: "chzzk", label: "치지직", color: "#00ffa3" },
  soop: { id: "soop", label: "SOOP", color: "#0055ff" },
  youtube: { id: "youtube", label: "YouTube", color: "#ff0033" },
};

export interface Vtuber {
  id: string;
  name: string;
  /** 소속사 (없으면 개인세) */
  agency: string | null;
  avatarUrl: string | null;
}

export type TagKind = "agency" | "concept" | "content";

/** VMOA 서브컬처 태그 (소속사·컨셉·콘텐츠) */
export interface VmoaTag {
  id: string;
  label: string;
  emoji: string;
  kind: TagKind;
}

/** 태그 + 현재 방송중 개수 (필터 바용) */
export interface TagCount extends VmoaTag {
  count: number;
}

/** 현재 진행 중인 라이브 방송 스냅샷 */
export interface LiveStream {
  id: string;
  vtuberId: string;
  vtuberName: string;
  platform: Platform;
  title: string;
  category: string | null;
  viewers: number;
  /** 방송 시작 시각 (ISO) */
  startedAt: string;
  thumbnailUrl: string | null;
  channelUrl: string;
  tags: VmoaTag[];
  /** 유튜브 방송이면 영상 ID (사이트 안 플레이어로 재생) */
  videoId?: string;
  /** 유튜브 방송일 때 버튜버 주 채널의 플랫폼 — 프로필·최애는 /vtuber/{profilePlatform}/{vtuberId} */
  profilePlatform?: Platform;
}

/** 신규 데뷔 이벤트 (DETECT 단계에서 생성) */
/** 신규 데뷔 탭 한 기간분: 데뷔 방송 확인 채널은 전부, 새로 감지된 채널은 최근 일부 + 전체 개수 */
export interface DebutWindow {
  confirmed: DebutEvent[];
  detected: DebutEvent[];
  detectedTotal: number;
  /** 웹에서 찾은 데뷔 예정 (기간과 무관하게 앞으로 데뷔할 버튜버) */
  upcoming: DebutReportEntry[];
  /** 기간 안에 데뷔했지만 우리 수집기가 감지하지 못한 버튜버 (웹 소식) */
  webOnly: DebutReportEntry[];
}

export interface DebutSource {
  url: string;
  title: string;
  publisher: string | null;
}

/** 웹에서 수집한 데뷔 소식 */
export interface DebutReportEntry {
  id: number;
  name: string;
  agency: string | null;
  platform: Platform | null;
  channelId: string | null;
  channelUrl: string | null;
  debutAt: string;
  debutDate: string;
  status: "upcoming" | "debuted";
  summary: string | null;
  sources: DebutSource[];
}

export interface DebutEvent {
  id: string;
  vtuberName: string;
  platform: Platform;
  /** 데뷔(예정) 일시 (ISO) */
  debutAt: string;
  agency: string | null;
  note: string | null;
  /** 제목에 데뷔 키워드가 있어 "진짜 데뷔"로 추정되는지 */
  debutSignal: boolean;
  channelUrl: string | null;
  /** 웹 데뷔 소식으로도 확인됨 */
  web?: boolean;
  summary?: string | null;
  sources?: DebutSource[];
}

/** 랭킹 아이템 (윈도우 내 평균/피크 시청자) */
export interface RankingEntry {
  channelId: string;
  channelName: string;
  platform: Platform;
  avgViewers: number;
  peakViewers: number;
  samples: number;
  title: string | null;
  channelUrl: string;
}

export type RankingPeriod = "live" | "today" | "week" | "month";
export type RankingMetric = "watch" | "avg" | "peak" | "hours";

/** 기간 랭킹 아이템 (백엔드 일별 집계 합산) */
export interface PeriodRankingEntry {
  channelId: string;
  channelName: string;
  platform: Platform;
  channelUrl: string;
  watchHours: number;
  avgViewers: number;
  peakViewers: number;
  liveHours: number;
  days: number;
  title: string | null;
}

export interface PeriodRanking {
  /** 기간 시작일 (KST YYYY-MM-DD) */
  since: string;
  /** 집계를 시작한 날 — 기간보다 늦으면 아직 기간을 다 채우지 못한 것 */
  trackingSince: string | null;
  ranking: PeriodRankingEntry[];
}

/** 급상승 아이템 (윈도우 내 시청자 변화율) */
export interface RisingEntry {
  channelId: string;
  channelName: string;
  platform: Platform;
  firstViewers: number;
  latestViewers: number;
  growth: number;
  growthPct: number;
  title: string | null;
  channelUrl: string;
}

/** V코인 시세 아이템 (시청자 기반 지수 + 등락률) */
export interface CoinItem {
  channelId: string;
  channelName: string;
  platform: Platform;
  channelUrl: string;
  price: number;
  prevPrice: number | null;
  changePct: number | null;
  isLive: boolean;
}

export type CoinSort = "cap" | "gainers" | "losers";

/** 한 번의 방송 세션 (시계열에서 파생) */
export interface Broadcast {
  startedAt: string;
  title: string | null;
  category: string | null;
  peakViewers: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** 오래된 방송(스냅샷 보관 기간 이후)은 날짜만 남는다 — KST YYYY-MM-DD */
  day?: string;
}

/** 관리자 큐레이션 프로필 정보 */
export interface CuratedProfile {
  bio?: string;
  schedule?: string;
  links?: { label: string; url: string }[];
}

/** 유튜브 공식 채널 영상 (RSS + videos.list 상세) */
export interface YoutubeVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  /** null = 아직 모름 */
  liveStatus: "none" | "upcoming" | "live" | "ended" | null;
  scheduledAt: string | null;
  liveStartedAt: string | null;
  durationSec: number | null;
}

/** 버튜버의 유튜브 공식 채널 (버모아가 연결) */
export interface YoutubeChannel {
  ytChannelId: string;
  title: string | null;
  handle: string | null;
  url: string;
  thumbnailUrl: string | null;
  /** auto = 자동 추정(틀릴 수 있음), manual = 운영자 확인 */
  status: "auto" | "manual";
  videos: YoutubeVideo[];
  live: (YoutubeVideo & { viewers: number | null }) | null;
}

/** 스트리머 프로필 (자동 데이터 + 태그 + 큐레이션) */
export interface ChannelProfile {
  channelId: string;
  platform: Platform;
  name: string;
  channelUrl: string;
  firstSeenAt: string;
  debutSignal: boolean;
  isLive: boolean;
  currentViewers: number | null;
  currentTitle: string | null;
  peakViewers: number;
  broadcastCount: number;
  tags: VmoaTag[];
  curated: CuratedProfile;
  broadcasts: Broadcast[];
  /** 유튜브 공식 채널 (연결 전·이전 백엔드면 없음) */
  youtube?: YoutubeChannel | null;
  /** 키리누키 (없으면 null) */
  clips?: ProfileClips | null;
}

/** 이슈 타임라인 아이템 (수동 큐레이션 콘텐츠) */
/** 이슈 출처 (기사 미리보기 카드 / 유튜브 임베드) */
export interface IssueSource {
  url: string;
  title: string;
  publisher: string | null;
  description: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  kind: "link" | "youtube";
  embedId: string | null;
}

export interface Issue {
  slug: string;
  title: string;
  summary: string;
  /** 본문 (마크다운) */
  body: string;
  tags: string[];
  publishedAt: string; // ISO
  /** 사건/발표 날짜 (YYYY-MM-DD). 없으면 publishedAt 기준 */
  eventDate: string | null;
  /** auto = 백엔드가 AI 로 수집·정리, manual = 운영자가 직접 작성(content/issues/*.md) */
  origin: "auto" | "manual";
  sources: IssueSource[];
}

/** 버모아 클립 분류 태그 (무엇을 = category, 어떤 순간 = moment) */
export interface ClipTag {
  id: string;
  label: string;
  emoji: string;
  kind: "category" | "moment";
}

export interface ClipTagCount extends ClipTag {
  count: number;
}

/** 키리누키 (팬 편집 클립) + 버모아 분류 */
export interface Clip {
  videoId: string;
  /** YouTube 제목 */
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  channelTitle: string | null;
  channelUrl: string;
  /** 누가 — 버튜버 주 채널 */
  vtubers: { platform: Platform; channelId: string; name: string }[];
  /** 무엇을 */
  category: ClipTag | null;
  topic: string | null;
  /** 어떤 순간 */
  moments: ClipTag[];
  /** 한 줄 요약 (버모아) */
  summary: string | null;
  /** 버모아 좋아요 수 */
  likes?: number;
  /** 대표 순간 (moments[0]) */
  primaryMoment?: ClipTag | null;
  /** 사건·밈 이름 */
  event?: string | null;
  /** 원본 방송 다시보기 */
  source?: { url: string; platform: Platform } | null;
  /** 원본 방송 날짜 (KST YYYY-MM-DD) */
  sourceDate?: string | null;
}

/** 추천 묶음 — 같은 방송·같은 사건·같은 버튜버·다른 버튜버·자주 함께 */
export interface RecBundle {
  id: "same_source" | "same_event" | "same_vtuber" | "same_scene" | "co_star" | "for_you";
  title: string;
  /** reason: 카드에 붙는 추천 이유 */
  items: { clip: Clip; reason: string }[];
}

export interface ClipDetail {
  clip: Clip;
  /** 추천 묶음 (없으면 sameVtuber·otherVtuber 로 표시) */
  bundles?: RecBundle[];
  sameVtuber: Clip[];
  otherVtuber: Clip[];
  /** '어떤 순간' 태그 투표 현황 */
  tagVotes?: ClipTagVote[];
  /** 찬반이 이만큼 차이 나면 분류에 반영 */
  voteMargin?: number;
}

/** 태그 투표 현황: Claude 가 붙였는지 · 찬반 수 · 지금 분류에 보이는지 */
export interface ClipTagVote extends ClipTag {
  ai: boolean;
  up: number;
  down: number;
  shown: boolean;
}

/** 내 재생목록 요약 */
export interface PlaylistSummary {
  id: number;
  title: string;
  count: number;
  updatedAt: string;
  firstVideoId: string | null;
}

/** 클립 하나에 대한 내 상태 */
export interface MyClipState {
  liked: boolean;
  votes: Record<string, number>;
  playlists: (PlaylistSummary & { has: boolean })[];
}

/** 프로필의 키리누키 요약 */
export interface ProfileClips {
  total: number;
  clips: Clip[];
  /** 자주 나오는 순간·카테고리 */
  traits: (ClipTag & { count: number })[];
  /** 자주 하는 것 (게임 이름 등) */
  topics: { topic: string; count: number }[];
  /** 클립에 자주 같이 나오는 버튜버 */
  coStars?: { platform: Platform; channelId: string; name: string; count: number }[];
}

/** 버튜버 검색 결과 하나 (방송 중이 아니어도 수집 DB 에 있으면 나온다) */
export interface SearchResult {
  platform: Platform;
  channelId: string;
  name: string;
  /** 이름이 아닌 다른 이름(예전 이름·유튜브 채널명 등)으로 찾았을 때 그 이름 */
  matchedName: string | null;
  tags: VmoaTag[];
  isLive: boolean;
  livePlatform: Platform | null;
  viewers: number | null;
  liveTitle: string | null;
  /** 마지막 방송 날짜 YYYY-MM-DD (KST) */
  lastLiveDate: string | null;
  firstSeenAt: string;
}

export interface SearchResponse {
  q: string;
  tags: VmoaTag[];
  unknownTags: string[];
  suggestedTags: VmoaTag[];
  total: number;
  results: SearchResult[];
  tagCounts: TagCount[];
}
