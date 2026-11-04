// 이슈 자동 수집: Claude(구독, 헤드리스)로 웹을 검색해 한국 버튜버 씬 이슈를 정리 → 출처 미리보기 → DB 저장.
import { createHash } from "node:crypto";
import type { SqliteStore, IssueSource, NewIssue } from "../store/sqlite";
import { runClaudeJson } from "./claude";
import { enrichSource } from "./preview";
import { config } from "../config";
import { log } from "../log";

interface RawSource {
  url: string;
  title: string;
  publisher?: string;
  publishedAt?: string;
}
interface RawIssue {
  title: string;
  summary: string;
  body: string;
  tags: string[];
  vtubers?: string[];
  eventDate: string;
  sources: RawSource[];
}
interface CollectOutput {
  issues: RawIssue[];
}

const SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "이슈 제목 (한국어, 60자 이내)" },
          summary: { type: "string", description: "한두 문장 요약 (150자 이내)" },
          body: { type: "string", description: "본문 마크다운 (사실 위주 2~5문단)" },
          tags: { type: "array", items: { type: "string" }, description: "태그 1~4개 (예: 데뷔, 졸업, 합방, 이벤트, 소속사, 기록, 플랫폼)" },
          vtubers: { type: "array", items: { type: "string" }, description: "관련 버튜버·소속사 이름" },
          eventDate: { type: "string", description: "사건/발표 날짜 YYYY-MM-DD (KST)" },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string", description: "검색 결과에서 실제로 확인한 원문 URL" },
                title: { type: "string" },
                publisher: { type: "string", description: "언론사·채널·플랫폼 이름" },
                publishedAt: { type: "string", description: "게시일 (알면 YYYY-MM-DD)" },
              },
              required: ["url", "title"],
            },
          },
        },
        required: ["title", "summary", "body", "tags", "eventDate", "sources"],
      },
    },
  },
  required: ["issues"],
} as const;

