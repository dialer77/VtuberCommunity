import type { Platform, RawLive } from "../domain";

/** 플랫폼 수집기 공통 인터페이스.
 *  새 플랫폼을 추가하려면 이 인터페이스를 구현해 registry(index.ts)에 등록만 하면 된다. */
export interface Collector {
  readonly platform: Platform;
  /** 현재 방송 중인 라이브 목록을 가져온다 */
  fetchLives(): Promise<RawLive[]>;
}
