import type { LiveSnapshot } from "../domain";

/** 저장소 공통 인터페이스. sqlite ↔ memory ↔ postgres 를 갈아끼울 수 있게 추상화. */
export interface Store {
  /** 라이브 스냅샷들을 시계열로 저장 */
  saveSnapshots(snapshots: LiveSnapshot[]): Promise<void>;

  /** 채널 first-seen 처리: 처음 관측된 채널의 스냅샷만 반환하고, 내부적으로 채널을 등록한다.
   *  (= 신규 데뷔 후보 판정의 1차 신호) */
  markNewChannels(snapshots: LiveSnapshot[]): Promise<LiveSnapshot[]>;

  /** 보존 기간을 넘긴 오래된 스냅샷 정리. 삭제 건수 반환. (구현은 선택) */
  pruneOldSnapshots?(retentionDays: number): Promise<number>;
}
