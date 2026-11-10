import type { Collector } from "./types";
import { ChzzkCollector } from "./chzzk";
import { SoopCollector } from "./soop";

// 활성 수집기 레지스트리. 새 플랫폼은 여기에 추가만 하면 파이프라인이 자동 포함.
// 유튜브는 여기(스냅샷 → 랭킹·합계·데뷔 감지)에 넣지 않는다 — 정책상 유튜브 수치를 합산하지 않으므로
// 별도 작업(src/youtube/sync.ts)이 공식 채널 영상·라이브를 따로 저장하고 LIVE 목록에만 합친다.
export const collectors: Collector[] = [new ChzzkCollector(), new SoopCollector()];
