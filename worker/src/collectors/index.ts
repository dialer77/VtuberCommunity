import type { Collector } from "./types";
import { ChzzkCollector } from "./chzzk";

// 활성 수집기 레지스트리.
// SOOP / YouTube 수집기를 구현하면 여기에 추가만 하면 파이프라인이 자동으로 포함한다.
export const collectors: Collector[] = [
  new ChzzkCollector(),
  // new SoopCollector(),
  // new YoutubeCollector(),
];
