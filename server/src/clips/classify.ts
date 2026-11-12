// 키리누키 분류: Claude(구독, 헤드리스, 도구 없음)가 RSS 제목·설명만 보고
//  누가(버튜버) · 무엇을(category·topic) · 어떤 순간(대표 순간 + 보조) · 어떤 사건(event) · 원본 방송 · 한 줄 요약 을 정한다.
// 정책: 입력은 RSS 정보뿐 (YouTube API 데이터로 파생 데이터를 만들지 않음). 화면에는 "버모아 분류"로 표시.
//
// 새 클립이 없을 때는 예전 버전으로 분류된 클립을 "보강"한다 (대표 순간·주제 이름 통일·사건).
// 보강은 RSS 로 만들었던 기존 분류(요약·주제)를 재료로 하고, 제목은 videos.list 로 바뀐 적 없는 클립만 쓴다.
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { ClipClass, ClipEnrich, ClipRow } from "./store";
import { CATEGORY_IDS, CLIP_TAGS, MOMENT_IDS, clipTagById } from "./vocab";
import { canonicalTopic } from "./topics";
import { cleanSourceDate, extractSourceLinks, pickSource, type SourceLink } from "./source";
import { runClaudeJson } from "../issues/claude";
import { mappingTargets } from "../youtube/sync";
import { config } from "../config";
import { log } from "../log";

const MAX_TRIES = 3;
const MAX_CANDIDATES = 10;
const DESC_CHARS = 400;
/** 프롬프트에 보여 줄 기존 주제·사건 이름 수 */
const TOPIC_HINTS = 80;
const EVENT_HINTS = 60;
const EVENT_DAYS = 21;

