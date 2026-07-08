import type { Collector } from "./types";
import type { RawLive } from "../domain";

/**
 * 치지직 수집기.
 *
 * ⚠️ 지금은 목(mock) 데이터를 반환하는 스텁이다.
 * TODO: 실제 API 연동 시 fetchLives 내부만 교체하면 파이프라인은 그대로 동작.
 *   - 공식 : GET https://openapi.chzzk.naver.com/open/v1/lives  (Client-Id/Secret 헤더)
 *   - 비공식: GET https://api.chzzk.naver.com/service/v1/home/lives
 *   응답의 라이브 항목을 RawLive 로 매핑하면 된다.
 */
export class ChzzkCollector implements Collector {
  readonly platform = "chzzk" as const;
  private cycle = 0;

  async fetchLives(): Promise<RawLive[]> {
    this.cycle += 1;

    const lives: RawLive[] = [
      { channelId: "chzzk-aaa", channelName: "달빛나리", title: "심야 젤다 무편집", category: "젤다의 전설", viewers: 4200 + this.cycle * 11, startedAt: minutesAgo(90) },
      { channelId: "chzzk-bbb", channelName: "세라핀", title: "발로란트 랭크", category: "발로란트", viewers: 2800 - this.cycle * 6, startedAt: minutesAgo(120) },
      { channelId: "chzzk-ccc", channelName: "미즈키", title: "구독자와 마리오카트", category: "마리오카트", viewers: 950, startedAt: minutesAgo(60) },
    ];

    // 데모: 3번째 사이클부터 신규 채널이 등장하는 상황을 시뮬레이션 → 데뷔 감지 확인용
    if (this.cycle >= 3) {
      lives.push({
        channelId: "chzzk-new1",
        channelName: "네온(신인)",
        title: "첫 방송! 잘 부탁드려요",
        category: "토크",
        viewers: 280,
        startedAt: minutesAgo(4),
      });
    }

    return lives;
  }
}

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}
