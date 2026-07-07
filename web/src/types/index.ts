// 버모아(VMOA) 핵심 도메인 모델.
// 플랫폼 응답을 이 공통 스키마로 정규화(NORMALIZE 단계)해서 저장/서빙한다.

export type Platform = "chzzk" | "soop" | "youtube";

export interface PlatformMeta {
  id: Platform;
  label: string;
  /** 브랜드 컬러 (배지 등에 사용) */
  color: string;
}

export const PLATFORMS: Record<Platform, PlatformMeta> = {
  chzzk: { id: "chzzk", label: "치지직", color: "#00ffa3" },
  soop: { id: "soop", label: "SOOP", color: "#0055ff" },
  youtube: { id: "youtube", label: "YouTube", color: "#ff0033" },
};

export interface Vtuber {
  id: string;
  name: string;
  /** 소속사 (없으면 개인세) */
  agency: string | null;
  avatarUrl: string | null;
}

/** 현재 진행 중인 라이브 방송 스냅샷 */
export interface LiveStream {
  id: string;
  vtuberId: string;
  vtuberName: string;
  platform: Platform;
  title: string;
  category: string | null;
  viewers: number;
  /** 방송 시작 시각 (ISO) */
  startedAt: string;
  thumbnailUrl: string | null;
  channelUrl: string;
}

/** 신규 데뷔 이벤트 (DETECT 단계에서 생성) */
export interface DebutEvent {
  id: string;
  vtuberName: string;
  platform: Platform;
  /** 데뷔(예정) 일시 (ISO) */
  debutAt: string;
  agency: string | null;
  note: string | null;
  channelUrl: string | null;
}

/** 이슈 타임라인 아이템 (수동 큐레이션 콘텐츠) */
export interface Issue {
  slug: string;
  title: string;
  summary: string;
  /** 본문 (마크다운 등 — 지금은 평문) */
  body: string;
  tags: string[];
  publishedAt: string; // ISO
}
