import type { Collector } from "./types";
import { ChzzkCollector } from "./chzzk";
import { SoopCollector } from "./soop";
import { YoutubeCollector } from "./youtube";

// 활성 수집기 레지스트리. 새 플랫폼은 여기에 추가만 하면 파이프라인이 자동 포함.
// YouTube는 API 키(YOUTUBE_API_KEY)가 있을 때만 등록(쿼터·키 필요).
export const collectors: Collector[] = [
  new ChzzkCollector(),
  new SoopCollector(),
  ...(process.env.YOUTUBE_API_KEY ? [new YoutubeCollector()] : []),
];