interface NameEntry {
  platform: Platform;
  channelId: string;
  name: string;
  /** 프롬프트에 보이는 이름 (같은 이름이 여럿이면 플랫폼을 붙임) */
  label: string;
  full: string;
  parts: string[];
  rank: number;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 알려진 버튜버 이름 목록 (상위·방송 중·확정 목록 + 매핑 기록) */
export function buildNameIndex(store: SqliteStore): NameEntry[] {
  const seen = new Set<string>();
  const raw: Omit<NameEntry, "label">[] = [];
  const add = (platform: Platform, channelId: string, name: string) => {
    const k = `${platform}:${channelId}`;
    if (seen.has(k) || (platform !== "chzzk" && platform !== "soop")) return;
    seen.add(k);
    const full = norm(name);
    if (full.length < 2) return;
    // "유즈하 리코" → 유즈하리코 · 유즈하 · 리코, "하시요 HaSiyo" → 하시요 · hasiyo
    const parts = name
      .split(/[\s\p{P}\p{S}]+/u)
      .map(norm)
      .filter((p) => p.length >= 2 && p !== full);
    raw.push({ platform, channelId, name, full, parts, rank: raw.length });
  };
  for (const t of mappingTargets(store, 400)) add(t.platform, t.channelId, t.name);
  for (const l of store.youtube.listLinks()) add(l.platform, l.channelId, l.name);
  const count = new Map<string, number>();
  for (const e of raw) count.set(e.name, (count.get(e.name) ?? 0) + 1);
  return raw.map((e) => ({ ...e, label: (count.get(e.name) ?? 0) > 1 ? `${e.name} (${e.platform === "soop" ? "SOOP" : "치지직"})` : e.name }));
}

/** 클립 하나의 버튜버 후보: 이름 전체가 나오면 먼저, 채널을 처음 찾은 버튜버, 이름 일부가 나오는 버튜버 */
export function candidatesFor(clip: ClipRow, index: NameEntry[]): NameEntry[] {
  const hay = norm(`${clip.title} ${clip.description?.slice(0, 800) ?? ""} ${clip.channelTitle ?? ""}`);
  const full: NameEntry[] = [];
  const partial: NameEntry[] = [];
  for (const e of index) {
    if (hay.includes(e.full)) full.push(e);
    else if (e.parts.some((p) => hay.includes(p))) partial.push(e);
  }
  const hint = index.find((e) => e.platform === clip.hintPlatform && e.channelId === clip.hintChannelId);
  const out: NameEntry[] = [];
  for (const e of [...full, ...(hint ? [hint] : []), ...partial.sort((a, b) => a.rank - b.rank)]) {
    if (!out.includes(e)) out.push(e);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

// ---------------------------------------------------------------- 공통 규칙 (분류·보강)

const vocab = (kind: "category" | "moment") =>
  CLIP_TAGS.filter((t) => t.kind === kind)
    .map((t) => `- ${t.id}: ${t.label} — ${t.hint}`)
    .join("\n");

/** 기존 주제·사건 이름 — 같은 것이면 그대로 쓰게 프롬프트에 보여 준다 */
interface NameHints {
  topics: string[];
  events: string[];
}

function nameHints(store: SqliteStore): NameHints {
  return {
    topics: store.clips.allTopics(TOPIC_HINTS).map((t) => t.topic),
    events: store.clips.recentEvents(EVENT_DAYS, EVENT_HINTS).map((e) => e.event),
  };
}

function sharedRules(h: NameHints): string {
  return `- primaryMoment: 이 클립을 대표하는 순간 하나
${vocab("moment")}
  **funny(웃음)는 다른 순간(광기·사고·티키타카·레전드·귀여움 등)이 뚜렷하지 않을 때만 대표로 고른다.** 대부분의 클립이 웃기므로, 무엇 때문에 웃긴지를 대표로 고른다.
- moments: 대표 외에 뚜렷한 순간 0~2개 (대표는 넣지 않음, 위 목록에서만)
- topic: 무엇을 하는 장면인지 — 게임·콘텐츠의 **정식 이름** ("마크"→"마인크래프트", "롤"→"리그 오브 레전드"). 모르면 빈 문자열.
  아래 '이미 쓰는 주제' 중 같은 게임·콘텐츠가 있으면 **그 이름을 글자 그대로** 쓴다.
  이미 쓰는 주제: ${h.topics.length ? h.topics.join(", ") : "(아직 없음)"}
- event: 특정 사건·밈·에피소드를 다룬 클립이면 그 일을 부르는 짧은 이름 (12자 이내, 예: "김웅 고발", "치치 생일 콘서트", "봉누도2 엔딩"). 평범한 게임 장면·잡담처럼 이름 붙일 일이 아니면 빈 문자열.
  아래 '최근 사건' 중 같은 일이면 **그 이름을 글자 그대로** 쓴다. 다른 채널의 클립이라도 같은 일이면 같은 이름.
  최근 사건: ${h.events.length ? h.events.join(", ") : "(아직 없음)"}`;
}

function cleanEvent(raw: string | undefined): string | null {
  const t = (raw ?? "").replace(/["'“”‘’「」『』]/g, "").replace(/\s+/g, " ").trim();
  return t && t.length <= 20 ? t : null;
}

/** 대표 순간 + 보조 순간 → [대표, ...보조]. 웃음이 대표인데 다른 순간이 있으면 그 순간을 대표로 */
function orderMoments(primary: string | undefined, extras: string[] | undefined): string[] {
  const ok = (m: string | undefined): m is string => !!m && MOMENT_IDS.includes(m);
  let p = ok(primary) ? primary : undefined;
  let rest = [...new Set((extras ?? []).filter(ok))].filter((m) => m !== p);
  if (!p) {
    p = rest[0];
    rest = rest.slice(1);
  }
  if (p === "funny" && rest.length) {
    const first = rest[0]!;
    rest = ["funny", ...rest.slice(1)];
    p = first;
  }
  return p ? [p, ...rest].slice(0, 3) : [];
}

// ---------------------------------------------------------------- 새 클립 분류

const SCHEMA = {
  type: "object",
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "영상 번호" },
          isClip: { type: "boolean", description: "버튜버 방송을 편집한 클립이면 true" },
          vtubers: { type: "array", items: { type: "string" }, description: "나오는 버튜버 (그 영상의 후보 이름 그대로, 주인공 먼저)" },
          category: { type: "string", enum: CATEGORY_IDS },
          topic: { type: "string", description: "게임·콘텐츠 정식 이름. 모르면 빈 문자열" },
          primaryMoment: { type: "string", enum: MOMENT_IDS },
          moments: { type: "array", items: { type: "string", enum: MOMENT_IDS }, description: "대표 외 뚜렷한 순간 0~2개" },
          event: { type: "string", description: "사건·밈 이름, 없으면 빈 문자열" },
          sourceLink: { type: "integer", description: "원본 방송 다시보기 링크 번호, 없으면 0" },
          sourceDate: { type: "string", description: "원본 방송 날짜 YYYY-MM-DD, 모르면 빈 문자열" },
          summary: { type: "string", description: "한 줄 요약 40자 이내" },
        },
        required: ["n", "isClip", "vtubers", "category", "topic", "primaryMoment", "moments", "event", "sourceLink", "sourceDate", "summary"],
      },
    },
  },
  required: ["clips"],
} as const;

