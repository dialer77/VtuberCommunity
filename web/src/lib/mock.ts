import type { Platform } from "@/types";

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

// 이슈는 content/issues/*.md 로 이관됨 (lib/issues.ts 참고).
