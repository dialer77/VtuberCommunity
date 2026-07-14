import type { Collector } from "./types";
import type { RawLive } from "../domain";

/**
 * YouTube 수집기 — API 키가 있을 때만 활성(collectors/index.ts에서 조건부 등록).
 *
 * 쿼터 제약(문서 05): search.list 폴링 금지(100 units/호출).
 * 실제 구현 계획:
 *   1) 큐레이션된 버튜버 채널ID 목록 (CHANNELS 또는 레지스트리)
 *   2) RSS(youtube.com/feeds/videos.xml?channel_id=…, 쿼터 0)로 라이브 후보 발견
 *   3) videos.list(part=liveStreamingDetails, 50개 배치, 1 unit)로 라이브·시청자 확정
 *
 * 지금은 키/채널목록이 준비되면 (3)만 채우면 되도록 골격만 둔다.
 */
const API_KEY = process.env.YOUTUBE_API_KEY ?? "";
const CHANNELS: string[] = []; // 버튜버 채널ID 시드 (추후 레지스트리)

export class YoutubeCollector implements Collector {
  readonly platform = "youtube" as const;

  async fetchLives(): Promise<RawLive[]> {
    if (!API_KEY || CHANNELS.length === 0) return [];
    // TODO: RSS 발견 → videos.list 확정
    return [];
  }
}