function buildPrompt(clips: ClipRow[], cands: NameEntry[][], links: SourceLink[][], h: NameHints): string {
  const items = clips
    .map((c, i) => {
      const desc = (c.description ?? "").replace(/\s+/g, " ").trim().slice(0, DESC_CHARS);
      const ls = links[i]!;
      return [
        `[${i + 1}]`,
        `채널: ${c.channelTitle ?? "-"}`,
        `제목: ${c.title}`,
        `설명: ${desc || "-"}`,
        `링크: ${ls.length ? ls.map((l, j) => `(${j + 1}) ${l.url}`).join("  ") : "(없음)"}`,
        `후보: ${cands[i]!.map((e) => e.label).join(", ") || "(없음)"}`,
      ].join("\n");
    })
    .join("\n\n");
  return `당신은 한국 버튜버 정보 사이트 "버모아(VMOA)"의 클립 분류 담당이다.
아래는 유튜브 키리누키(팬이 방송을 잘라 편집한 클립) 채널의 영상들이다. **제목·설명만 보고** 각 영상을 분류한다. 검색하지 않는다.
분류는 "이 클립을 본 사람에게 무엇을 더 추천할지"에 쓰인다 — 같은 사건, 같은 게임, 같은 결의 순간을 정확히 잡는 것이 중요하다.

## 규칙
- isClip: 버튜버 방송(치지직·SOOP·유튜브 라이브)을 편집한 클립이면 true.
  버튜버와 무관한 영상, 채널 공지, 원곡 음원만 올린 영상, 광고, 방송 전체를 그대로 올린 다시보기·풀영상은 false (false 면 나머지는 대충 채워도 됨).
- vtubers: 영상에 실제로 나오는 버튜버. **그 영상의 '후보' 이름 중에서만, 적힌 그대로** 고른다. 주인공을 먼저. 확실하지 않으면 넣지 않는다.
  후보 이름의 일부(예: "유즈하 리코" → "리코")만 제목에 있어도 문맥상 같은 사람이면 고른다.
- category: 무엇을 하는 방송인지 하나
${vocab("category")}
${sharedRules(h)}
- sourceLink: '링크' 중 이 클립의 **원본 방송 다시보기**(치지직·SOOP 다시보기, 버튜버 본인 유튜브 방송)의 번호. 다른 클립·채널 홍보·음원 링크면 고르지 않는다. 없으면 0.
- sourceDate: 제목·설명에 원본 방송 날짜가 있으면 YYYY-MM-DD (예: "25.11.03 방송" → 2025-11-03). 없으면 빈 문자열.
- summary: 무슨 장면인지 한 줄 요약. 40자 이내, 명사형으로 끝냄(예: "공포게임에서 귀신 보고 기절하는 리코"). 제목을 그대로 베끼지 않는다.
- 영상마다 하나씩, 번호(n)를 맞춰 모두 답한다.

## 영상
${items}
`;
}

interface RawOut {
  n: number;
  isClip: boolean;
  vtubers: string[];
  category: string;
  topic: string;
  primaryMoment: string;
  moments: string[];
  event: string;
  sourceLink: number;
  sourceDate: string;
  summary: string;
}