function kstNow(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().replace("T", " ").slice(0, 16) + " KST";
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function buildPrompt(windowHours: number, knownTitles: string[], popular: string[], maxIssues: number): string {
  return `당신은 한국 버튜버 정보 사이트 "버모아(VMOA)"의 뉴스 에디터다.
현재 시각: ${kstNow()}

## 할 일
웹 검색(WebSearch)과 페이지 확인(WebFetch)으로 최근 ${windowHours}시간 안에 나온
**한국 버튜버 씬의 이슈**를 찾아 최대 ${maxIssues}개를 정리한다. 마땅한 것이 없으면 빈 목록을 돌려준다.

대상: 치지직·SOOP(숲)·유튜브에서 활동하는 한국(어) 버튜버, 버튜버 소속사, 버튜버 관련 플랫폼 정책·이벤트.
참고 — 지금 시청자가 많은 버튜버 예시: ${popular.length ? popular.join(", ") : "(없음)"}

## 다룰 것 (공식 발표·언론 보도·공식 채널 게시물로 확인되는 사실만)
- 데뷔·신규 기수 공개, 졸업·활동 종료·휴방 공지(공식 공지 범위만)
- 소속사 발표, 콜라보·합동 방송, 대회·이벤트, 콘서트·굿즈·팝업
- 구독자·동접 기록 달성, 플랫폼(치지직·SOOP) 정책·기능 변경

## 다루지 않을 것
- 루머, 확인되지 않은 의혹·논란, 커뮤니티 추측, 저격·비방
- 사생활, 실명·신상 정보, 선정적·성인 콘텐츠
- 출처를 직접 확인하지 못한 내용, 이미 정리된 이슈(아래 목록)와 같은 사건

## 작성 규칙
- 모든 이슈에 출처 1~4개. URL 은 검색 결과나 WebFetch 로 **실제로 열어본 원문 주소만** (지어내지 말 것).
  가능하면 언론 기사·공식 공지·공식 유튜브 영상을 우선한다.
- 중립적인 한국어. 평가·추측·과장 금지. 출처에 없는 내용은 쓰지 않는다.
- eventDate 는 사건이나 발표가 있었던 날(KST).

## 이미 정리된 이슈 (중복 금지)
${knownTitles.length ? knownTitles.map((t) => `- ${t}`).join("\n") : "- (없음)"}
`;
}

function validDate(s: string | undefined): string | null {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export interface CollectSummary {
  found: number;
  added: string[];
  skipped: { title: string; reason: string }[];
  costUsd: number | null;
  durationMs: number;
}

/** 한 번 수집 실행. windowHours 를 안 주면 마지막 실행 이후 + 여유(최소 24h, 최대 7일). */
export async function collectIssues(store: SqliteStore, windowHours?: number): Promise<CollectSummary> {
  const last = store.getMeta("issues_last_success");
  const hours =
    windowHours ??
    (last
      ? Math.min(168, Math.max(24, Math.round((Date.now() - Date.parse(last)) / 3_600_000) + 24))
      : 168);
  const known = store.recentIssueTitles(30);
  const popular = store.getRanking(24 * 60, 25).map((r) => r.channelName);
  const max = Math.max(1, config.issuesMaxPerRun);

  log.info(`이슈 수집 시작 — 최근 ${hours}시간, 최대 ${max}개`);
  const res = await runClaudeJson<CollectOutput>(buildPrompt(hours, known, popular, max), SCHEMA, {
    tools: ["WebSearch", "WebFetch"],
  });

  const summary: CollectSummary = {
    found: res.output.issues?.length ?? 0,
    added: [],
    skipped: [],
    costUsd: res.costUsd,
    durationMs: res.durationMs,
  };
  const knownNorm = new Set(known.map(norm));

  for (const raw of (res.output.issues ?? []).slice(0, max)) {
    const title = (raw.title ?? "").trim();
    const skip = (reason: string) => summary.skipped.push({ title: title || "(제목 없음)", reason });

    if (title.length < 4 || (raw.body ?? "").trim().length < 40) { skip("내용 부족"); continue; }
    if (knownNorm.has(norm(title))) { skip("같은 제목 존재"); continue; }

    const urls = new Map<string, RawSource>();
    for (const s of raw.sources ?? []) {
      try {
        const u = new URL(s.url);
        if (u.protocol === "http:" || u.protocol === "https:") urls.set(u.toString(), { ...s, url: u.toString() });
      } catch {
        /* 잘못된 URL 은 버림 */
      }
    }
    const rawSources = [...urls.values()].slice(0, 4);
    if (rawSources.length === 0) { skip("출처 없음"); continue; }
    if (rawSources.some((s) => store.hasIssueSource(s.url))) { skip("이미 쓰인 출처"); continue; }

    const sources: IssueSource[] = await Promise.all(
      rawSources.map((s) =>
        enrichSource({ url: s.url, title: s.title || s.url, publisher: s.publisher ?? null, publishedAt: s.publishedAt ?? null }),
      ),
    );
    const eventDate = validDate(raw.eventDate) ?? new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const slug = `${eventDate}-${createHash("sha1").update(title).digest("hex").slice(0, 6)}`;
    const issue: NewIssue = {
      slug,
      title,
      summary: (raw.summary ?? "").trim(),
      body: raw.body.trim(),
      tags: (raw.tags ?? []).map((t) => t.replace(/^#/, "").trim()).filter(Boolean).slice(0, 4),
      vtubers: (raw.vtubers ?? []).map((v) => v.trim()).filter(Boolean).slice(0, 10),
      eventDate,
      origin: "auto",
      sources,
    };
    if (store.insertIssue(issue)) {
      summary.added.push(`${slug} ${title}`);
      knownNorm.add(norm(title));
    } else {
      skip("slug 중복");
    }
  }

  store.setMeta("issues_last_success", new Date().toISOString());
  log.info(
    `이슈 수집 완료 — 후보 ${summary.found} · 추가 ${summary.added.length} · 건너뜀 ${summary.skipped.length} · ${Math.round(summary.durationMs / 1000)}초`,
  );
  for (const a of summary.added) log.event(`  📰 ${a}`);
  for (const s of summary.skipped) log.info(`  (건너뜀) ${s.title} — ${s.reason}`);
  return summary;
}
