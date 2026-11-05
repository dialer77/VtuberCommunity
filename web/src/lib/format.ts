const KST = "Asia/Seoul";

/** 시청자 수 등 정수를 천단위 콤마로 */
export function formatCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** ISO 문자열을 KST "M월 D일" 로 */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: KST,
  }).format(new Date(iso));
}

/** ISO 문자열을 KST "M월 D일 HH:mm" 로 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: KST,
  }).format(new Date(iso));
}

/** 경과 시간 "n시간 n분 전 방송 시작" 형태 (현재 시각 기준) */
export function elapsedSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min}분째`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간째` : `${h}시간 ${m}분째`;
}

/** 데뷔까지 남은/지난 일수 라벨 */
export function debutCountdown(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const days = Math.round((t - now) / 86400000);
  if (days > 1) return `D-${days}`;
  if (days === 1) return "내일";
  if (days === 0) return "오늘";
  if (days === -1) return "어제";
  return `${-days}일 전`;
}

/** 데뷔 일시 — 시각을 모르는 경우(KST 자정)는 날짜만 */
export function formatDebutDate(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  const midnight = kst.getUTCHours() === 0 && kst.getUTCMinutes() === 0;
  return midnight ? formatDate(iso) : formatDateTime(iso);
}

/** "2026-11-05" → "11월 5일" */
export function formatYmd(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** 이슈의 기준 시각: 사건 날짜(KST 자정) → 없으면 게시 시각 */
export function issueDate(issue: { eventDate: string | null; publishedAt: string }): string {
  return issue.eventDate ? `${issue.eventDate}T00:00:00+09:00` : issue.publishedAt;
}