const clean = (s: string | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Claude 출력 → 저장할 분류 (어휘·후보 밖의 값은 버림) */
export function toClassification(
  clip: ClipRow,
  cands: NameEntry[],
  o: RawOut,
  links: SourceLink[] = [],
  aliases: Map<string, string> = new Map(),
): ClipClass {
  const byLabel = new Map(cands.map((e) => [e.label, e]));
  const byName = new Map(cands.map((e) => [e.name, e]));
  const vtubers: { platform: Platform; channelId: string }[] = [];
  for (const v of o.vtubers ?? []) {
    const e = byLabel.get(v.trim()) ?? byName.get(v.trim());
    if (e && !vtubers.some((x) => x.platform === e.platform && x.channelId === e.channelId)) {
      vtubers.push({ platform: e.platform, channelId: e.channelId });
    }
  }
  const source = pickSource(links, o.sourceLink);
  return {
    videoId: clip.videoId,
    isClip: !!o.isClip,
    category: CATEGORY_IDS.includes(o.category) ? o.category : "etc",
    topic: canonicalTopic(clean(o.topic, 40), aliases),
    summary: clean(o.summary, 60),
    moments: orderMoments(o.primaryMoment, o.moments),
    vtubers,
    event: cleanEvent(o.event),
    source: source ? { url: source.url, key: source.key } : null,
    sourceDate: cleanSourceDate(o.sourceDate, clip.publishedAt),
  };
}

// ---------------------------------------------------------------- 기존 클립 보강

const ENRICH_SCHEMA = {
  type: "object",
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          topic: { type: "string" },
          primaryMoment: { type: "string", enum: MOMENT_IDS },
          moments: { type: "array", items: { type: "string", enum: MOMENT_IDS } },
          event: { type: "string" },
        },
        required: ["n", "topic", "primaryMoment", "moments", "event"],
      },
    },
  },
  required: ["clips"],
} as const;

