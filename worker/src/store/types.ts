import type { LiveSnapshot } from "../domain";

/** 저장소 공통 인터페이스. memory ↔ postgres 를 갈아끼울 수 있게 추상화. */
export interface Store {
  /** 라이브 스냅샷들을 시계열로 저장 */
  saveSnapshots(snapshots: LiveSnapshot[]): Promise<void>;

  /** 채널 first-seen 처리: 넘긴 channelId 중 "처음 보는" 것만 배열로 반환.
   *  (= 신규 데뷔 후보 판정의 1차 신호) */
  markChannelsSeen(channelIds: string[]): Promise<string[]>;
}
