// 워커 도메인 모델.
// (추후 web/src/types 와 함께 packages/types 로 추출해 공유 예정 — 지금은 워커 로컬 정의)

export type Platform = "chzzk" | "soop" | "youtube";

/** 수집기가 반환하는, 정규화 전 원본에 가까운 라이브 */
export interface RawLive {
  channelId: string;
  channelName: string;
  title: string;
  category: string | null;
  viewers: number;
  startedAt: string; // ISO
}

/** 한 번의 폴링에서 관측한 라이브 스냅샷 (STORE 대상, 시계열의 한 점) */
export interface LiveSnapshot extends RawLive {
  platform: Platform;
  /** 관측 시각 (폴링 시점) */
  collectedAt: string; // ISO
}