function buildEnrichPrompt(clips: ClipRow[], names: Map<string, string>, h: NameHints): string {
  const label = (id: string | null) => (id ? clipTagById(id)?.label ?? id : "-");
  const items = clips
    .map((c, i) =>
      [
        `[${i + 1}]`,
        `채널: ${c.channelTitle ?? "-"}`,
        // videos.list 로 제목이 바뀌었을 수 있는 클립은 제목을 넣지 않는다 (API 데이터로 분류를 만들지 않게)
        c.checkedAt ? null : `제목: ${c.title}`,
        `요약: ${c.summary ?? "-"}`,
        `주제: ${c.topic ?? "-"}`,
        `카테고리: ${label(c.category)}`,
        `기존 순간: ${c.moments.map(label).join(", ") || "-"}`,
        `나오는 버튜버: ${c.vtubers.map((v) => names.get(v.channelId) ?? v.channelId).join(", ") || "-"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  return `당신은 한국 버튜버 정보 사이트 "버모아(VMOA)"의 클립 분류 담당이다.
아래는 이미 분류한 키리누키(팬이 방송을 잘라 편집한 클립)들이다. 추천에 쓰려고 분류를 **보강**한다. 검색하지 않는다.

## 규칙
${sharedRules(h)}
- 주어진 정보(채널·제목·요약·주제·기존 순간)로 판단한다. 기존 순간은 참고만 하고, 더 맞는 것이 있으면 바꾼다.
- 영상마다 하나씩, 번호(n)를 맞춰 모두 답한다.

## 클립
${items}
`;
}

interface RawEnrich {
  n: number;
  topic: string;
  primaryMoment: string;
  moments: string[];
  event: string;
}

export function toEnrichment(clip: ClipRow, o: RawEnrich, aliases: Map<string, string> = new Map()): ClipEnrich {
  return {
    videoId: clip.videoId,
    moments: orderMoments(o.primaryMoment, o.moments),
    topic: canonicalTopic(clean(o.topic, 40), aliases) ?? clip.topic,
    event: cleanEvent(o.event),
  };
}

// ---------------------------------------------------------------- 실행

export interface ClassifySummary {
  mode: "classify" | "enrich" | "idle";
  pending: number;
  classified: number;
  clips: number;
  notClips: number;
  failed: number;
  enriched: number;
  blockedChannels: string[];
  durationMs: number;
}

/**
 * 분류 1회. 분류 대기 클립이 있으면 최신부터 batch 개를 분류하고,
 * 없으면 예전 버전 클립을 보강한다 (config.clipsEnrichBatch). 둘 다 없으면 Claude 를 부르지 않는다.
 */
export async function classifyClips(store: SqliteStore, batch = config.clipsClassifyBatch): Promise<ClassifySummary> {
  const repo = store.clips;
  const pending = repo.pendingClips(Math.max(1, batch), MAX_TRIES);
  const summary: ClassifySummary = {
    mode: "idle",
    pending: pending.length,
    classified: 0,
    clips: 0,
    notClips: 0,
    failed: 0,
    enriched: 0,
    blockedChannels: [],
    durationMs: 0,
  };
  if (pending.length === 0) return enrichClips(store, summary);
  summary.mode = "classify";

  const index = buildNameIndex(store);
  const cands = pending.map((c) => candidatesFor(c, index));
  const links = pending.map((c) => extractSourceLinks(c.description, c.videoId));
  const aliases = repo.topicAliasMap();
  const res = await runClaudeJson<{ clips: RawOut[] }>(buildPrompt(pending, cands, links, nameHints(store)), SCHEMA, {
    tools: [],
    timeoutMs: 10 * 60_000,
  });
  summary.durationMs = res.durationMs;

  const byN = new Map((res.output.clips ?? []).map((o) => [o.n, o]));
  const results: ClipClass[] = [];
  const missing: string[] = [];
  pending.forEach((c, i) => {
    const o = byN.get(i + 1);
    if (!o) missing.push(c.videoId);
    else results.push(toClassification(c, cands[i]!, o, links[i]!, aliases));
  });
  repo.saveClassification(results);
  if (missing.length) repo.markClassFailed(missing);
  summary.classified = results.length;
  summary.clips = results.filter((r) => r.isClip).length;
  summary.notClips = results.length - summary.clips;
  summary.failed = missing.length;

  // 클립이 아닌 영상이 대부분인 자동 등록 채널은 차단 (운영자가 승인한 채널은 그대로)
  for (const ch of new Set(pending.map((c) => c.ytChannelId))) {
    const info = repo.getChannel(ch);
    if (info?.status !== "auto") continue;
    const s = repo.channelClassStats(ch);
    const total = s.done + s.notClip;
    if (total >= 8 && s.notClip / total >= 0.7) {
      repo.setChannelStatus(ch, "blocked", "not_clips");
      summary.blockedChannels.push(info.title ?? ch);
    }
  }
  log.info(
    `키리누키 분류: ${summary.classified}개 (클립 ${summary.clips} · 클립 아님 ${summary.notClips}${summary.failed ? ` · 누락 ${summary.failed}` : ""}) · ` +
      `사건 ${results.filter((r) => r.event).length} · 원본 방송 ${results.filter((r) => r.source).length} · ${Math.round(summary.durationMs / 1000)}초` +
      (summary.blockedChannels.length ? ` · 차단 ${summary.blockedChannels.join(", ")}` : ""),
  );
  return summary;
}

/** 예전 버전으로 분류된 클립 보강 (대표 순간·주제 통일·사건) */
export async function enrichClips(store: SqliteStore, summary?: ClassifySummary, batch = config.clipsEnrichBatch): Promise<ClassifySummary> {
  const out: ClassifySummary = summary ?? {
    mode: "idle",
    pending: 0,
    classified: 0,
    clips: 0,
    notClips: 0,
    failed: 0,
    enriched: 0,
    blockedChannels: [],
    durationMs: 0,
  };
  if (batch <= 0) return out;
  const repo = store.clips;
  const pool = repo.enrichPool(batch);
  if (pool.length === 0) return out;
  out.mode = "enrich";
  const names = store.channelNames(pool.flatMap((c) => c.vtubers.map((v) => v.channelId)));
  const aliases = repo.topicAliasMap();
  const res = await runClaudeJson<{ clips: RawEnrich[] }>(buildEnrichPrompt(pool, names, nameHints(store)), ENRICH_SCHEMA, {
    tools: [],
    timeoutMs: 10 * 60_000,
  });
  out.durationMs = res.durationMs;
  const byN = new Map((res.output.clips ?? []).map((o) => [o.n, o]));
  const results: ClipEnrich[] = [];
  pool.forEach((c, i) => {
    const o = byN.get(i + 1);
    if (o) results.push(toEnrichment(c, o, aliases));
  });
  repo.saveEnrichment(results);
  out.enriched = results.length;
  out.failed = pool.length - results.length;
  log.info(
    `키리누키 보강: ${results.length}/${pool.length}개 · 사건 ${results.filter((r) => r.event).length} · ` +
      `대표 순간 웃음 ${results.filter((r) => r.moments[0] === "funny").length} · ${Math.round(out.durationMs / 1000)}초 · ` +
      `남은 보강 ${JSON.stringify(repo.classVerCounts())}`,
  );
  return out;
}
