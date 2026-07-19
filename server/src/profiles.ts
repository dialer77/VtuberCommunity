// 스트리머 프로필의 큐레이션 정보 (관리자 전용, 공개 제보 없음).
// 자동 데이터(방송기록·통계·현재상태)는 DB에서 파생하고, 여기서는
// 사람이 관리하는 소개·방송 스케줄·공식 링크만 보강한다.

export interface CuratedProfile {
  /** 한 줄 소개 / 커뮤니티성 설명 */
  bio?: string;
  /** 공개된 방송 스케줄 (자유 텍스트, 예: "월수금 20:00") */
  schedule?: string;
  /** 공식 링크 (트위터·유튜브 등) */
  links?: { label: string; url: string }[];
}

// channelId → 큐레이션 정보. 필요할 때 관리자가 직접 추가한다.
export const CURATED_PROFILES: Record<string, CuratedProfile> = {
  // "45e71a76e949e16a34764deb962f9d9f": {
  //   bio: "스텔라이브 소속. 팰월드·저챗 위주.",
  //   schedule: "화목토 21:00",
  //   links: [{ label: "X", url: "https://x.com/..." }],
  // },
};

export function curatedProfile(channelId: string): CuratedProfile {
  return CURATED_PROFILES[channelId] ?? {};
}
