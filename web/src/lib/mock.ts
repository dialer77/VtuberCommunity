import type { Platform, Issue } from "@/types";

// ⚠️ 임시 목(mock) 데이터. 실제로는 수집 파이프라인(COLLECT→NORMALIZE→STORE)이 채운다.
// 이름·수치는 전부 자리표시용 예시.

export interface RawLive {
  vtuberId: string;
  vtuberName: string;
  platform: Platform;
  title: string;
  category: string | null;
  viewers: number;
  startedMinAgo: number;
  agency: string | null;
  channelUrl: string;
}

export const RAW_LIVES: RawLive[] = [
  { vtuberId: "v01", vtuberName: "달빛나리", platform: "chzzk", title: "심야 젤다 무편집 클리어 가자", category: "젤다의 전설", viewers: 4210, startedMinAgo: 92, agency: "루나웨이브", channelUrl: "#" },
  { vtuberId: "v02", vtuberName: "코코미", platform: "soop", title: "[버추얼] 오늘도 수다방 ☕", category: "토크/캠방", viewers: 3155, startedMinAgo: 47, agency: null, channelUrl: "#" },
  { vtuberId: "v03", vtuberName: "세라핀", platform: "chzzk", title: "발로란트 랭크 - 불멸 찍는다", category: "발로란트", viewers: 2890, startedMinAgo: 130, agency: "스텔라폼", channelUrl: "#" },
  { vtuberId: "v04", vtuberName: "유리아", platform: "youtube", title: "신곡 커버 첫 공개 🎤", category: "음악", viewers: 1740, startedMinAgo: 25, agency: "스텔라폼", channelUrl: "#" },
  { vtuberId: "v05", vtuberName: "미즈키", platform: "chzzk", title: "구독자와 마리오카트 8", category: "마리오카트", viewers: 980, startedMinAgo: 61, agency: null, channelUrl: "#" },
  { vtuberId: "v06", vtuberName: "하늘비", platform: "soop", title: "인디 공포게임 릴레이", category: "공포게임", viewers: 640, startedMinAgo: 18, agency: "루나웨이브", channelUrl: "#" },
  { vtuberId: "v07", vtuberName: "네온", platform: "chzzk", title: "첫 방송! 잘 부탁드려요", category: "토크", viewers: 512, startedMinAgo: 8, agency: null, channelUrl: "#" },
];

export interface RawDebut {
  vtuberName: string;
  platform: Platform;
  debutDaysFromNow: number;
  agency: string | null;
  note: string | null;
  channelUrl: string | null;
}

export const RAW_DEBUTS: RawDebut[] = [
  { vtuberName: "리코 (Rico)", platform: "chzzk", debutDaysFromNow: 2, agency: "스텔라폼", note: "3기생 데뷔 방송 예정", channelUrl: "#" },
  { vtuberName: "아오이", platform: "soop", debutDaysFromNow: 5, agency: null, note: "개인세 데뷔, 자기소개 방송", channelUrl: "#" },
  { vtuberName: "네온", platform: "chzzk", debutDaysFromNow: 0, agency: null, note: "오늘 첫 방송 진행 중", channelUrl: "#" },
  { vtuberName: "무니", platform: "chzzk", debutDaysFromNow: -1, agency: "루나웨이브", note: "어제 데뷔, 동접 1.2K 기록", channelUrl: "#" },
  { vtuberName: "라피스", platform: "youtube", debutDaysFromNow: -3, agency: null, note: "데뷔 후 구독 급상승 감지", channelUrl: "#" },
];

export const ISSUES: Issue[] = [
  {
    slug: "stellaform-3rd-gen-announce",
    title: "스텔라폼 3기생 데뷔 일정 공개",
    summary: "신인 3인이 이번 주 순차 데뷔. 티저와 함께 데뷔 방송 시간표가 공개됐다.",
    body: "스텔라폼이 공식 채널을 통해 3기생 3인의 데뷔 일정을 공개했다. 데뷔 방송은 치지직에서 순차 진행되며, 각 멤버의 티저 영상이 함께 업로드됐다.\n\n(※ 본문은 이슈 타임라인 기능의 자리표시 예시입니다. 실제 서비스에서는 사실관계를 검수한 큐레이션 콘텐츠가 들어갑니다.)",
    tags: ["데뷔", "스텔라폼", "치지직"],
    publishedAt: "2026-07-05T10:00:00+09:00",
  },
  {
    slug: "chzzk-virtual-category-growth",
    title: "치지직 '버추얼' 카테고리 월 시청시간 신기록",
    summary: "치지직 버추얼 카테고리의 월간 누적 시청시간이 역대 최고치를 기록했다.",
    body: "치지직 버추얼 카테고리의 성장세가 이어지고 있다. 신인 유입과 대형 스트리머의 이적이 맞물리며 시청 지표가 상승했다.\n\n(※ 자리표시 예시 본문)",
    tags: ["치지직", "통계"],
    publishedAt: "2026-07-03T14:30:00+09:00",
  },
  {
    slug: "collab-relay-event",
    title: "여름맞이 합동 릴레이 방송 성사",
    summary: "여러 소속사·개인세 버튜버가 참여하는 대규모 합동 방송이 예고됐다.",
    body: "소속사와 개인세를 아우르는 합동 릴레이 방송이 예고됐다. 참가자 명단과 순서가 공개되며 팬들의 관심이 집중되고 있다.\n\n(※ 자리표시 예시 본문)",
    tags: ["콜라보", "이벤트"],
    publishedAt: "2026-07-01T09:00:00+09:00",
  },
];
